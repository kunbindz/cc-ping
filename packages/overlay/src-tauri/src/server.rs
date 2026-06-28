// server.rs — loopback-only HTTP server (CONTRACT §2). GET /health, POST /event.
// Runs on its own thread. Binds 127.0.0.1 ONLY. Accepts display data only — never executes
// anything from the request body.
use crate::{config::Config, sound};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server};

/// Spawn the server thread. If the port is taken, the thread exits quietly (another instance
/// likely owns it; single-instance should normally prevent that).
pub fn start(app: AppHandle, port: u16, quiet: Arc<AtomicBool>) {
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
                    handle_event(&app, &quiet, &body);
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

fn handle_event(app: &AppHandle, quiet: &Arc<AtomicBool>, body: &str) {
    if quiet.load(Ordering::Relaxed) {
        return;
    }
    let value: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return, // drop malformed silently
    };
    let kind = value.get("type").and_then(|v| v.as_str()).unwrap_or("done");
    // Sound is played natively here; the visual mascot is driven by the frontend.
    let cfg = Config::load();
    if let Some(name) = cfg.sound_for(kind) {
        sound::play(&name);
    }
    // Forward the raw payload to the mascot window's frontend.
    let _ = app.emit_to("mascot", "cc-ping-event", value);
}
