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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cfg(v: serde_json::Value) -> Config {
        Config(v)
    }

    #[test]
    fn port_defaults_and_overrides() {
        assert_eq!(cfg(json!({})).port(), 47321);
        assert_eq!(cfg(json!({ "overlayPort": 5000 })).port(), 5000);
        assert_eq!(cfg(json!(null)).port(), 47321);
        assert_eq!(cfg(json!({ "overlayPort": "bad" })).port(), 47321);
    }

    #[test]
    fn sound_for_defaults() {
        let c = cfg(json!({}));
        assert_eq!(c.sound_for("done").as_deref(), Some("ting"));
        assert_eq!(c.sound_for("waiting").as_deref(), Some("soft"));
        assert_eq!(c.sound_for("error").as_deref(), Some("buzz"));
        assert_eq!(c.sound_for("unknown"), None);
    }

    #[test]
    fn sound_for_overrides_and_silence() {
        let c = cfg(json!({ "sounds": { "done": "custom", "waiting": "none" } }));
        assert_eq!(c.sound_for("done").as_deref(), Some("custom"));
        assert_eq!(c.sound_for("waiting"), None); // "none" => silent
        assert_eq!(c.sound_for("error").as_deref(), Some("buzz")); // missing key => default
    }
}
