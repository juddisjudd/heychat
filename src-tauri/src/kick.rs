use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use crate::models::{ChatMessage, Platform};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use futures_util::{StreamExt, SinkExt};

use serde_json::{Value, json};
use reqwest::header::{USER_AGENT, AUTHORIZATION, CONTENT_TYPE, ACCEPT};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use rand::{Rng, thread_rng};
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};

const PUSHER_KEY: &str = "32cbd69e4b950bf97679";
const PUSHER_CLUSTER: &str = "us2";

// Store broadcaster user IDs for sending messages
// Map<ChannelSlug, BroadcasterUserId>
pub struct KickState {
    pub broadcaster_ids: Arc<Mutex<HashMap<String, u64>>>,
    pub pkce_verifier: Arc<Mutex<Option<String>>>,
    pub shutdown_tx: Arc<Mutex<Option<tokio::sync::broadcast::Sender<()>>>>,
}

pub async fn start_kick_oauth(app: AppHandle) -> Result<(), String> {
    let client_id = "01KG9BKAZPA62J13S6PATK3BWN";
    let redirect_uri = "https%3A%2F%2Fheychatapp.com%2Fauth"; // Use standard URL encoding
    // Use %20 for spaces
    let scope = "user:read%20channel:read%20chat:write"; 

    // Generate PKCE Verifier and Challenge
    let mut rng = thread_rng();
    let verifier: String = (0..32).map(|_| rng.sample(rand::distributions::Alphanumeric) as char).collect();
    let verifier_hash = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(verifier_hash);

    // Store verifier in state
    let state = app.state::<KickState>();
    *state.pkce_verifier.lock().unwrap() = Some(verifier);

    let url = format!(
        "https://kick.com/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256",
        client_id, redirect_uri, scope, challenge
    );

    app.opener().open_url(url, None::<&str>).map_err(|e: tauri_plugin_opener::Error| e.to_string())?;
    Ok(())
}

pub async fn exchange_kick_code(app: AppHandle, code: String) -> Result<(), String> {
    // Worker Proxy URL
    let token_endpoint = "https://ktp.heychatapp.com/";
    let redirect_uri = "https://heychatapp.com/auth";
    
    let state = app.state::<KickState>();
    let verifier = state.pkce_verifier.lock().unwrap().take().ok_or("No PKCE verifier found")?;

    let client = reqwest::Client::new();
    
    // Send as JSON to our Worker
    let payload = json!({
        "code": code,
        "code_verifier": verifier,
        "redirect_uri": redirect_uri
    });

    eprintln!("Exchanging code via Proxy: {}", token_endpoint);

    let res = client.post(token_endpoint)
        .json(&payload)
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {} - {}", status, body));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    
    // The worker returns the exact response from Kick
    if let Some(token) = json["access_token"].as_str() {
        eprintln!("Kick Token Exchange Successful");
        let _ = app.emit("auth-token-received", token);
        Ok(())
    } else {
        eprintln!("Invalid response from Proxy: {:?}", json);
        Err("No access_token used in response".to_string())
    }
}

pub async fn start_kick_handler(app: AppHandle, channel: String, chatroom_id: u64, broadcaster_user_id: u64, _token: Option<String>) {
    let channel_slug = channel.trim().to_lowercase();
    eprintln!("Starting Kick handler for: {} (Chatroom: {}, User: {})", channel_slug, chatroom_id, broadcaster_user_id);
    
    // Store broadcaster ID in state for sending later
    let state = app.state::<KickState>();
    state.broadcaster_ids.lock().unwrap().insert(channel_slug.clone(), broadcaster_user_id);

    let _ = app.emit("kick-connected", channel_slug.clone());

    // Create shutdown channel
    let (tx, mut rx) = tokio::sync::broadcast::channel(1);
    *state.shutdown_tx.lock().unwrap() = Some(tx);

    // 2. Connect to Pusher (Read-Only)
    let ws_url = format!(
        "wss://ws-{}.pusher.com/app/{}?protocol=7&client=js&version=8.4.0-rc2&flash=false",
        PUSHER_CLUSTER, PUSHER_KEY
    );

    let (ws_stream, _) = match connect_async(ws_url).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to connect to Kick WebSocket: {}", e);
            let _ = app.emit("kick-error", "Failed to connect to Kick chat server.");
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();

    // 3. Subscribe
    let subscribe_msg = serde_json::json!({
        "event": "pusher:subscribe",
        "data": {
            "auth": "",
            "channel": format!("chatrooms.{}.v2", chatroom_id)
        }
    });

    if let Err(e) = write.send(Message::Text(subscribe_msg.to_string().into())).await {
         eprintln!("Kick subscribe failed: {}", e);
         return;
    }

    // 4. Loop with Shutdown
    loop {
        tokio::select! {
             biased;
             _ = rx.recv() => {
                 eprintln!("Kick handler received shutdown signal.");
                 break;
             }
             msg_result = read.next() => {
                 match msg_result {
                    Some(Ok(msg)) => {
                        match msg {
                            Message::Text(text) => {
                                // eprintln!("Kick Raw WS: {}", text.chars().take(200).collect::<String>());
                                handle_kick_message(&app, &text)
                            },
                            Message::Ping(ping) => { let _ = write.send(Message::Pong(ping)).await; },
                            _ => {}
                        }
                    }
                    Some(Err(e)) => {
                        eprintln!("Kick WS Error: {}", e);
                        break;
                    }
                    None => {
                        eprintln!("Kick WS Stream ended");
                        break;
                    }
                 }
             }
        }
    }
}

pub async fn leave_kick_channel(app: AppHandle, channel: String) {
    eprintln!("Leaving Kick channel: {}", channel);
    let state = app.state::<KickState>();
    // Clone Arc to avoid lifetime issues with State borrow
    let shutdown_arc = state.shutdown_tx.clone();
    
    let tx_opt = {
        let mut guard = shutdown_arc.lock().unwrap();
        guard.take()
    };

    if let Some(tx) = tx_opt {
        let _ = tx.send(());
    }
}

pub async fn send_kick_message(app: AppHandle, channel: String, message: String, token: String) -> Result<(), String> {
    let channel_slug = channel.trim().to_lowercase();
    
    // Retrieve broadcaster_user_id from state
    let state = app.state::<KickState>();
    let broadcaster_id = {
        let map = state.broadcaster_ids.lock().unwrap();
        map.get(&channel_slug).cloned()
    };

    let broadcaster_id = match broadcaster_id {
        Some(id) => id,
        None => {
            // Try to fetch it if missing (e.g. if we just started)
             match get_channel_info_v2(&channel_slug).await {
                Ok((_, uid)) => {
                    state.broadcaster_ids.lock().unwrap().insert(channel_slug.clone(), uid);
                    uid
                },
                Err(_) => return Err("Could not resolve channel ID for sending".to_string())
            }
        }
    };

    // Official API: POST /public/v1/chat
    let client = reqwest::Client::new();
    let url = "https://api.kick.com/public/v1/chat";
    
    let payload = serde_json::json!({
        "broadcaster_user_id": broadcaster_id,
        "content": message,
        "type": "user"
    });

    let res = client.post(url)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Send failed ({}): {}", status, body));
    }

    Ok(())
}

async fn get_channel_info_v2(slug: &str) -> Result<(u64, u64), String> {
    // Returns (chatroom_id, user_id)
    let client = reqwest::Client::new();
    let url = format!("https://kick.com/api/v2/channels/{}", slug);
    
    let resp = client.get(&url)
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("API Request failed: {}", resp.status()));
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    let json: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;

    let chatroom_id = json.get("chatroom").and_then(|c| c.get("id")).and_then(|i| i.as_u64())
        .ok_or("No chatroom ID found")?;
        
    let user_id = json.get("userid").and_then(|i| i.as_u64())
        .or_else(|| json.get("user_id").and_then(|i| i.as_u64())) 
        .or_else(|| json.get("id").and_then(|i| i.as_u64())) // On v2/channels/slug, the top level 'id' is often the user_id
        .ok_or("No user ID found")?;

    Ok((chatroom_id, user_id))
}

fn handle_kick_message(app: &AppHandle, text: &str) {
    let json: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };

    let event = match json.get("event").and_then(|e| e.as_str()) {
        Some(e) => e,
        None => return,
    };

    if event == "App\\Events\\ChatMessageEvent" {
        if let Some(data_str) = json.get("data").and_then(|d| d.as_str()) {
             if let Ok(data_json) = serde_json::from_str::<Value>(data_str) {
                 process_chat_message(app, &data_json);
             }
        }
    }
}

fn process_chat_message(app: &AppHandle, data: &Value) {
    let id = data.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
    let message = data.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string();
    
    let sender = data.get("sender");
    let username = sender.and_then(|s| s.get("username")).and_then(|u| u.as_str()).unwrap_or("Unknown").to_string();
    
    let identity = sender.and_then(|s| s.get("identity"));
    let color = identity.and_then(|i| i.get("color")).and_then(|c| c.as_str()).map(|c| c.to_string());
    
    let mut badges = Vec::new();
    let mut is_mod = false;
    let mut is_vip = false;

    if let Some(badges_arr) = identity.and_then(|i| i.get("badges")).and_then(|b| b.as_array()) {
        for b in badges_arr {
             if let Some(type_) = b.get("type").and_then(|t| t.as_str()) {
                 badges.push(type_.to_string());
                 if type_ == "moderator" { is_mod = true; }
                 if type_ == "vip" { is_vip = true; }
             }
        }
    }

    let chat_message = ChatMessage {
        id,
        platform: Platform::Kick,
        username,
        message,
        color,
        badges,
        is_mod,
        is_vip,
        is_member: false, 
        timestamp: chrono::Local::now().to_rfc3339(),
        emotes: vec![], // Emotes TODO
        msg_type: "chat".to_string(),
        system_message: None,
    };

    let _ = app.emit("chat-message", chat_message);
}
