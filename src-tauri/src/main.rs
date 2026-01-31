#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod twitch;
mod youtube;


use tauri::AppHandle;
use twitch::start_twitch_handler;
use youtube::{start_youtube_handler, send_youtube_message};

use tauri::{Manager, Listener, Emitter};
use tauri_plugin_opener::OpenerExt;
use image::GenericImageView;

#[tauri::command]
fn join_twitch(
    app: AppHandle,
    channel: String,
    username: Option<String>,
    token: Option<String>,
) {
    tauri::async_runtime::spawn(async move {
        start_twitch_handler(app, channel, username, token).await;
    });
}

#[tauri::command]
async fn send_twitch_message(state: tauri::State<'_, twitch::TwitchAppState>, channel: String, message: String) -> Result<(), String> {
    let client = state.client.read().unwrap().as_ref().cloned();

    if let Some(client) = client {
        // Ensure channel format: Strip '#' to match join command behavior
        let channel = channel.trim().trim_start_matches('#').to_lowercase();
        
        eprintln!("Sending message to '{}': {}", channel, message);
        client.privmsg(channel, message).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Twitch client not connected".to_string())
    }
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let _ = app.get_webview_window("main").expect("no main window").set_focus();
            
            for arg in args {
                // Windows args might be quoted, clean them or just check content
                if arg.contains("heychat://") {
                    eprintln!("Single Instance Arg: {}", arg);
                    let _ = app.emit("deep-link://new-url", arg);
                }
            }
        }))
        .setup(|app| {
            app.manage(twitch::TwitchAppState {
                client: std::sync::RwLock::new(None),
            });

            let icon_content = include_bytes!("../icons/icon.png");
            let icon_image = image::load_from_memory(icon_content).expect("failed to load icon");
            let (width, height) = icon_image.dimensions();
            let rgba = icon_image.into_rgba8().into_raw();
            let icon = tauri::image::Image::new_owned(rgba, width, height);
            
            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(icon).expect("failed to set window icon");
            }

            // Deep Link Handler
            let app_handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event: tauri::Event| {
                let url_str = event.payload().trim().trim_matches('"');
                eprintln!("Deep link received: {}", url_str);
                
                // Parse URL: heychat://auth?access_token=...
                if let Some(token_idx) = url_str.find("access_token=") {
                    let token = &url_str[token_idx + 13..];
                    let token = token.split('&').next().unwrap_or(token);
                    let token = token.trim().trim_matches('"').trim_matches('\'').to_string();
                    
                    eprintln!("Extracted Access Token (len: {})", token.len());
                    
                    // Emit generic token event. Frontend determines provider via local state.
                    let _ = app_handle.emit("auth-token-received", token);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            join_twitch,
            send_twitch_message,
            join_youtube,

            open_link,
            start_twitch_oauth,
            start_youtube_oauth,
            send_youtube_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn start_twitch_oauth(app: AppHandle) -> Result<(), String> {
    let client_id = "j07v9449bxjpfqx1msfnceaol2uwhx"; 
    let redirect_uri_encoded = "https%3A%2F%2Fheychatapp.com%2Fauth"; 
    
    let url = format!(
        "https://id.twitch.tv/oauth2/authorize?response_type=token&client_id={}&redirect_uri={}&scope=chat%3Aread+chat%3Aedit",
        client_id, redirect_uri_encoded
    );

    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn start_youtube_oauth(app: AppHandle) -> Result<(), String> {
    let client_id = "672007843378-gdj25iqn8h3eu6mp8qmqbfuvonuc2fkl.apps.googleusercontent.com";
    let redirect_uri_encoded = "https%3A%2F%2Fheychatapp.com%2Fauth";
    // Scopes: youtube.force-ssl + email + profile + openid
    // Separated by space (encoded as + or %20)
    let scope_encoded = "https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.force-ssl+email+profile+openid";
    
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?response_type=token&client_id={}&redirect_uri={}&scope={}",
        client_id, redirect_uri_encoded, scope_encoded
    );

    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}
