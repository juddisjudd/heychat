use crate::models::{ChatMessage, Platform};
use tauri::{AppHandle, Emitter};
use twitch_irc::login::StaticLoginCredentials;
use twitch_irc::message::ServerMessage;
use twitch_irc::{ClientConfig, SecureTCPTransport, TwitchIRCClient};

pub async fn start_twitch_handler(app: AppHandle, channel: String) {
    let channel = if channel.starts_with('#') {
        channel
    } else {
        format!("#{}", channel)
    };

    let config = ClientConfig::default();
    let (mut incoming_messages, client) =
        TwitchIRCClient::<SecureTCPTransport, StaticLoginCredentials>::new(config);

    let app_clone = app.clone();
    let client_handle = client.clone(); // Keep client alive by moving a clone into the task
    
    tokio::spawn(async move {
        // We hold client_handle here to prevent the backend task from exiting due to "all senders dropped"
        let _keep_alive = client_handle;
        
        while let Some(message) = incoming_messages.recv().await {
            eprintln!("Twitch Raw Message: {:?}", message); // Log everything
            if let ServerMessage::Privmsg(msg) = message {
                // ... processing ...
                eprintln!("Twitch msg received from: {}", msg.sender.name);
                let is_mod = msg.badges.iter().any(|b| b.name == "moderator");
                let is_vip = msg.badges.iter().any(|b| b.name == "vip");
                
                let emotes = msg.emotes.iter().map(|e| crate::models::Emote {
                    id: e.id.clone(),
                    code: e.code.clone(),
                    start: e.char_range.start,
                    end: e.char_range.end,
                }).collect();

                let chat_message = ChatMessage {
                    id: msg.message_id,
                    platform: Platform::Twitch,
                    username: msg.sender.name,
                    message: msg.message_text,
                    color: msg.name_color.map(|c| format!("#{:02X}{:02X}{:02X}", c.r, c.g, c.b)),
                    badges: msg.badges.iter().map(|b| b.name.clone()).collect(),
                    is_mod,
                    is_vip,
                    timestamp: chrono::Local::now().to_rfc3339(),
                    emotes,
                };
                
                if let Err(e) = app_clone.emit("chat-message", chat_message) {
                    eprintln!("Failed to emit twitch message: {}", e);
                } else {
                    eprintln!("Emitted twitch message");
                }
            } else if let ServerMessage::Notice(msg) = message {
                 eprintln!("Twitch Notice: {}", msg.message_text);
            } else if let ServerMessage::Join(msg) = message {
                 eprintln!("Twitch Joined: {}", msg.channel_login);
            }
        }
    });

    // Handle channel name: Stripping hash and ensuring lowercase/trimmed
    let channel_clean = channel.trim().trim_start_matches('#').to_lowercase();
    
    eprintln!("Attempting to join Twitch channel: {}", channel_clean);
    
    // Slight delay to ensure connection is established before joining?
    // TwitchIRCClient buffers commands usually, so it should be fine.
    if let Err(e) = client.join(channel_clean) {
         eprintln!("Failed to join twitch channel: {}", e);
    } else {
         eprintln!("Joined Twitch channel request sent.");
    }
}
