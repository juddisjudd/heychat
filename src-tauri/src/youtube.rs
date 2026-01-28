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
                                // Parse Message
                                let id = item["id"].as_str().unwrap_or("").to_string();
                                let author_name = item.pointer("/authorName/simpleText").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
                                
                                let mut message_text = String::new();
                                if let Some(runs) = item.pointer("/message/runs").and_then(|v| v.as_array()) {
                                    for run in runs {
                                        if let Some(text) = run["text"].as_str() {
                                            message_text.push_str(text);
                                        }
                                        if let Some(emoji) = run.pointer("/emoji/emojiId").and_then(|v| v.as_str()) {
                                            message_text.push_str(emoji); // incomplete but better than nothing
                                        }
                                    }
                                }
                                
                                let is_mod = false; // logic needed
                                let is_vip = false;
                                
                                let chat_message = ChatMessage {
                                    id,
                                    platform: Platform::YouTube,
                                    username: author_name,
                                    message: message_text,
                                    color: None,
                                    badges: vec![],
                                    is_mod, 
                                    is_vip,
                                    timestamp: chrono::Local::now().to_rfc3339(),
                                    emotes: vec![],
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
