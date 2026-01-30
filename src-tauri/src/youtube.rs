use crate::models::{ChatMessage, Platform};
use reqwest::Client;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use regex::Regex;
use std::time::Duration;

pub async fn start_youtube_handler(app: AppHandle, video_id: String) {
    let app_clone = app.clone();
    
    // 1. Extract Video ID from URL if needed
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .unwrap_or_default();

    // 0. Pre-process Input: Handle "ThePrimeTimeagen" (no @) and full Channel URLs
    let mut candidate_input = video_id.trim().to_string();
    if candidate_input.contains("youtube.com/@") && !candidate_input.contains("/live") {
        candidate_input = format!("{}/live", candidate_input);
    } else if !candidate_input.contains("youtube.com") && !candidate_input.contains("youtu.be") && !candidate_input.starts_with('@') && candidate_input.len() > 11 {
        // likely a handle without @?
        candidate_input = format!("@{}", candidate_input);
    }

    // 1. Resolve Video ID
    let video_id_clean = if candidate_input.starts_with('@') || candidate_input.contains("/live") {
        let live_url = if candidate_input.starts_with('@') {
            format!("https://www.youtube.com/{}/live", candidate_input)
        } else {
            candidate_input.clone()
        };
        
        eprintln!("Resolving handle/url {}...", live_url);
        
        match client.get(&live_url).send().await {
            Ok(resp) => {
                let final_url = resp.url().as_str().to_string();
                eprintln!("Redirected to: {}", final_url);
                
                // Strategy A: URL check
                let mut resolved_id = String::new();
                if let Some(pos) = final_url.find("v=") {
                    resolved_id = final_url[pos + 2..].split('&').next().unwrap_or("").to_string();
                } else if let Some(pos) = final_url.find("/live/") {
                     resolved_id = final_url[pos + 6..].split('?').next().unwrap_or("").to_string();
                }

                // Strategy B: HTML Content check (if URL failed or we want to be sure)
                if resolved_id.is_empty() {
                    eprintln!("URL pattern match failed. checking HTML content...");
                    let html = resp.text().await.unwrap_or_default();
                    // Look for <link rel="canonical" href="https://www.youtube.com/watch?v=...">
                    let canonical_regex = Regex::new(r#"link rel="canonical" href="https://www.youtube.com/watch\?v=([^"]+)""#).unwrap();
                    if let Some(caps) = canonical_regex.captures(&html) {
                        resolved_id = caps.get(1).map_or("", |m| m.as_str()).to_string();
                        eprintln!("Found canonical Video ID: {}", resolved_id);
                    } else {
                         // Fallback: look for videoId":"..."
                         let fallback_regex = Regex::new(r#""videoId":"([^"]+)""#).unwrap();
                         if let Some(caps) = fallback_regex.captures(&html) {
                              resolved_id = caps.get(1).map_or("", |m| m.as_str()).to_string();
                              eprintln!("Found embedded Video ID: {}", resolved_id);
                         }
                    }
                }
                
                if !resolved_id.is_empty() {
                    resolved_id
                } else {
                    eprintln!("Could not resolve live stream from {}. Is the user live?", final_url);
                    candidate_input // Fallback to original, maybe it was a weird ID?
                }
            }
            Err(e) => {
                eprintln!("Failed to resolve handle: {}", e);
                candidate_input
            }
        }
    } else if candidate_input.contains("youtube.com") || candidate_input.contains("youtu.be") {
        if let Some(pos) = candidate_input.find("v=") {
            candidate_input[pos + 2..].split('&').next().unwrap_or("").to_string()
        } else if let Some(pos) = candidate_input.rfind('/') {
             candidate_input[pos + 1..].split('?').next().unwrap_or("").to_string()
        } else {
             candidate_input
        }
    } else {
        candidate_input
    };

    eprintln!("Starting YouTube chat for video: {}", video_id_clean);
    app_clone.emit("youtube-connected", &video_id_clean).unwrap_or(());

    // Reuse client? Or just make new one. The simple polling logic makes a new one.
    // But we already have one. Let's reuse 'client' if possible, or just shadow it/ignore.
    // The strict client above was for resolution.
    // The loop below uses a new client. That's fine for now to minimize refactor risk.
    let client = Client::new();

    // 2. Fetch Video Page to get API Key and Continuation
    let url = format!("https://www.youtube.com/watch?v={}", video_id_clean);
    let html = match client.get(&url).header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36").send().await {
        Ok(resp) => resp.text().await.unwrap_or_default(),
        Err(e) => {
            eprintln!("Failed to fetch YouTube page: {}", e);
            return;
        }
    };

    // ... (rest of function) ...


    // 3. Extract API Key
    let api_key_regex = Regex::new(r#""INNERTUBE_API_KEY":"([^"]+)""#).unwrap();
    let api_key = match api_key_regex.captures(&html) {
        Some(caps) => caps.get(1).map_or("", |m| m.as_str()).to_string(),
        None => {
            eprintln!("Could not find INNERTUBE_API_KEY. Is the video live?");
            // Log a snippet of HTML for debugging if needed, or just return
             eprintln!("HTML Snippet: {}", &html[0..500.min(html.len())]);
            return;
        }
    };

    // 4. Extract Continuation Token
    // Usually in "continuation":"..." inside "liveChatRenderer"
    // Since parsing the huge JSON is hard with regex, we try to find the specific live chat continuation
    // Pattern: "continuation":"<token>"
    // But there are many continuations. We want the one for live chat.
    // Ideally parse ytInitialData.
    let continuation_regex = Regex::new(r#""continuation":"([^"]+)""#).unwrap();
    // We search the HTML. It's risky but often works for the *first* one if it's a live video.
    // Better: look for "liveChatRenderer".
    
    let mut continuation = String::new();
    
    if let Some(pos) = html.find("liveChatRenderer") {
        let substring = &html[pos..];
        if let Some(caps) = continuation_regex.captures(substring) {
            continuation = caps.get(1).map_or("", |m| m.as_str()).to_string();
        }
    }

    if continuation.is_empty() {
         eprintln!("Could not find initial continuation token. Stream might be offline or no chat.");
         // Try one generic search
         if let Some(caps) = continuation_regex.captures(&html) {
             continuation = caps.get(1).map_or("", |m| m.as_str()).to_string();
             eprintln!("Found a continuation, trying it: {}", continuation);
         } else {
             return;
         }
    }

    eprintln!("Found API Key: {}...", &api_key[0..5]);
    eprintln!("Initial Continuation: {}...", &continuation[0..10]);

    // 5. Polling Loop
    // Filter out messages older than connection time
    let start_time = std::time::SystemTime::now();
    
    let mut polling = true;
    while polling {
        let chat_url = format!("https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key={}", api_key);
        
        let body = serde_json::json!({
            "context": {
                "client": {
                    "clientName": "WEB",
                    "clientVersion": "2.20230622.06.00" // A somewhat recent version
                }
            },
            "continuation": continuation
        });

        match client.post(&chat_url).json(&body).send().await {
            Ok(resp) => {
                if let Ok(json) = resp.json::<Value>().await {
                    // Extract actions
                    if let Some(actions) = json.pointer("/continuationContents/liveChatContinuation/actions").and_then(|v| v.as_array()) {
                        for action in actions {
                            if let Some(item) = action.pointer("/addChatItemAction/item/liveChatTextMessageRenderer") {
                                // Parse Timestamp first to filter history
                                let timestamp_usec_str = item["timestampUsec"].as_str().unwrap_or("0");
                                let timestamp_usec: u64 = timestamp_usec_str.parse().unwrap_or(0);
                                let timestamp_micros = start_time.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_micros() as u64;
                                
                                // Buffer of 10 seconds? Or strict? 
                                // If message is older than start_time, ignore it.
                                // NOTE: YouTube sends history batch. We want to skip it.
                                if timestamp_usec < timestamp_micros {
                                    continue;
                                }

                                // Parse Message
                                let id = item["id"].as_str().unwrap_or("").to_string();
                                let author_name = item.pointer("/authorName/simpleText").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
                                
                                let mut message_text = String::new();
                                let mut emotes = Vec::new();

                                if let Some(runs) = item.pointer("/message/runs").and_then(|v| v.as_array()) {
                                    for run in runs {
                                        if let Some(text) = run["text"].as_str() {
                                            message_text.push_str(text);
                                        } else if let Some(emoji_node) = run.pointer("/emoji") {
                                            // Handle Emoji
                                            let mut emoji_text = "".to_string();
                                            
                                            // 1. Try to find a shortcut (e.g. :cat:) to use as text representation
                                            if let Some(shortcuts) = emoji_node.pointer("/shortcuts").and_then(|v| v.as_array()) {
                                                if let Some(first) = shortcuts.first().and_then(|v| v.as_str()) {
                                                    emoji_text = first.to_string();
                                                }
                                            }
                                            
                                            // Fallback to emojiId if no shortcut
                                            if emoji_text.is_empty() {
                                                if let Some(id) = emoji_node["emojiId"].as_str() {
                                                    emoji_text = id.to_string();
                                                }
                                            }

                                            // 2. Get the Image URL
                                            let mut image_url = "".to_string();
                                            if let Some(thumbnails) = emoji_node.pointer("/image/thumbnails").and_then(|v| v.as_array()) {
                                                 // Usually the last one is biggest? Or first? checking 0 is usually fine for chat
                                                 if let Some(url) = thumbnails.first().and_then(|t| t["url"].as_str()) {
                                                     image_url = url.to_string();
                                                 }
                                            }

                                            if !emoji_text.is_empty() {
                                                // Frontend/JS usually uses simple string index (UTF-16) or similar.
                                                // Rust string len is bytes.
                                                // For simple emojis and text, we will use bytes for now as a proxy.
                                                let start_index = message_text.len(); 
                                                
                                                message_text.push_str(&emoji_text);
                                                
                                                if !image_url.is_empty() {
                                                    use crate::models::Emote;
                                                    emotes.push(Emote {
                                                        id: image_url,
                                                        code: emoji_text.clone(),
                                                        start: start_index, // This is technically BYTE offset. 
                                                        end: start_index + emoji_text.len() - 1,
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                let mut is_mod = false;
                                let mut is_member = false;
                                
                                if let Some(badges) = item.pointer("/authorBadges").and_then(|v| v.as_array()) {
                                    for badge in badges {
                                        if let Some(tooltip) = badge.pointer("/liveChatAuthorBadgeRenderer/tooltip").and_then(|v| v.as_str()) {
                                            if tooltip.contains("Moderator") {
                                                is_mod = true;
                                            } else if tooltip.contains("Member") {
                                                is_member = true;
                                            }
                                        }
                                    }
                                }
                                
                                let is_vip = false; 

                                let mut color = None;
                                if is_mod {
                                    color = Some("#5e84f1".to_string()); // YouTube Mod Blue
                                } else if is_member {
                                    color = Some("#0f9d58".to_string()); // YouTube Member Green
                                }
                                
                                let chat_message = ChatMessage {
                                    id,
                                    platform: Platform::YouTube,
                                    username: author_name,
                                    message: message_text,
                                    color,
                                    badges: vec![],
                                    is_mod, 
                                    is_vip,
                                    is_member,
                                    timestamp: chrono::Local::now().to_rfc3339(),
                                    emotes,
                                    msg_type: "chat".to_string(),
                                    system_message: None,
                                };
                                
                                app_clone.emit("chat-message", chat_message).unwrap_or(());
                            }
                        }
                    } else {
                        // eprintln!("No actions in response");
                    }

                    // Update Continuation
                    if let Some(new_cont) = json.pointer("/continuationContents/liveChatContinuation/continuations/0/invalidationContinuationData/continuation")
                        .or_else(|| json.pointer("/continuationContents/liveChatContinuation/continuations/0/timedContinuationData/continuation"))
                        .and_then(|v| v.as_str()) 
                    {
                        continuation = new_cont.to_string();
                    } else {
                         eprintln!("No next continuation found. Stopping.");
                         polling = false;
                    }
                } else {
                     eprintln!("Failed to parse JSON");
                }
            }
            Err(e) => {
                eprintln!("Chat request failed: {}", e);
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
        
        tokio::time::sleep(Duration::from_secs(1)).await; // Polling interval
    }
}

#[derive(serde::Deserialize, Debug)]
struct VideoListResponse {
    items: Vec<VideoItem>,
}

#[derive(serde::Deserialize, Debug)]
struct VideoItem {
    #[serde(rename = "liveStreamingDetails")]
    live_streaming_details: Option<LiveStreamingDetails>,
}

#[derive(serde::Deserialize, Debug)]
#[allow(dead_code)]
struct LiveStreamingDetails {
    #[serde(rename = "activeLiveChatId")]
    active_live_chat_id: Option<String>,
    #[serde(rename = "actualStartTime")]
    actual_start_time: Option<String>,
    #[serde(rename = "actualEndTime")]
    actual_end_time: Option<String>,
    #[serde(rename = "scheduledStartTime")]
    scheduled_start_time: Option<String>,
    #[serde(rename = "isChatModerator")]
    is_chat_moderator: Option<bool>,
}

#[tauri::command]
pub async fn send_youtube_message(video_id: String, message: String, token: String) -> Result<(), String> {
    eprintln!("DEBUG: send_youtube_message called.");
    eprintln!("DEBUG: Input Video ID: {}", video_id);
    eprintln!("DEBUG: Token starts with: {:.10}...", token);

    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap_or_default();

    // 0. Verify Token Scopes
    let scope_url = format!("https://www.googleapis.com/oauth2/v3/tokeninfo?access_token={}", token);
    eprintln!("DEBUG: Checking Token Scopes: {}", scope_url);
    let scope_resp = client.get(&scope_url).send().await.map_err(|e| format!("Scope check failed: {}", e))?;
    
    if scope_resp.status().is_success() {
        let scope_json: Value = scope_resp.json().await.unwrap_or(serde_json::json!({}));
        if let Some(scope) = scope_json.get("scope").and_then(|s| s.as_str()) {
            eprintln!("DEBUG: Token Scopes: {}", scope);
            if !scope.contains("youtube.force-ssl") && !scope.contains("youtube") { // "youtube" is the full scope, force-ssl is the other one
                return Err("Missing 'youtube.force-ssl' scope. Please log out and log in again.".to_string());
            }
        } else {
             eprintln!("DEBUG: Could not parse scopes from response: {:?}", scope_json);
        }
    } else {
         eprintln!("DEBUG: Token check failed. Status: {}", scope_resp.status());
    }

    // 0. Verify YouTube Data API Access AND Channel Existence
    let probe_url = "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true";
    eprintln!("DEBUG: Probing YouTube Data API: {}", probe_url);
    let probe_resp = client.get(probe_url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("Probe failed: {}", e))?;
        
    if !probe_resp.status().is_success() {
        let status = probe_resp.status();
        let body = probe_resp.text().await.unwrap_or_default();
        eprintln!("DEBUG: YouTube Data API Probe Failed. Status: {}, Body: {}", status, body);
        if status.as_u16() == 403 || status.as_u16() == 404 {
            return Err("YouTube Data API v3 is likely NOT enabled in Google Cloud Console. Enable it here: https://console.cloud.google.com/apis/library/youtube.googleapis.com".to_string());
        }
        return Err(format!("YouTube Data API Probe failed: [{}] {}", status, body));
    }

    // Check if user actually has a channel
    let probe_json: Value = probe_resp.json().await.unwrap_or(serde_json::json!({}));
    if let Some(items) = probe_json.get("items").and_then(|i| i.as_array()) {
        if items.is_empty() {
            eprintln!("DEBUG: Probe returned 0 channels. User likely has no YouTube Channel created.");
            return Err("Your Google Account does not have a YouTube Channel. You must create a channel to use Live Chat.".to_string());
        } else {
             eprintln!("DEBUG: Probe found {} channel(s). ID: {:?}", items.len(), items[0].pointer("/id"));
        }
    } else {
        eprintln!("DEBUG: Probe response format unexpected: {:?}", probe_json);
    }

    // 1. Get Live Chat ID
    let list_url = format!("https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={}", video_id);
    eprintln!("DEBUG: Fetching video details from: {}", list_url);
    
    let resp = client.get(&list_url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("Network error fetching video: {}", e))?;

    if !resp.status().is_success() {
         let status = resp.status();
         let txt = resp.text().await.unwrap_or_default();
         eprintln!("DEBUG: Failed to get video details. Status: {}", status);
         return Err(format!("Failed to get video details: {}", txt));
    }

    let list_data: VideoListResponse = resp.json().await.map_err(|e| format!("JSON parse error (video): {}", e))?;
    
    if list_data.items.is_empty() {
        eprintln!("DEBUG: Video details response has 0 items.");
        return Err("No video found with that ID".to_string());
    }

    let item = list_data.items.first().unwrap();
    let details = item.live_streaming_details.as_ref();
    
    eprintln!("DEBUG: Live Streaming Details: {:?}", details);

    if let Some(d) = details {
        if let Some(end_time) = &d.actual_end_time {
            eprintln!("DEBUG: Stream has ended at {}", end_time);
            return Err("Cannot send message: The live stream has ended.".to_string());
        }
    }

    let chat_id = details
        .and_then(|d| d.active_live_chat_id.as_ref())
        .ok_or("No active live chat found. Is the stream live?")?;

    eprintln!("DEBUG: Found Live Chat ID: {}", chat_id);

    // 1.5 Verify Chat ID access (GET list)
    let encoded_chat_id = urlencoding::encode(chat_id);
    let check_url = format!("https://www.googleapis.com/youtube/v3/liveChatMessages?liveChatId={}&part=snippet", encoded_chat_id);
    eprintln!("DEBUG: GET Check URL: {}", check_url);

    let check_resp = client.get(&check_url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    if !check_resp.status().is_success() {
        let s = check_resp.status();
        let t = check_resp.text().await.unwrap_or_default();
        eprintln!("DEBUG: GET check failed. Status: {}, Body: {}", s, t);
        // We warn but proceed? Or fail? If GET fails, POST will likely fail.
        // It's useful to know.
    } else {
        eprintln!("DEBUG: GET check passed (Live Chat is readable).");
    }

    // 2. Post Message
    let url = "https://www.googleapis.com/youtube/v3/liveChatMessages?part=snippet";
    
    let body = serde_json::json!({
        "snippet": {
            "liveChatId": chat_id,
            "type": "textMessageEvent",
            "textMessageDetails": {
                "messageText": message
            }
        }
    });

    eprintln!("DEBUG: Posting message to {}", url);
    let post_resp = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !post_resp.status().is_success() {
        let status = post_resp.status();
        let txt = post_resp.text().await.unwrap_or_default();
        eprintln!("Failed to send YouTube message. Status: {}, Body: {}", status, txt);
        return Err(format!("Failed to send message: [{}] {}", status, txt));
    }

    eprintln!("DEBUG: Message sent successfully!");
    Ok(())
}
