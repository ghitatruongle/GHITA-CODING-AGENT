use tauri::{Emitter, Listener, Manager};
use tauri_plugin_updater::UpdaterExt;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use tokio::sync::RwLock;

mod proxy;
use proxy::{ProxyState, start_proxy_server, stop_proxy_server, get_proxy_port};

// --- Server sidecar state ---
struct ServerState {
    child: Option<std::process::Child>,
    port: u16,
    http_client: reqwest::Client,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to GHITA CODING AGENT.", name)
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
fn start_server(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<ServerState>>,
) -> Result<String, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;

    if s.child.is_some() {
        return Ok("Server already running".to_string());
    }

    // Resolve sidecar script path relative to the executable
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Cannot resolve exe directory")?
        .to_path_buf();

    // Try multiple possible locations for the server script
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

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let bundled_node = server_script
        .parent()
        .map(|dir| dir.join("node.exe"))
        .filter(|path| path.exists());
    let node_command = bundled_node
        .as_ref()
        .map(|path| path.as_os_str())
        .unwrap_or_else(|| std::ffi::OsStr::new("node"));

    let lan_config_path = data_dir.join("lan-enabled.txt");
    let lan_enabled = fs::read_to_string(&lan_config_path).unwrap_or_default().trim() == "true";

    let mut child = std::process::Command::new(node_command)
        .arg(&server_script)
        .env("GHITA_PORT", s.port.to_string())
        .env("GHITA_DATA_DIR", &data_dir)
        .env("GHITA_LAN_ENABLED", if lan_enabled { "1" } else { "0" })
        .env("GHITA_LIBERATE_PORTS", "1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start sidecar server: {}", e))?;

    // Spawn a thread to read stdout line-by-line
    if let Some(stdout) = child.stdout.take() {
        let app_handle = app_handle.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line_str) = line {
                    if line_str.starts_with("__GHITA_IPC__:") {
                        let payload = &line_str["__GHITA_IPC__:".len()..];
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(payload) {
                            let _ = app_handle.emit("sidecar-event", parsed);
                        }
                    } else {
                        // Print ordinary log to console
                        println!("{}", line_str);
                    }
                }
            }
        });
    }

    s.child = Some(child);
    Ok(format!("Server starting on port {}", s.port))
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
async fn get_server_status(state: tauri::State<'_, Mutex<ServerState>>) -> Result<serde_json::Value, String> {
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

fn app_storage_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(file_name))
}

fn api_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_storage_path(app, "api-config.json")
}

fn chat_sessions_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_storage_path(app, "chat-sessions.json")
}

#[tauri::command]
fn load_api_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = api_config_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_api_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let path = api_config_path(&app)?;
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
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
    let actual_port = get_proxy_port(state.inner()).await.ok_or("Proxy started but port unknown")?;
    Ok(actual_port)
}

#[tauri::command]
async fn stop_proxy(
    state: tauri::State<'_, Arc<RwLock<ProxyState>>>,
) -> Result<(), String> {
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
    // Sanitize path to prevent URL injection
    let clean = path.trim_start_matches('/');
    if clean.contains('@') || clean.contains("://") || clean.contains('\\') {
        return Err("Invalid path characters".to_string());
    }
    Ok(format!("http://127.0.0.1:{}/{}", port, clean))
}

// Sandbox commands — return empty/placeholder until Docker integration is implemented
#[tauri::command]
fn get_sandbox_containers() -> Vec<String> {
    Vec::new()
}

#[tauri::command]
fn get_sandbox_summary() -> String {
    "{\"status\":\"not_ready\",\"message\":\"Docker sandbox not configured\"}".to_string()
}

#[tauri::command]
fn get_sandbox_logs() -> String {
    "No sandbox logs available.".to_string()
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Mutex::new(ServerState {
            child: None,
            port: 8080,
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_millis(1500))
                .build()
                .expect("Failed to create HTTP client"),
        }))
        .manage(Arc::new(RwLock::new(ProxyState::default())))
        .invoke_handler(tauri::generate_handler![
            greet,
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
        .expect("error while building tauri application");

    app.run(move |app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<Mutex<ServerState>>() {
                if let Ok(mut s) = state.lock() {
                    if let Some(mut child) = s.child.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
            if let Some(proxy_state) = app_handle.try_state::<Arc<RwLock<ProxyState>>>() {
                if let Ok(mut s) = proxy_state.try_write() {
                    s.is_running = false;
                }
            }
        }
    });
}
