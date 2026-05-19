use tauri::{Listener, Manager};
use tauri_plugin_updater::UpdaterExt;

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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet, check_update])
        .setup(|app| {
            // Get splash and main windows
            let splash = app.get_webview_window("splash").unwrap();
            let main = app.get_webview_window("main").unwrap();

            // Show main window and close splash when frontend is ready
            let main_clone = main.clone();
            let splash_clone = splash.clone();

            main.once("ready", move |_event| {
                // Small delay for smooth transition
                std::thread::sleep(std::time::Duration::from_millis(300));
                main_clone.show().unwrap();
                splash_clone.close().unwrap();
            });

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
