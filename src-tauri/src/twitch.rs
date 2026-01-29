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
                // Emit channel ID just in case RoomState didn't catch it or we reconnected silently
                // Emitting generic string is fine, frontend handles dedupe
                app_clone.emit("twitch-connected", msg.channel_id.clone()).unwrap_or(());

                eprintln!("Twitch msg received from: {}", msg.sender.name);
                let is_mod = msg.badges.iter().any(|b| b.name == "moderator");
                let is_vip = msg.badges.iter().any(|b| b.name == "vip");
                
                let emotes = msg.emotes.iter().map(|e| crate::models::Emote {
                    id: e.id.clone(),
                    code: e.code.clone(),
                    start: e.char_range.start,
                    end: e.char_range.end,
                }).collect();

                // Check for Bits
                let bits_amount = msg.source.tags.0.get("bits").and_then(|s: &Option<String>| s.clone());
                
                // Check for Channel Point Redemption
                // Twitch sends "custom-reward-id" tag if a reward was redeemed
                let custom_reward_id = msg.source.tags.0.get("custom-reward-id").and_then(|s: &Option<String>| s.clone());

                let mut system_message = None;
                let mut msg_type = "chat".to_string();

                if let Some(bits) = bits_amount {
                    system_message = Some(format!("Cheered {} Bits!", bits));
                    msg_type = "sub".to_string(); // Use "sub" style for now as it draws attention
                } else if custom_reward_id.is_some() {
                     // We might get "msg-id": "highlighted-message" for "Highlight My Message" reward
                     // But custom-reward-id is generic for any reward.
                     // Often we don't have the reward NAME in the tags, just the ID.
                     // But we can genericize it:
                     system_message = Some("Redeemed a Channel Reward!".to_string());
                     msg_type = "sub".to_string();
                }

                let chat_message = ChatMessage {
                    id: msg.message_id,
                    platform: Platform::Twitch,
                    username: msg.sender.name,
                    message: msg.message_text,
                    color: msg.name_color.map(|c| format!("#{:02X}{:02X}{:02X}", c.r, c.g, c.b)),
                    badges: msg.badges.iter().map(|b| b.name.clone()).collect(),
                    is_mod,
                    is_vip,
                    is_member: false,
                    timestamp: chrono::Local::now().to_rfc3339(),
                    emotes,
                    msg_type,
                    system_message,
                };
                
                if let Err(e) = app_clone.emit("chat-message", chat_message) {
                    eprintln!("Failed to emit twitch message: {}", e);
                } else {
                    eprintln!("Emitted twitch message");
                }
            } else if let ServerMessage::Notice(msg) = message {
                 eprintln!("Twitch Notice: {}", msg.message_text);
            } else if let ServerMessage::UserNotice(msg) = message {
                // Handle Subs, Resubs, Raids, etc.
                eprintln!("Twitch UserNotice: {:?}", msg);
                
                let system_msg = msg.system_message; 
                let user_text = msg.message_text.unwrap_or_default();
                let sender_name = msg.sender.name; // User who subbed

                let emotes = msg.emotes.iter().map(|e| crate::models::Emote {
                    id: e.id.clone(),
                    code: e.code.clone(),
                    start: e.char_range.start,
                    end: e.char_range.end,
                }).collect();

                // Always emit UserNotice (Sub/Resub)
                 let chat_message = ChatMessage {
                    id: msg.source.tags.0.get("id").and_then(|s| s.clone()).unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                    platform: Platform::Twitch,
                    username: sender_name,
                    message: user_text,
                    color: Some("#9146FF".to_string()), // Default system color, but maybe user color?
                    badges: vec![],
                    is_mod: false,
                    is_vip: false,
                    is_member: false,
                    timestamp: chrono::Local::now().to_rfc3339(),
                    emotes,
                    msg_type: "sub".to_string(),
                    system_message: Some(system_msg),
                };
                app_clone.emit("chat-message", chat_message).unwrap_or(());
            } else if let ServerMessage::RoomState(msg) = message {
                 // Emit channel ID for 3rd party emotes fetching
                 if let Some(room_id) = msg.source.tags.0.get("room-id").and_then(|s: &Option<String>| s.clone()) {
                     eprintln!("Twitch RoomState: room-id={}", room_id);
                     app_clone.emit("twitch-connected", room_id).unwrap_or(());
                 }
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
