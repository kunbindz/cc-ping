// Prevent a console window on Windows release builds (tray app).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cc_ping_overlay_lib::run();
}
