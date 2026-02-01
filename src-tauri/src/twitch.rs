use crate::models::{ChatMessage, Platform};
use tauri::{AppHandle, Emitter, Manager};
use twitch_irc::login::StaticLoginCredentials;
use twitch_irc::message::ServerMessage;
use twitch_irc::{ClientConfig, SecureTCPTransport, TwitchIRCClient};
use std::sync::RwLock;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
struct HelixResponse<T> {
    data: Vec<T>,
}

#[derive(Serialize, Deserialize, Debug)]
struct IvrResponse {
    #[serde(rename = "followedAt")]
    followed_at: Option<String>,
    cumulative: Option<IvrCumulative>,
    meta: Option<IvrMeta>,
}

#[derive(Serialize, Deserialize, Debug)]
struct IvrCumulative {
    months: u32,
}

#[derive(Serialize, Deserialize, Debug)]
struct IvrMeta {
    tier: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct TwitchUser {
    id: String,
    login: String,
    display_name: String,
    profile_image_url: Option<String>,
    created_at: Option<String>,
}


pub struct TwitchAppState {
    pub client: RwLock<Option<TwitchIRCClient<SecureTCPTransport, StaticLoginCredentials>>>,
    pub access_token: RwLock<Option<String>>,
    pub channel_id: RwLock<Option<String>>, // Broadcaster ID
    pub api_client: reqwest::Client,
    pub shutdown_tx: RwLock<Option<tokio::sync::broadcast::Sender<()>>>,
}


pub async fn start_twitch_handler(
    app: AppHandle,
    channel: String,
    username: Option<String>,
    token: Option<String>,
) {
    let channel = if channel.starts_with('#') {
        channel
    } else {
        format!("#{}", channel)
    };

    let config = if let (Some(u), Some(t)) = (username, token.clone()) {
        // Strip "oauth:" because twitch_irc might prepend it, or we want to normalize.
        // Sending "oauth:token" often results in "oauth:oauth:token" if the lib is helpful.
        // If the lib expects "oauth:token", passing "token" might fail, but let's try this common fix first.
        let token_clean = t.trim_start_matches("oauth:").to_string();
        
        eprintln!("Authenticating as user: '{}'", u);
        eprintln!("Token clean start: '{}'", token_clean.chars().take(5).collect::<String>());
        
        let creds = StaticLoginCredentials::new(u, Some(token_clean));
        ClientConfig::new_simple(creds)
    } else {
        eprintln!("Authenticating anonymously");
        ClientConfig::default()
    };

    let (mut incoming_messages, client) =
        TwitchIRCClient::<SecureTCPTransport, StaticLoginCredentials>::new(config);

    // Create shutdown channel
    let (tx, mut rx) = tokio::sync::broadcast::channel(1);

    // Store client and shutdown sender in state
    if let Some(state) = app.try_state::<TwitchAppState>() {
        *state.client.write().unwrap() = Some(client.clone());
        *state.shutdown_tx.write().unwrap() = Some(tx);
        if let Some(t) = token {
             *state.access_token.write().unwrap() = Some(t.replace("oauth:", ""));
        }
    }

    let app_clone = app.clone();
    let client_handle = client.clone(); // Keep client alive by moving a clone into the task
    
    tokio::spawn(async move {
        // We hold client_handle here to prevent the backend task from exiting due to "all senders dropped"
        let _keep_alive = client_handle;
        
        loop {
            tokio::select! {
                biased;
                _ = rx.recv() => {
                    eprintln!("Twitch handler received shutdown signal. Exiting loop.");
                    break;
                }
                msg_opt = incoming_messages.recv() => {
                    match msg_opt {
                        Some(message) => {
                             // eprintln!("Twitch Raw Message: {:?}", message); // Disabled global logging to reduce noise
                             if let ServerMessage::Privmsg(msg) = message {
                                 // Emit channel ID just in case RoomState didn't catch it or we reconnected silently
                                 // Emitting generic string is fine, frontend handles dedupe
                                 // app_clone.emit("twitch-connected", msg.channel_id.clone()).unwrap_or(());
                 
                                 // eprintln!("Twitch msg received from: {}", msg.sender.name);
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
                                     // eprintln!("Emitted twitch message");
                                 }
                             } else if let ServerMessage::Notice(msg) = message {
                                  eprintln!("Twitch Notice: {}", msg.message_text);
                                  if msg.message_text == "Login authentication failed" {
                                      app_clone.emit("twitch-error", "Login authentication failed. Please check your token.").unwrap_or(());
                                  }
                             } else if let ServerMessage::UserState(msg) = message {
                                 let is_mod = msg.badges.iter().any(|b| b.name == "moderator" || b.name == "broadcaster");
                                 let badges: Vec<String> = msg.badges.iter().map(|b| b.name.clone()).collect();
                                 eprintln!("Twitch UserState for me: is_mod={}, badges={:?}", is_mod, badges);
                                 app_clone.emit("twitch-current-user-state", serde_json::json!({ "is_mod": is_mod, "badges": badges })).unwrap_or(());
                 
                             } else if let ServerMessage::GlobalUserState(msg) = message {
                                  // Global state doesn't necessarily tell us channel mod status, but good to know identity
                                  let badges: Vec<String> = msg.badges.iter().map(|b| b.name.clone()).collect();
                                  eprintln!("Twitch GlobalUserState: badges={:?}", badges);
                                  // Broadcaster badge might be here if we are the broadcaster connecting to our own channel
                                  let is_mod = msg.badges.iter().any(|b| b.name == "broadcaster"); 
                                  // Note: 'moderator' badge usually appears in UserState (per channel), not GlobalUserState
                                  if is_mod {
                                      app_clone.emit("twitch-current-user-state", serde_json::json!({ "is_mod": is_mod, "badges": badges })).unwrap_or(());
                                  }
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
                        None => {
                            eprintln!("Twitch incoming stream ended.");
                            break;
                        }
                    }
                }
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

pub async fn leave_twitch_channel(app: AppHandle, channel: String) {
    if let Some(state) = app.try_state::<TwitchAppState>() {
        // 1. Send Shutdown Signal to Background Task
        if let Some(tx) = state.shutdown_tx.read().unwrap().as_ref() {
            eprintln!("Sending shutdown signal to Twitch handler...");
            let _ = tx.send(());
        }

        // 2. Part from channel
        // We need a read lock to get the client, but the client itself is thread-safe (clonable)
        let client_opt = state.client.read().unwrap().clone();
        
        if let Some(client) = client_opt {
             let channel_clean = channel.trim().trim_start_matches('#').to_lowercase();
             eprintln!("Leaving Twitch channel: {}", channel_clean);
             client.part(channel_clean);
        }
        
        // 3. Clear State
        *state.client.write().unwrap() = None;
        *state.shutdown_tx.write().unwrap() = None;
        // Optionally clear channel_id if we want full reset
        // *state.channel_id.write().unwrap() = None;
    }
}

// Helper to get token
fn get_token(state: &TwitchAppState) -> Option<String> {
    state.access_token.read().unwrap().clone()
}

#[tauri::command]
pub async fn ensure_broadcaster_id(_app: AppHandle, state: tauri::State<'_, TwitchAppState>, username: String) -> Result<(), String> {
    // Only fetch if we don't have it
    if state.channel_id.read().unwrap().is_some() {
        return Ok(());
    }
    
    let token = get_token(&state).ok_or("No token found")?;
    let client = &state.api_client;
    let url = format!("https://api.twitch.tv/helix/users?login={}", username);
    
    // Validate first to get Client-Id
    let validate_res = client.get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = validate_res.json().await.map_err(|e| e.to_string())?;
    
    if let Some(client_id) = json["client_id"].as_str() {
            eprintln!("Obtained Client ID: {}", client_id);
            
            // Now we can fetch users with proper Client-ID
            let res = client.get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", client_id)
            .send()
            .await
            .map_err(|e| e.to_string())?;

            let user_res: HelixResponse<TwitchUser> = res.json().await.map_err(|e| e.to_string())?;
            
            if let Some(user) = user_res.data.first() {
                *state.channel_id.write().unwrap() = Some(user.id.clone());
                eprintln!("Fetched Twitch Broadcaster ID: {}", user.id);
                Ok(())
            } else {
                Err("User not found".to_string())
            }
    } else {
        Err("Failed to extract client_id".to_string())
    }
}

#[tauri::command]
pub async fn twitch_ban_user(
    _app: AppHandle,
    state: tauri::State<'_, TwitchAppState>,
    broadcaster_id: String,
    moderator_id: String,
    user_id: String,
    reason: String,
    duration: Option<u32> 
) -> Result<(), String> {
   let token = get_token(&state).ok_or("No Twitch token found")?;
   let client = &state.api_client;

   let validate_res = client.get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

   let json: serde_json::Value = validate_res.json().await.map_err(|e| e.to_string())?;
   let client_id = json["client_id"].as_str().ok_or("Failed to get Client ID")?;

   let url = "https://api.twitch.tv/helix/moderation/bans";
   
   // Helix Ban API structure
   let data = if let Some(dur) = duration {
       serde_json::json!({
           "user_id": user_id,
           "reason": reason,
           "duration": dur
       })
   } else {
       serde_json::json!({
           "user_id": user_id,
           "reason": reason
       })
   };

   let body = serde_json::json!({ "data": data });

   let res = client.post(url)
       .header("Authorization", format!("Bearer {}", token))
       .header("Client-Id", client_id)
       .query(&[("broadcaster_id", &broadcaster_id), ("moderator_id", &moderator_id)])
       .json(&body)
       .send()
       .await
       .map_err(|e| e.to_string())?;

   if res.status().is_success() {
       Ok(())
   } else {
       let serr = res.text().await.unwrap_or_default();
       Err(format!("Failed to ban/timeout: {}", serr))
   }
}

#[tauri::command]
pub async fn twitch_create_poll(
    _app: AppHandle,
    state: tauri::State<'_, TwitchAppState>,
    broadcaster_id: String,
    title: String,
    choices: Vec<String>,
    duration: u32
) -> Result<(), String> {
    let token = get_token(&state).ok_or("No Twitch token found")?;
    let client = &state.api_client;
    
    let validate_res = client.get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = validate_res.json().await.map_err(|e| e.to_string())?;
    let client_id = json["client_id"].as_str().ok_or("Failed to get Client ID")?;

    let url = "https://api.twitch.tv/helix/polls";
    let choices_json: Vec<_> = choices.iter().map(|c| serde_json::json!({"title": c})).collect();
    
    let body = serde_json::json!({
        "broadcaster_id": broadcaster_id,
        "title": title,
        "choices": choices_json,
        "duration": duration
    });

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Client-Id", client_id)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        let err_text = res.text().await.unwrap_or_default();
        Err(format!("Failed to create poll: {}", err_text))
    }
}





#[derive(Serialize, Deserialize, Debug)]
pub struct TwitchUserCardData {
    pub display_name: String,
    pub profile_image_url: Option<String>,
    pub created_at: Option<String>,
    pub followed_at: Option<String>,
    pub is_subscribed: bool,
    pub subscription_tier: Option<String>,
    pub months_subscribed: Option<u32>,
}

#[tauri::command]
pub async fn twitch_get_user_card_data(
    _app: AppHandle, 
    state: tauri::State<'_, TwitchAppState>, 
    broadcaster_id: String, 
    target_username: String
) -> Result<TwitchUserCardData, String> {
    let token = get_token(&state).ok_or("No Twitch token found")?;
    let client = &state.api_client;
    
    // 1. Get Logged In User Info (Me) - Async but we need ID for subsequent calls?
    // Actually, we can start fetching "Me" and "User" in parallel.
    
    // We can't easily parallelize validating + getting ID without refactoring too much, 
    // but we can parallelize:
    // A. Verify Token -> Get Client ID
    // B. Get Me (Parallel)
    // C. Get Target User (Parallel) 
    // D. Get Broadcaster Login (if needed) - (Parallel or depend on input)
    
    // Let's keep it simple but improved:
    // 0. Validate (Fast)
    let validate_res = client.get("https://id.twitch.tv/oauth2/validate")
         .header("Authorization", format!("OAuth {}", token))
         .send()
         .await
         .map_err(|e| e.to_string())?;

    let json: serde_json::Value = validate_res.json().await.map_err(|e| e.to_string())?;
    let client_id = json["client_id"].as_str().ok_or("Failed to get Client ID")?;

    // Now spawn parallel requests
    let client_clone1 = client.clone();
    let client_clone2 = client.clone();
    let client_clone3 = client.clone();
    let token_clone1 = token.clone();
    let token_clone2 = token.clone();
    let token_clone3 = token.clone();
    let client_id_own = client_id.to_string(); // Owned string for moves
    let client_id_own2 = client_id.to_string();
    let client_id_own3 = client_id.to_string();
    let target_username_clone = target_username.clone();
    let broadcaster_id_clone = broadcaster_id.clone();

    // Future A: Get Me
    let me_future = tokio::spawn(async move {
        let me_res = client_clone1.get("https://api.twitch.tv/helix/users")
            .header("Authorization", format!("Bearer {}", token_clone1))
            .header("Client-Id", client_id_own)
            .send()
            .await;
        match me_res {
             Ok(res) => res.json::<HelixResponse<TwitchUser>>().await.map_err(|e| e.to_string()),
             Err(e) => Err(e.to_string())
        }
    });

    // Future B: Get Target User
    let user_future = tokio::spawn(async move {
        let user_url = format!("https://api.twitch.tv/helix/users?login={}", target_username_clone);
        let user_res = client_clone2.get(&user_url)
            .header("Authorization", format!("Bearer {}", token_clone2))
            .header("Client-Id", client_id_own2)
            .send()
            .await;
        match user_res {
            Ok(res) => res.json::<HelixResponse<TwitchUser>>().await.map_err(|e| e.to_string()),
            Err(e) => Err(e.to_string())
        }
    });

    // Future C: Get Broadcaster Login (for IVR)
    let channel_future = tokio::spawn(async move {
         let channel_res = client_clone3.get("https://api.twitch.tv/helix/users")
            .header("Authorization", format!("Bearer {}", token_clone3))
            .header("Client-Id", client_id_own3)
            .query(&[("id", &broadcaster_id_clone)])
            .send()
            .await;
         match channel_res {
             Ok(res) => res.json::<HelixResponse<TwitchUser>>().await.map_err(|e| e.to_string()),
             Err(e) => Err(e.to_string())
         }
    });

    // Await A & B & C
    let (me_result, user_result, channel_result) = tokio::join!(me_future, user_future, channel_future);

    // Unwrap JoinErrors (panics) then Result strings
    let me_data = me_result.map_err(|_| "Join Error Me".to_string())??;
    let user_data = user_result.map_err(|_| "Join Error User".to_string())??;
    let channel_data = channel_result.map_err(|_| "Join Error Channel".to_string())??;

    let me = me_data.data.first().ok_or("Failed to fetch my user info")?;
    let _my_id = me.id.clone();

    let user = user_data.data.first().ok_or("User not found")?;
    
    let channel_login = channel_data.data.first()
        .map(|u| u.login.clone())
        .ok_or("Broadcaster not found")?;

    // Now IVR call
    let ivr_url = format!("https://api.ivr.fi/v2/twitch/subage/{}/{}", user.login, channel_login);
    eprintln!("Fetching IVR data from: {}", ivr_url);

    let ivr_res = client.get(&ivr_url).send().await;

    let mut followed_at = None;
    let mut is_subscribed = false;
    let mut subscription_tier = None;
    let mut months_subscribed = None;

    if let Ok(res) = ivr_res {
        if res.status().is_success() {
            if let Ok(ivr_data) = res.json::<IvrResponse>().await {
                 eprintln!("IVR Data: {:?}", ivr_data);
                 followed_at = ivr_data.followed_at;
                 
                 if let Some(meta) = ivr_data.meta {
                     if let Some(tier) = meta.tier {
                         is_subscribed = true;
                         subscription_tier = Some(tier);
                     }
                 }
                 
                 if let Some(cumulative) = ivr_data.cumulative {
                     months_subscribed = Some(cumulative.months);
                 }
            }
        } else {
             eprintln!("IVR request failed: {}", res.status());
        }
    } else {
         eprintln!("Failed to connect to IVR");
    }

    Ok(TwitchUserCardData {
        display_name: user.display_name.clone(),
        profile_image_url: user.profile_image_url.clone(),
        created_at: user.created_at.clone(),
        followed_at,
        is_subscribed,
        subscription_tier,
        months_subscribed,
    })
}

#[tauri::command]
pub async fn twitch_create_prediction(
    _app: AppHandle,
    state: tauri::State<'_, TwitchAppState>,
    broadcaster_id: String,
    title: String,
    outcomes: Vec<String>,
    prediction_window: u32
) -> Result<(), String> {
    let token = get_token(&state).ok_or("No Twitch token found")?;
    let client = &state.api_client;
    
    let validate_res = client.get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = validate_res.json().await.map_err(|e| e.to_string())?;
    let client_id = json["client_id"].as_str().ok_or("Failed to get Client ID")?;

    let url = "https://api.twitch.tv/helix/predictions";
    let outcomes_json: Vec<_> = outcomes.iter().map(|c| serde_json::json!({"title": c})).collect();
    
    let body = serde_json::json!({
        "broadcaster_id": broadcaster_id,
        "title": title,
        "outcomes": outcomes_json,
        "prediction_window": prediction_window
    });

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Client-Id", client_id)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
         let err_text = res.text().await.unwrap_or_default();
        Err(format!("Failed to create prediction: {}", err_text))
    }
}


#[derive(Serialize, Deserialize, Debug, Clone, Eq, PartialEq, Hash)]
pub struct TwitchEmote {
    pub id: String,
    pub name: String,
    pub emote_type: Option<String>, 
    pub emote_set_id: Option<String>,
    pub owner_id: Option<String>,
    pub format: Vec<String>,
    pub scale: Vec<String>,
    pub theme_mode: Vec<String>,
    pub category: Option<String>, // "global", "channel", "user"
    #[serde(default)]
    pub locked: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UserEmotesResponse {
    pub data: Vec<TwitchEmote>,
    // template and pagination ignored
}

#[tauri::command]
pub async fn twitch_get_user_emotes(
    _app: AppHandle,
    state: tauri::State<'_, TwitchAppState>,
    broadcaster_id: String
) -> Result<Vec<TwitchEmote>, String> {
    let token = get_token(&state).ok_or("No Twitch token found")?;
    let client = &state.api_client;
    
    // 1. Get Client ID (needed for all requests)
    let validate_res = client.get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = validate_res.json().await.map_err(|e| e.to_string())?;
    let client_id = json["client_id"].as_str().ok_or("Failed to get Client ID")?;
    let user_id = json["user_id"].as_str().unwrap_or(&broadcaster_id);

    // Helpers
    let get_emotes = |url: String| {
        let client = client.clone();
        let token = token.clone();
        let client_id = client_id.to_string();
        async move {
            let res = client.get(&url)
                .header("Authorization", format!("Bearer {}", token))
                .header("Client-Id", client_id)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            
            if res.status().is_success() {
                let body = res.text().await.map_err(|e| e.to_string())?;
                let response: UserEmotesResponse = serde_json::from_str(&body).map_err(|e| e.to_string())?;
                Ok(response.data)
            } else {
                 Err(format!("Req Failed: {}", res.status()))
            }
        }
    };

    // 2. Fetch All 3 Sources Concurrent-ish
    // A. User Emotes (Subs, Follows, Bit tiers) - These are UNLOCKED
    let url_user = format!("https://api.twitch.tv/helix/chat/emotes/user?user_id={}", user_id);
    // B. Global Emotes - These are UNLOCKED
    let url_global = "https://api.twitch.tv/helix/chat/emotes/global".to_string();
    // C. Channel Emotes - These include LOCKED ones if not subbed
    let url_channel = format!("https://api.twitch.tv/helix/chat/emotes?broadcaster_id={}", broadcaster_id);

    let (r_user, r_global, r_channel) = tokio::join!(
        get_emotes(url_user),
        get_emotes(url_global),
        get_emotes(url_channel)
    );

    let mut all_emotes = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    let mut process_list = |list: Result<Vec<TwitchEmote>, String>, category: &str, label: &str, is_locked_fallback: bool| {
        match list {
            Ok(emotes) => {
                for mut e in emotes {
                    if !seen_ids.contains(&e.id) {
                        seen_ids.insert(e.id.clone());
                        e.category = Some(category.to_string());
                        
                        // If this list is a fallback (Channel list) and we haven't seen it in User list, 
                        // it effectively means it's locked for the user.
                        if is_locked_fallback {
                             e.locked = true;
                        }
                        
                        all_emotes.push(e);
                    }
                }
            },
            Err(e) => println!("Failed to load {}: {}", label, e),
        }
    };
    
    // Priority order: User -> Global -> Channel (Fallback/Locked)
    // 1. User: Available to user (Channel subs, Bit emotes, Follower emotes)
    process_list(r_user, "User", "User", false); // "User" category might handle channel subs too, but we might want to re-categorize them? 
    // Actually, Helix "User" emotes return all usable emotes.
    // If we want to categorize them nicely, we might need to check their type or owner_id.
    // But for now, let's keep simple logic: User = "Your Emotes".

    // 2. Global: Everyone has these
    process_list(r_global, "Global", "Global", false);

    // 3. Channel: Contains ALL channel emotes. 
    // If we are subbed, they were already in User list (and thus skipped due to seen_ids).
    // If we are NOT subbed, they were NOT in User list, so will be added here.
    // We mark these as LOCKED.
    process_list(r_channel, "Channel", "Channel", true);

    // Post-processing to fix categories
    for e in &mut all_emotes {
        // If it was explicitly loaded as "Channel" (from fallback), keep it as "Channel" (it's likely locked)
        if e.category.as_deref() == Some("Channel") {
             continue;
        }

        // For others (User/Global), check ownership to re-categorize to Channel
        if e.owner_id.as_deref() == Some(&broadcaster_id) {
             e.category = Some("Channel".to_string());
        } else if e.emote_type.as_deref() == Some("global") {
             e.category = Some("Global".to_string());
        } 
        // Else keep "User" (Available, but from other channels/sources)
    }

    Ok(all_emotes)
}
