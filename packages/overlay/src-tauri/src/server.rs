// server.rs — loopback-only HTTP server (CONTRACT §2). GET /health, POST /event.
// Runs on its own thread. Binds 127.0.0.1 ONLY. Accepts display data only — never executes
// anything from the request body.
use crate::{config::Config, sound};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Header, Method, Response, Server};

// The mascot window auto-hides this long after the last event (run-in + hold + run-out fit
// inside it). Window visibility is owned by Rust here — not the webview — so it is reliable.
const AUTO_HIDE_MS: u64 = 5000;

/// Spawn the server thread. If the port is taken, the thread exits quietly (another instance
/// likely owns it; single-instance should normally prevent that).
pub fn start(app: AppHandle, port: u16, quiet: Arc<AtomicBool>, hide_gen: Arc<AtomicU64>) {
    std::thread::spawn(move || {
        let server = match Server::http(format!("127.0.0.1:{port}")) {
            Ok(s) => s,
            Err(_) => return,
        };
        for mut request in server.incoming_requests() {
            let method = request.method().clone();
            let url = request.url().to_string();
            match (method, url.as_str()) {
                (Method::Get, "/health") => {
                    let body = format!(
                        "{{\"ok\":true,\"version\":\"{}\"}}",
                        env!("CARGO_PKG_VERSION")
                    );
                    let header =
                        Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
                    let _ = request
                        .respond(Response::from_string(body).with_header(header).with_status_code(200));
                }
                (Method::Post, "/event") => {
                    let mut body = String::new();
                    let _ = request.as_reader().read_to_string(&mut body);
                    handle_event(&app, &quiet, &hide_gen, &body);
                    // Always 204 — never surface errors back toward the hook (CONTRACT §2).
                    let _ = request.respond(Response::empty(204));
                }
                _ => {
                    let _ = request.respond(Response::empty(404));
                }
            }
        }
    });
}

fn handle_event(app: &AppHandle, quiet: &Arc<AtomicBool>, hide_gen: &Arc<AtomicU64>, body: &str) {
    if quiet.load(Ordering::Relaxed) {
        return;
    }
    let value: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return, // drop malformed silently
    };
    let kind = value.get("type").and_then(|v| v.as_str()).unwrap_or("done");

    // Sound is played natively here.
    let cfg = Config::load();
    if let Some(name) = cfg.sound_for(kind) {
        sound::play(&name);
    }

    // Show the mascot window from Rust (reliable), then let the frontend animate the crab.
    if let Some(win) = app.get_webview_window("mascot") {
        let _ = win.show();
    }
    let _ = app.emit_to("mascot", "cc-ping-event", value);

    // Auto-hide after the animation, unless another event arrives first (generation guard).
    let generation = hide_gen.fetch_add(1, Ordering::Relaxed) + 1;
    let app = app.clone();
    let hide_gen = hide_gen.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(AUTO_HIDE_MS));
        if hide_gen.load(Ordering::Relaxed) == generation {
            if let Some(win) = app.get_webview_window("mascot") {
                let _ = win.hide();
            }
        }
    });
}
