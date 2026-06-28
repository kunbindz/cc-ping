// sound.rs — play a short clip natively via rodio. Played from Rust (not the webview) to
// avoid webview autoplay restrictions (see CLAUDE.md gotcha #4). Clips are embedded at
// compile time so there are no runtime file-path concerns.
use std::io::Cursor;

const TING: &[u8] = include_bytes!("../../assets/sounds/ting.wav");
const SOFT: &[u8] = include_bytes!("../../assets/sounds/soft.wav");
const BUZZ: &[u8] = include_bytes!("../../assets/sounds/buzz.wav");

/// Play a clip by name on a detached thread. Unknown name or audio failure → silent no-op.
pub fn play(name: &str) {
    let bytes: &'static [u8] = match name {
        "ting" => TING,
        "soft" => SOFT,
        "buzz" => BUZZ,
        _ => return,
    };
    std::thread::spawn(move || {
        // OutputStream must stay alive until playback ends.
        if let Ok((_stream, handle)) = rodio::OutputStream::try_default() {
            if let Ok(sink) = rodio::Sink::try_new(&handle) {
                if let Ok(source) = rodio::Decoder::new(Cursor::new(bytes)) {
                    sink.append(source);
                    sink.sleep_until_end();
                }
            }
        }
    });
}
