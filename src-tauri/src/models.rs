use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Platform {
    Twitch,
    YouTube,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Emote {
    pub id: String,
    pub code: String,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub platform: Platform,
    pub username: String,
    pub message: String,
    pub color: Option<String>,
    pub badges: Vec<String>,
    pub is_mod: bool,
    pub is_vip: bool,
    pub timestamp: String,
    pub emotes: Vec<Emote>,
}
