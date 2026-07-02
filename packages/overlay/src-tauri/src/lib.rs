// lib.rs — cc-ping overlay app wiring: single-instance, hidden always-on-top window,
// system tray (Quiet toggle + Quit), and the loopback event server.
mod config;
mod hookcfg;
mod server;
mod sound;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager, PhysicalPosition,
};
use tauri_plugin_autostart::ManagerExt;

/// Position the window in the bottom-right of its current monitor, with a margin.
fn position_bottom_right(win: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = win.current_monitor() {
        if let Ok(wsize) = win.outer_size() {
            let msize = monitor.size();
            let mpos = monitor.position();
            let margin = (24.0 * monitor.scale_factor()) as i32;
            let x = mpos.x + msize.width as i32 - wsize.width as i32 - margin;
            let y = mpos.y + msize.height as i32 - wsize.height as i32 - margin;
            let _ = win.set_position(PhysicalPosition::new(x, y));
        }
    }
}

pub fn run() {
    let quiet = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        // Single instance: a second launch is a no-op (the first owns the port).
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup({
            let quiet = quiet.clone();
            move |app| {
                let cfg = config::Config::load();
                let port = cfg.port();

                if let Some(win) = app.get_webview_window("mascot") {
                    position_bottom_right(&win);
                    // Click-through so the overlay never blocks the desktop (CLAUDE.md gotcha #5).
                    let _ = win.set_ignore_cursor_events(true);
                }

                // ── System tray ──
                let enable_item = CheckMenuItem::with_id(
                    app,
                    "toggle_enable",
                    "Enabled in Claude Code",
                    true,
                    hookcfg::is_enabled(),
                    None::<&str>,
                )?;
                let startup_item = CheckMenuItem::with_id(
                    app,
                    "toggle_startup",
                    "Start at login",
                    true,
                    app.autolaunch().is_enabled().unwrap_or(false),
                    None::<&str>,
                )?;
                let quiet_item =
                    CheckMenuItem::with_id(app, "quiet", "Quiet", true, false, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let sep = PredefinedMenuItem::separator(app)?;
                let menu = Menu::with_items(
                    app,
                    &[&enable_item, &startup_item, &quiet_item, &sep, &quit_item],
                )?;

                let quiet_for_menu = quiet.clone();
                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("cc-ping")
                    .menu(&menu)
                    .on_menu_event(move |app, event| match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "quiet" => {
                            let now = !quiet_for_menu.load(Ordering::Relaxed);
                            quiet_for_menu.store(now, Ordering::Relaxed);
                            let _ = quiet_item.set_checked(now);
                        }
                        "toggle_enable" => {
                            if hookcfg::is_enabled() {
                                hookcfg::disable();
                            } else {
                                hookcfg::enable(app);
                            }
                            let _ = enable_item.set_checked(hookcfg::is_enabled());
                        }
                        "toggle_startup" => {
                            let al = app.autolaunch();
                            if al.is_enabled().unwrap_or(false) {
                                let _ = al.disable();
                            } else {
                                let _ = al.enable();
                            }
                            let _ = startup_item.set_checked(al.is_enabled().unwrap_or(false));
                        }
                        _ => {}
                    })
                    .build(app)?;

                // ── Loopback event server ──
                let hide_gen = Arc::new(AtomicU64::new(0));
                server::start(app.handle().clone(), port, quiet.clone(), hide_gen);
                Ok(())
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building cc-ping overlay")
        .run(|_app, event| {
            // Tray app: stay alive even with no visible windows.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
