// main.js — wire the Rust "cc-ping-event" to the mascot, manage the OS window show/hide,
// and coalesce bursts so the mascot doesn't jitter (CONTRACT / MASTER_PLAN Phase 4).
import { Mascot } from "./mascot.js";

const HOLD_MS = 3200; // how long the mascot lingers before running out
const tauri = globalThis.__TAURI__;

let holdTimer = null;

// The OS window is shown/hidden by the Rust side (server.rs) — reliably, since it lives in the
// same handler that plays the sound. The frontend only animates the crab inside that window.
const mascot = new Mascot({ onHidden: () => {} });

function clearHold() {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function scheduleHide() {
  clearHold();
  holdTimer = setTimeout(() => {
    holdTimer = null;
    mascot.hide();
  }, HOLD_MS);
}

function handleEvent(payload) {
  const type = payload?.type || "done";

  mascot.setMood(type);

  // Rust has already shown the window; run the crab in (or just update mood on a burst).
  if (!mascot.isVisible()) {
    mascot.show();
  }
  scheduleHide();
}

if (tauri?.event?.listen) {
  tauri.event.listen("cc-ping-event", (e) => {
    try {
      handleEvent(e.payload);
    } catch {
      /* never let a UI error wedge the overlay */
    }
  });
} else {
  // Running outside Tauri (e.g. a plain browser during design work): expose a manual
  // trigger so the animation can be previewed. window.__ccPingTest({type:'done',project:'x'})
  globalThis.__ccPingTest = (payload) => handleEvent(payload);
}
