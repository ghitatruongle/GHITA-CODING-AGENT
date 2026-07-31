use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Listener, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::RwLock;

mod proxy;
use proxy::{get_proxy_port, start_proxy_server, stop_proxy_server, ProxyState};

mod computer_use;
use computer_use::ComputerUseState;

mod terminal;
use terminal::TerminalManager;

// --- Server sidecar state ---
struct ServerState {
    child: Option<std::process::Child>,
    port: u16,
    http_client: reqwest::Client,
    /// Guard flag to prevent concurrent start_server calls (race-condition safe)
    starting: bool,
}

// --- Security state for IPC ---
struct SecurityState {
    session_token: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ApprovedCommandResult {
    stdout: String,
    stderr: String,
    code: Option<i32>,
    success: bool,
}

pub fn command_is_blocked(command: &str) -> bool {
    let normalized = command.to_ascii_lowercase();
    let compact = normalized.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.contains("rm -rf /")
        || compact.contains("rm -rf ~")
        || compact.contains("format c:")
        || compact.contains("format.com c:")
        || compact.contains("mkfs.")
        || compact.contains("dd if=")
        || compact.contains(":(){ :|:& };:")
        || compact.contains("shutdown ")
        || compact.contains("reboot")
        || compact.contains("remove-item c:\\ -recurse")
        || compact.contains("remove-item -recurse c:\\")
}

pub fn clamp_command_timeout(timeout_ms: Option<u64>) -> u64 {
    timeout_ms.unwrap_or(120_000).clamp(1_000, 300_000)
}

#[tauri::command]
async fn execute_approved_command(
    app: tauri::AppHandle,
    command: String,
    shell: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ApprovedCommandResult, String> {
    if command.trim().is_empty() || command.len() > 16_384 {
        return Err("Command is empty or exceeds the 16 KiB safety limit.".to_string());
    }
    if command_is_blocked(&command) {
        return Err("Command blocked by the native security policy.".to_string());
    }

    // Renderer state is not a trust boundary. Always obtain approval from a
    // native dialog instead of accepting a caller-controlled boolean over IPC.
    let command_preview = if command.chars().count() > 2_000 {
        format!("{}…", command.chars().take(2_000).collect::<String>())
    } else {
        command.clone()
    };
    let approved = app
        .dialog()
        .message(format!(
            "Allow GHITA to execute this command?\n\n{command_preview}"
        ))
        .title("Approve terminal command")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show();
    if !approved {
        return Err("Explicit user approval is required.".to_string());
    }

    let (program, args): (&str, Vec<&str>) = if cfg!(target_os = "windows") {
        match shell.as_str() {
            "powershell" | "bash" | "sh" => (
                "powershell.exe",
                vec![
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    command.as_str(),
                ],
            ),
            "cmd" => ("cmd.exe", vec!["/d", "/s", "/c", command.as_str()]),
            _ => return Err("Unsupported shell.".to_string()),
        }
    } else {
        match shell.as_str() {
            "bash" => ("bash", vec!["-c", command.as_str()]),
            "sh" | "cmd" | "powershell" => ("sh", vec!["-c", command.as_str()]),
            _ => return Err("Unsupported shell.".to_string()),
        }
    };

    let mut process = tokio::process::Command::new(program);
    process
        .args(args)
        .kill_on_drop(true)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = cwd {
        let directory = std::path::PathBuf::from(cwd);
        if !directory.is_dir() {
            return Err("Working directory does not exist or is not a directory.".to_string());
        }
        process.current_dir(directory);
    }

    let timeout_ms = clamp_command_timeout(timeout_ms);
    let output = tokio::time::timeout(Duration::from_millis(timeout_ms), process.output())
        .await
        .map_err(|_| format!("Approved command timed out after {timeout_ms} ms."))?
        .map_err(|e| format!("Failed to execute approved command: {e}"))?;

    Ok(ApprovedCommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        code: output.status.code(),
        success: output.status.success(),
    })
}

#[tauri::command]
fn get_session_token(state: tauri::State<'_, SecurityState>) -> String {
    state.session_token.clone()
}

pub fn generate_session_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let r1: u64 = rng.gen();
    let r2: u64 = rng.gen();
    format!("{:016x}{:016x}", r1, r2)
}

/// Pick the first free TCP port in the range [preferred, preferred + 32).
///
/// RESILIENCE (audit fix 3.9): previously `start_server` used the
/// hard-coded `port: 8080` from `ServerState`. If another process on
/// the host (e.g. a dev server, the proxy, or another Tauri app) had
/// bound 8080, the sidecar crashed at startup with "Address already in
/// use" and the UI was left with no server. We now scan up to 32
/// ports starting at the configured base and pick the first one
/// `bind()` succeeds on. If none are free we return an error rather
/// than crashing.
pub fn find_free_port(preferred: u16) -> std::io::Result<u16> {
    for offset in 0u16..32 {
        let candidate = preferred.saturating_add(offset);
        if std::net::TcpListener::bind(("127.0.0.1", candidate)).is_ok() {
            return Ok(candidate);
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AddrInUse,
        format!(
            "no free port in range {}-{}",
            preferred,
            preferred.saturating_add(31)
        ),
    ))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to GHITA CODING AGENT.", name)
}

/// Result of a bundled-node integrity check (audit fix M8).
enum NodeIntegrity {
    /// `node.sha256` present and matched the binary.
    Ok,
    /// No `node.sha256` manifest shipped — nothing to verify against.
    NoManifest,
    /// Manifest present but the digest did NOT match.
    Mismatch,
}

/// Verify a bundled `node` binary against a sibling `node.sha256` manifest.
///
/// The manifest is a text file whose first whitespace-delimited token is the
/// lowercase hex SHA-256 of the binary (the common `sha256sum` format). When no
/// manifest is present we return `NoManifest` so packagers that do not ship one
/// keep working; a present-but-wrong digest returns `Mismatch`.
fn verify_bundled_node(node_path: &std::path::Path) -> NodeIntegrity {
    use sha2::{Digest, Sha256};
    let manifest_path = node_path.with_file_name("node.sha256");
    let expected = match fs::read_to_string(&manifest_path) {
        Ok(text) => text,
        Err(_) => return NodeIntegrity::NoManifest,
    };
    let expected_hex = expected
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_lowercase();
    if expected_hex.len() != 64 {
        return NodeIntegrity::NoManifest;
    }
    let bytes = match fs::read(node_path) {
        Ok(b) => b,
        Err(_) => return NodeIntegrity::Mismatch,
    };
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual_hex = hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();
    if actual_hex == expected_hex {
        NodeIntegrity::Ok
    } else {
        NodeIntegrity::Mismatch
    }
}

#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<String, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            update
                .download_and_install(|_chunk, _total| {}, || {})
                .await
                .map_err(|e| e.to_string())?;
            Ok(format!("Updated to version {}", version))
        }
        Ok(None) => Ok("Already up to date".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

/// Start the communication server sidecar
#[tauri::command]
async fn start_server(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<ServerState>>,
    security_state: tauri::State<'_, SecurityState>,
) -> Result<String, String> {
    // Atomic guard: check + lock under a single lock acquisition to prevent race conditions
    // (StrictMode or multiple UI triggers could call start_server concurrently)
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        if s.child.is_some() {
            return Ok("Server already running".to_string());
        }
        if s.starting {
            return Ok("Server is already starting".to_string());
        }
        s.starting = true;
    }

    let preferred_port = state.lock().map_err(|e| e.to_string())?.port;
    // RESILIENCE (audit fix 3.9): scan for a free port instead of
    // assuming the configured one is available. The selected port is
    // written back to ServerState so downstream commands (proxy,
    // status) see the actual bound port.
    let port = find_free_port(preferred_port).map_err(|e| e.to_string())?;
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.port = port;
    }
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let session_token = security_state.session_token.clone();
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    // Heavy I/O (filesystem reads, process spawn) on a blocking thread
    let spawn_result = tokio::task::spawn_blocking(move || {
        // Try multiple possible locations for the server script.
        //
        // SECURITY/PORTABILITY (audit fix 3.2): the previous version only
        // searched relative to the executable directory. On installed
        // builds (NSIS / MSI / .deb / .AppImage) the layout is different
        // and the sidecar was unlocatable. We now also probe the Tauri
        // resource directory which is the canonical install location.
        let mut candidates = Vec::new();

        #[cfg(debug_assertions)]
        {
            // Prioritize workspace source directory during development to run the latest bundle
            candidates.push(
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("sidecar")
                    .join("server.bundle.mjs"),
            );
            candidates.push(
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("sidecar")
                    .join("server.mjs"),
            );
        }

        // Tauri resource dir is the canonical install location
        candidates.push(resource_dir.join("sidecar").join("server.bundle.mjs"));
        candidates.push(resource_dir.join("sidecar").join("server.mjs"));
        candidates.push(resource_dir.join("server.bundle.mjs"));
        candidates.push(resource_dir.join("server.mjs"));

        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default();

        candidates.push(exe_dir.join("sidecar").join("server.bundle.mjs"));
        candidates.push(exe_dir.join("sidecar").join("server.mjs"));
        candidates.push(exe_dir.join("../sidecar/server.bundle.mjs"));
        candidates.push(exe_dir.join("../sidecar/server.mjs"));
        candidates.push(exe_dir.join("../../src-tauri/sidecar/server.bundle.mjs"));
        candidates.push(exe_dir.join("../../src-tauri/sidecar/server.mjs"));

        let server_script = candidates
            .iter()
            .find(|p| p.exists())
            .ok_or_else(|| {
                format!(
                    "sidecar server script not found. Searched: {}",
                    candidates
                        .iter()
                        .map(|p| p.display().to_string())
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            })?;

        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

        let bundled_node = server_script
            .parent()
            .map(|dir| dir.join(format!("node{}", std::env::consts::EXE_SUFFIX)))
            .filter(|path| path.exists());

        // SECURITY (audit fix M8): before executing a bundled `node` runtime,
        // verify its SHA-256 against an expected digest shipped as
        // `node.sha256` next to it. If the manifest exists and does NOT match,
        // refuse the bundled binary and fall back to the system `node` on PATH
        // (which the OS trusts) rather than running a possibly-tampered file.
        let bundled_node = match bundled_node {
            Some(path) => match verify_bundled_node(&path) {
                NodeIntegrity::Ok | NodeIntegrity::NoManifest => Some(path),
                NodeIntegrity::Mismatch => {
                    eprintln!(
                        "[GHITA] Bundled node integrity check FAILED for {} \u{2014} falling back to system node",
                        path.display()
                    );
                    None
                }
            },
            None => None,
        };
        let node_command = bundled_node
            .as_ref()
            .map(|path| path.as_os_str())
            .unwrap_or_else(|| std::ffi::OsStr::new("node"));

        let lan_config_path = data_dir.join("lan-enabled.txt");
        let lan_enabled = fs::read_to_string(&lan_config_path).unwrap_or_default().trim() == "true";

        let child = std::process::Command::new(node_command)
            .arg(server_script)
            .env("GHITA_PORT", port.to_string())
            .env("GHITA_DATA_DIR", &data_dir)
            .env("GHITA_LAN_ENABLED", if lan_enabled { "1" } else { "0" })
            // RESILIENCE (audit fix 3.9): disabled auto port liberation
            // to prevent force-killing other processes. Dynamic port
            // allocation via find_free_port() handles port conflicts.
            .env("GHITA_LIBERATE_PORTS", "0")
            .env("GHITA_SESSION_TOKEN", session_token)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to start sidecar server: {}", e))?;

        Ok::<std::process::Child, String>(child)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    // If spawn failed, reset starting flag before returning error
    let mut child = match spawn_result {
        Ok(c) => c,
        Err(e) => {
            if let Ok(mut s) = state.lock() {
                s.starting = false;
            }
            return Err(e);
        }
    };

    // Spawn a thread to read stdout line-by-line
    if let Some(stdout) = child.stdout.take() {
        let app_handle = app_handle.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line_str in reader.lines().map_while(Result::ok) {
                if let Some(payload) = line_str.strip_prefix("__GHITA_IPC__:") {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(payload) {
                        let _ = app_handle.emit("sidecar-event", parsed);
                    } else {
                        eprintln!("[sidecar] malformed IPC payload: {}", payload);
                    }
                } else {
                    // Print ordinary log to console
                    println!("{}", line_str);
                }
            }
        });
    }

    // Store child handle and clear starting flag under lock
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.child = Some(child);
        s.starting = false;
    }
    Ok(format!("Server starting on port {}", port))
}

/// Stop the communication server sidecar
#[tauri::command]
fn stop_server(state: tauri::State<'_, Mutex<ServerState>>) -> Result<String, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = s.child.take() {
        // Try graceful kill
        let _ = child.kill();
        let _ = child.wait();
        Ok("Server stopped".to_string())
    } else {
        Ok("Server is not running".to_string())
    }
}

/// Get local IP addresses for LAN connection
#[tauri::command]
fn get_local_ips() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (_name, ip) in interfaces {
            let ip_str = ip.to_string();
            // Only include IPv4 non-loopback addresses
            if !ip_str.starts_with("127.") && !ip_str.starts_with("::") && ip_str.contains('.') {
                ips.push(ip_str);
            }
        }
    }
    ips
}

#[tauri::command]
async fn get_server_status(
    state: tauri::State<'_, Mutex<ServerState>>,
) -> Result<serde_json::Value, String> {
    let (running, port, client) = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        // Check if the process has exited
        if let Some(ref mut child) = s.child {
            if let Ok(Some(_status)) = child.try_wait() {
                // Process has exited, clean up state
                s.child = None;
            }
        }
        (s.child.is_some(), s.port, s.http_client.clone())
    };

    // Collect local IPs
    let mut ips = Vec::new();
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (_name, ip) in interfaces {
            let ip_str = ip.to_string();
            if !ip_str.starts_with("127.") && !ip_str.starts_with("::") && ip_str.contains('.') {
                ips.push(ip_str);
            }
        }
    }

    // If running, try to fetch health endpoint
    if running {
        let url = format!("http://127.0.0.1:{}/health", port);

        if let Ok(resp) = client.get(&url).send().await {
            if let Ok(mut json) = resp.json::<serde_json::Value>().await {
                // Inject local IPs into response
                json["localIps"] = serde_json::json!(ips);
                return Ok(json);
            }
        }
        // Server process exists but health check failed
        return Ok(serde_json::json!({
            "status": "starting",
            "port": port,
            "localIps": ips
        }));
    }

    Ok(serde_json::json!({
        "status": "stopped",
        "port": port,
        "localIps": ips
    }))
}

// --- DocsGriller types (must match frontend GrillSession interface) ---
#[derive(serde::Serialize)]
struct GrillContradiction {
    topic: String,
    doc_a: GrillDocRef,
    doc_b: GrillDocRef,
    severity: String,
    recommendation: String,
}

#[derive(serde::Serialize)]
struct GrillDocRef {
    file: String,
    excerpt: String,
}

#[derive(serde::Serialize)]
struct GrillQuestion {
    question: String,
    source_docs: Vec<String>,
    severity: String,
}

#[derive(serde::Serialize)]
struct GrillSession {
    id: String,
    timestamp: String,
    docs_path: String,
    docs_scanned: u32,
    questions: Vec<GrillQuestion>,
    contradictions: Vec<GrillContradiction>,
    user_answers: std::collections::HashMap<String, String>,
    design_decisions: Vec<String>,
}

/// Run a DocsGriller session: scan docs directory for markdown files and
/// return a session with analysis results. Currently returns a stub session
/// with file count; full Socratic analysis is planned for v2.0.
#[tauri::command]
fn run_grill_session(docs_path: String) -> Result<GrillSession, String> {
    let path = std::path::PathBuf::from(&docs_path);
    if !path.exists() {
        return Err(format!("Docs path does not exist: {}", docs_path));
    }
    if !path.is_dir() {
        return Err(format!("Docs path is not a directory: {}", docs_path));
    }

    // Count markdown files in the directory
    let mut docs_scanned: u32 = 0;
    fn count_md(dir: &std::path::Path, count: &mut u32) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    count_md(&p, count);
                } else if p.extension().is_some_and(|e| e == "md" || e == "mdx") {
                    *count += 1;
                }
            }
        }
    }
    count_md(&path, &mut docs_scanned);

    let session_id = format!(
        "grill_{:016x}{:016x}",
        rand::random::<u64>(),
        rand::random::<u64>()
    );

    Ok(GrillSession {
        id: session_id,
        timestamp: chrono::Utc::now().to_rfc3339(),
        docs_path,
        docs_scanned,
        questions: Vec::new(),
        contradictions: Vec::new(),
        user_answers: std::collections::HashMap::new(),
        design_decisions: Vec::new(),
    })
}

fn app_storage_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(file_name))
}

fn api_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_storage_path(app, "api-config.json")
}

fn api_config_keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.ghita.coding-agent", "api-config")
        .map_err(|e| format!("Failed to open the operating-system credential vault: {e}"))
}

fn chat_sessions_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_storage_path(app, "chat-sessions.json")
}

#[tauri::command]
fn load_api_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let entry = api_config_keyring_entry()?;
    match entry.get_password() {
        Ok(content) => return serde_json::from_str(&content).map_err(|e| e.to_string()),
        Err(keyring::Error::NoEntry) => {}
        Err(e) => {
            return Err(format!(
                "Failed to read API keys from the credential vault: {e}"
            ))
        }
    }

    // One-time migration from versions <=0.4.9. The legacy plaintext file is
    // removed only after the credential vault confirms the write.
    let legacy_path = api_config_path(&app)?;
    if !legacy_path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(&legacy_path).map_err(|e| e.to_string())?;
    let parsed = serde_json::from_str::<serde_json::Value>(&content).map_err(|e| e.to_string())?;
    entry
        .set_password(&content)
        .map_err(|e| format!("Failed to migrate API keys to the credential vault: {e}"))?;
    fs::remove_file(&legacy_path)
        .map_err(|e| format!("API keys migrated, but the legacy file could not be removed: {e}"))?;
    Ok(parsed)
}

#[tauri::command]
fn save_api_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let content = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    api_config_keyring_entry()?
        .set_password(&content)
        .map_err(|e| format!("Failed to store API keys in the credential vault: {e}"))?;

    let legacy_path = api_config_path(&app)?;
    if legacy_path.exists() {
        fs::remove_file(legacy_path).map_err(|e| {
            format!("API keys saved, but the legacy file could not be removed: {e}")
        })?;
    }
    Ok(())
}

#[tauri::command]
fn get_lan_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("lan-enabled.txt");
    if !path.exists() {
        return Ok(false);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(content.trim() == "true")
}

#[tauri::command]
fn set_lan_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("lan-enabled.txt");
    fs::write(path, if enabled { "true" } else { "false" }).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_chat_sessions(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = chat_sessions_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({
            "sessions": [],
            "activeSessionId": serde_json::Value::Null
        }));
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_chat_sessions(app: tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let path = chat_sessions_path(&app)?;
    let content = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_proxy(
    target_url: String,
    port: u16,
    state: tauri::State<'_, Arc<RwLock<ProxyState>>>,
) -> Result<u16, String> {
    {
        let mut s = state.write().await;
        if s.is_running {
            s.target_url = target_url;
            return Ok(s.port);
        }
    }

    start_proxy_server(port, target_url, state.inner().clone()).await?;
    let actual_port = get_proxy_port(state.inner())
        .await
        .ok_or("Proxy started but port unknown")?;
    Ok(actual_port)
}

#[tauri::command]
async fn stop_proxy(state: tauri::State<'_, Arc<RwLock<ProxyState>>>) -> Result<(), String> {
    stop_proxy_server(state.inner().clone()).await
}

#[tauri::command]
async fn get_proxy_status(
    state: tauri::State<'_, Arc<RwLock<ProxyState>>>,
) -> Result<serde_json::Value, String> {
    let s = state.read().await;
    Ok(serde_json::json!({
        "running": s.is_running,
        "port": s.port
    }))
}

#[tauri::command]
fn get_proxy_url(port: u16, path: String) -> Result<String, String> {
    build_proxy_url(port, &path)
}

pub fn build_proxy_url(port: u16, path: &str) -> Result<String, String> {
    // Sanitize path to prevent URL injection.
    // The previous implementation only checked for `@`, `://`, and `\\`,
    // which let percent-encoded sequences (e.g. `..%2F..%2Fetc%2Fpasswd`)
    // bypass the filter. Decode the path first, then verify that:
    //   1. It does not contain URL-scheme separators (`://`)
    //   2. It does not contain `..` (parent-directory escape)
    //   3. It does not contain `@` (userinfo injection) or `\\` (Windows UNC)
    let trimmed = path.trim_start_matches('/');
    let decoded = percent_encoding::percent_decode_str(trimmed)
        .decode_utf8_lossy()
        .into_owned();
    if decoded.contains("://")
        || decoded.contains('@')
        || decoded.contains('\\')
        || decoded.split(['/', '\\']).any(|seg| seg == "..")
    {
        return Err("Invalid path characters".to_string());
    }
    // Preserve the originally-provided form (still safe) so the URL works
    // with whatever casing/encoding the caller used.
    Ok(format!("http://127.0.0.1:{}/{}", port, trimmed))
}

pub fn resolve_shell_for_platform(shell_type: &str) -> String {
    terminal::resolve_shell(shell_type)
}

// Sandbox commands — not yet implemented (Docker integration planned for v2.0)
// These return structured JSON so the frontend can display a meaningful status
// instead of silently failing or showing empty data.
#[tauri::command]
fn get_sandbox_containers() -> Result<Vec<serde_json::Value>, String> {
    // TODO(v2.0): Implement Docker sandbox integration
    Ok(Vec::new())
}

#[tauri::command]
fn get_sandbox_summary() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "status": "not_ready",
        "message": "Docker sandbox not configured. Coming in v2.0.",
        "containers": 0,
        "ready": false,
    }))
}

#[tauri::command]
fn get_sandbox_logs() -> Result<String, String> {
    Ok("Sandbox not available. Configure Docker to enable sandbox execution.".to_string())
}

/// Graceful cleanup of all child processes and resources before the app exits.
/// Called from both `WindowEvent::CloseRequested` and `RunEvent::Exit` to
/// ensure the sidecar server, proxy, and PTY sessions are all terminated.
fn cleanup_before_exit(app_handle: &tauri::AppHandle) {
    // Kill sidecar server
    if let Some(state) = app_handle.try_state::<Mutex<ServerState>>() {
        if let Ok(mut s) = state.lock() {
            if let Some(mut child) = s.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    // Stop proxy — block until write lock acquired (don't silently fail during shutdown)
    if let Some(proxy_state) = app_handle.try_state::<Arc<RwLock<ProxyState>>>() {
        let proxy = proxy_state.clone();
        tauri::async_runtime::block_on(async move {
            let mut s = proxy.write().await;
            s.is_running = false;
            if let Some(tx) = s.shutdown_tx.take() {
                let _ = tx.send(true);
            }
        });
    }
    // Kill all PTY terminal sessions
    if let Some(term_state) = app_handle.try_state::<TerminalManager>() {
        term_state.kill_all();
    }
}

pub fn run() {
    let session_token = generate_session_token();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Mutex::new(ServerState {
            child: None,
            port: 8080,
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_millis(1500))
                .build()
                .unwrap_or_else(|e| {
                    eprintln!("[GHITA] Failed to create HTTP client, using default: {e}");
                    reqwest::Client::new()
                }),
            starting: false,
        }))
        .manage(SecurityState { session_token })
        .manage(Arc::new(RwLock::new(ProxyState::default())))
        .manage(ComputerUseState::new())
        .manage(TerminalManager::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_session_token,
            execute_approved_command,
            check_update,
            start_server,
            stop_server,
            get_server_status,
            get_local_ips,
            load_api_config,
            save_api_config,
            get_lan_enabled,
            set_lan_enabled,
            load_chat_sessions,
            save_chat_sessions,
            start_proxy,
            stop_proxy,
            get_proxy_status,
            get_proxy_url,
            get_sandbox_containers,
            get_sandbox_summary,
            get_sandbox_logs,
            // Phase 1: Native computer-use (Rust screenshot + input + resize)
            computer_use::computer_screenshot,
            computer_use::computer_get_screen_size,
            computer_use::computer_move_mouse,
            computer_use::computer_click,
            computer_use::computer_type_text,
            computer_use::computer_press_key,
            computer_use::computer_health_check,
            // Phase 2: Native PTY terminal (Rust)
            terminal::terminal_create,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            terminal::terminal_list,
            // DocsGriller
            run_grill_session,
        ])
        .setup(|app| {
            // Get splash and main windows — gracefully handle if not found
            let splash = match app.get_webview_window("splash") {
                Some(w) => w,
                None => {
                    eprintln!("[setup] Splash window not found — skipping splash transition");
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.show();
                    }
                    return Ok(());
                }
            };
            let main = match app.get_webview_window("main") {
                Some(w) => w,
                None => {
                    eprintln!("[setup] Main window not found in app configuration");
                    return Ok(());
                }
            };

            let _ = main.show();
            let _ = main.unminimize();
            let _ = main.set_focus();

            // Show main window and close splash when frontend emits 'ready' event.
            // Tauri Window operations are thread-safe (use IPC channels internally),
            // so std::thread::spawn is safe for the delayed transition.
            let shown = Arc::new(std::sync::atomic::AtomicBool::new(false));
            {
                let main_handle = main.clone();
                let splash_handle = splash.clone();
                let shown_clone = shown.clone();
                main_handle.clone().listen("ready", move |_event| {
                    if shown_clone.swap(true, std::sync::atomic::Ordering::SeqCst) {
                        return; // Already handled
                    }
                    let main_h = main_handle.clone();
                    let splash_h = splash_handle.clone();
                    std::thread::spawn(move || {
                        // Small delay for smooth visual transition
                        std::thread::sleep(std::time::Duration::from_millis(300));
                        let _ = main_h.show();
                        let _ = splash_h.close();
                    });
                });
            }

            // Safety timeout: force-show main window after 6s even if 'ready' event is lost.
            // This prevents the user from being stuck on a dark/invisible screen.
            {
                let main = main.clone();
                let splash = splash.clone();
                let shown = shown.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(6));
                    if !shown.load(std::sync::atomic::Ordering::SeqCst) {
                        eprintln!("[setup] Safety timeout fired — showing main window");
                        let _ = main.show();
                        let _ = splash.close();
                    }
                });
            }

            #[cfg(debug_assertions)]
            {
                // Open DevTools on both windows for debugging
                if let Some(window) = app.get_webview_window("splash") {
                    window.open_devtools();
                }
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("[GHITA FATAL] Failed to build Tauri application: {e}");
            eprintln!("[GHITA FATAL] This may be caused by missing WebView2 runtime or corrupted installation.");
            std::process::exit(1);
        });

    // Guard against running cleanup twice (CloseRequested triggers Exit)
    let cleaned_up = std::sync::atomic::AtomicBool::new(false);

    app.run(move |app_handle, event| {
        match event {
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                // Only trigger full shutdown when the *main* window is closed
                if label == "main" {
                    // Prevent the default close so we can clean up first
                    api.prevent_close();

                    // Close DevTools to prevent Chrome_WidgetWin_0 unregister error
                    #[cfg(debug_assertions)]
                    {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            w.close_devtools();
                        }
                    }

                    if !cleaned_up.swap(true, std::sync::atomic::Ordering::SeqCst) {
                        cleanup_before_exit(app_handle);
                    }

                    // Destroy all windows so WebView2 can clean up, then exit
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.destroy();
                    }
                    app_handle.exit(0);
                }
            }
            tauri::RunEvent::Exit
                if !cleaned_up.swap(true, std::sync::atomic::Ordering::SeqCst) =>
            {
                cleanup_before_exit(app_handle);
            }
            _ => {}
        }
    });
}
