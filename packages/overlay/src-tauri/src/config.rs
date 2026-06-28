// config.rs — read ~/.cc-ping/config.json (CONTRACT §4). Never panics; falls back per-key.
use serde_json::Value;
use std::fs;

pub struct Config(Value);

impl Config {
    /// Load ~/.cc-ping/config.json. Missing/malformed → empty (defaults apply per-getter).
    pub fn load() -> Self {
        let path = dirs::home_dir().map(|h| h.join(".cc-ping").join("config.json"));
        let value = path
            .and_then(|p| fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .unwrap_or(Value::Null);
        Config(value)
    }

    /// Loopback port. Default 47321.
    pub fn port(&self) -> u16 {
        self.0
            .get("overlayPort")
            .and_then(|v| v.as_u64())
            .map(|n| n as u16)
            .unwrap_or(47321)
    }

    /// Sound name for an event type, honoring config.sounds. None = play nothing.
    /// Defaults: done→ting, waiting→soft, error→buzz. A value of "none"/null/false → silent.
    pub fn sound_for(&self, kind: &str) -> Option<String> {
        let default = match kind {
            "done" => "ting",
            "waiting" => "soft",
            "error" => "buzz",
            _ => return None,
        };
        match self.0.get("sounds").and_then(|s| s.get(kind)) {
            None => Some(default.to_string()),
            Some(Value::String(name)) if name != "none" => Some(name.clone()),
            Some(_) => None,
        }
    }
}
