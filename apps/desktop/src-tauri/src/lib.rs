use tauri::{Emitter, Listener, Manager};
use tauri_plugin_updater::UpdaterExt;
use std::sync::Mutex;

// --- Server sidecar state ---
struct ServerState {
    child: Option<std::process::Child>,
    port: u16,
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
    let candidates = [
        exe_dir.join("sidecar").join("server.mjs"),
        exe_dir.join("../sidecar/server.mjs"),
        exe_dir.join("../../src-tauri/sidecar/server.mjs"),
        // Dev mode: relative to src-tauri
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("sidecar")
            .join("server.mjs"),
    ];

    let server_script = candidates
        .iter()
        .find(|p| p.exists())
        .ok_or_else(|| {
            format!(
                "server.mjs not found. Searched: {}",
                candidates
                     .iter()
                     .map(|p| p.display().to_string())
                     .collect::<Vec<_>>()
                     .join(", ")
            )
        })?;

    let mut child = std::process::Command::new("node")
        .arg(&server_script)
        .env("GHITA_PORT", s.port.to_string())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start server: {}. Is Node.js installed?", e))?;

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

/// Get server status
#[tauri::command]
fn get_server_status(state: tauri::State<'_, Mutex<ServerState>>) -> Result<serde_json::Value, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;

    // Check if the process has exited
    if let Some(ref mut child) = s.child {
        if let Ok(Some(_status)) = child.try_wait() {
            // Process has exited, clean up state
            s.child = None;
        }
    }

    let running = s.child.is_some();
    let port = s.port;

    // Release the lock before doing blocking I/O!
    drop(s);

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
        // Use a client with a 1.5-second timeout to avoid locking/stalling
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_millis(1500))
            .build()
            .map_err(|e| e.to_string())?;

        if let Ok(resp) = client.get(&url).send() {
            if let Ok(mut json) = resp.json::<serde_json::Value>() {
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
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Mutex::new(ServerState {
            child: None,
            port: 8080,
        }))
        .invoke_handler(tauri::generate_handler![
            greet,
            check_update,
            start_server,
            stop_server,
            get_server_status,
            get_local_ips,
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
            {
                let main_handle = main.clone();
                let splash_handle = splash.clone();
                main_handle.clone().once("ready", move |_event| {
                    std::thread::spawn(move || {
                        // Small delay for smooth visual transition
                        std::thread::sleep(std::time::Duration::from_millis(300));
                        let _ = main_handle.show();
                        let _ = splash_handle.close();
                    });
                });
            }

            // Safety timeout: force-show main window after 6s even if 'ready' event is lost.
            // This prevents the user from being stuck on a dark/invisible screen.
            {
                let main = main.clone();
                let splash = splash.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(6));
                    eprintln!("[setup] Safety timeout fired — showing main window");
                    let _ = main.show();
                    let _ = splash.close();
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
            // Clean up server sidecar process on exit
            if let Some(state) = app_handle.try_state::<Mutex<ServerState>>() {
                if let Ok(mut s) = state.lock() {
                    if let Some(mut child) = s.child.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        }
    });
}
