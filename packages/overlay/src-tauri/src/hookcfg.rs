// hookcfg.rs — enable/disable the cc-ping hook in ~/.claude/settings.json, driven from the app
// (no `node` needed for this — the command we WRITE is run later by Claude Code, which has node).
// We write the same `node "<abs notify.mjs>"` command the CLI installer would, and match
// cc-ping entries by the notify.mjs marker so enable is idempotent and disable is targeted.
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const EVENTS: [&str; 3] = ["Stop", "SubagentStop", "Notification"];

fn settings_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("settings.json"))
}

/// Absolute path to the bundled notify.mjs (falls back to the repo source in a dev run).
pub fn notify_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("hook").join("notify.mjs");
        if bundled.exists() {
            return Some(bundled);
        }
    }
    // Dev fallback: source tree next to this crate (only exists on the build machine).
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("hook")
        .join("notify.mjs");
    dev.canonicalize().ok()
}

fn command_for(app: &AppHandle) -> Option<String> {
    let p = notify_path(app)?;
    let s = p.to_string_lossy();
    // Strip the Windows extended-length prefix (\\?\) canonicalize/resource_dir may add — it
    // works but some shells choke on it, and it's ugly in the user's settings.json.
    let clean = s.strip_prefix(r"\\?\").unwrap_or(&s);
    Some(format!("node \"{}\"", clean))
}

fn is_cc_ping_cmd(cmd: &str) -> bool {
    cmd.contains("notify.mjs")
}

fn block_is_ours(block: &Value) -> bool {
    block
        .get("hooks")
        .and_then(|h| h.as_array())
        .map(|hs| {
            hs.iter().any(|h| {
                h.get("command")
                    .and_then(|c| c.as_str())
                    .map(is_cc_ping_cmd)
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn read_settings() -> Value {
    settings_path()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .filter(|v: &Value| v.is_object())
        .unwrap_or_else(|| json!({}))
}

fn write_settings(v: &Value) -> bool {
    let Some(path) = settings_path() else { return false };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let body = format!("{}\n", serde_json::to_string_pretty(v).unwrap_or_default());
    fs::write(path, body).is_ok()
}

/// Is a cc-ping hook currently registered for any of our events?
pub fn is_enabled() -> bool {
    let s = read_settings();
    let Some(hooks) = s.get("hooks") else { return false };
    EVENTS.iter().any(|ev| {
        hooks
            .get(*ev)
            .and_then(|b| b.as_array())
            .map(|blocks| blocks.iter().any(block_is_ours))
            .unwrap_or(false)
    })
}

/// Register the hook for Stop/SubagentStop/Notification. Idempotent, non-destructive.
pub fn enable(app: &AppHandle) -> bool {
    let Some(cmd) = command_for(app) else { return false };
    let mut s = read_settings();
    if !s.get("hooks").map(|h| h.is_object()).unwrap_or(false) {
        s["hooks"] = json!({});
    }
    for ev in EVENTS {
        let mut arr = s["hooks"][ev].as_array().cloned().unwrap_or_default();
        if !arr.iter().any(block_is_ours) {
            arr.push(json!({ "hooks": [{ "type": "command", "command": cmd.clone() }] }));
        }
        s["hooks"][ev] = Value::Array(arr);
    }
    write_settings(&s)
}

/// Remove only cc-ping's hook blocks. Leaves other user hooks intact.
pub fn disable() -> bool {
    let mut s = read_settings();
    if let Some(hooks) = s.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        for ev in EVENTS {
            if let Some(arr) = hooks.get_mut(ev).and_then(|b| b.as_array_mut()) {
                arr.retain(|block| !block_is_ours(block));
            }
        }
    }
    write_settings(&s)
}
