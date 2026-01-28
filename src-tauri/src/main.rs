#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod twitch;
mod youtube;

use tauri::AppHandle;
use twitch::start_twitch_handler;
use youtube::start_youtube_handler;

#[tauri::command]
fn join_twitch(app: AppHandle, channel: String) {
    tauri::async_runtime::spawn(async move {
        start_twitch_handler(app, channel).await;
    });
}

#[tauri::command]
fn join_youtube(app: AppHandle, video_id: String) {
    tauri::async_runtime::spawn(async move {
        start_youtube_handler(app, video_id).await;
    });
}

#[tauri::command]
fn open_link(url: String) {
    let _ = opener::open(url);
}

fn main() {
    use image::GenericImageView;
    use tauri::Manager; // Import Manager trait for get_webview_window

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let icon_content = include_bytes!("../icons/icon.png");
            let icon_image = image::load_from_memory(icon_content).expect("failed to load icon");
            let (width, height) = icon_image.dimensions();
            let rgba = icon_image.into_rgba8().into_raw();
            let icon = tauri::image::Image::new_owned(rgba, width, height);
            
            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(icon).expect("failed to set window icon");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![join_twitch, join_youtube, open_link])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
