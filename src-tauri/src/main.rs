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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![join_twitch, join_youtube])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
