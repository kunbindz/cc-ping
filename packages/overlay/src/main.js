// main.js — wire the Rust "cc-ping-event" to the mascot, manage the OS window show/hide,
// and coalesce bursts so the mascot doesn't jitter (CONTRACT / MASTER_PLAN Phase 4).
import { Mascot } from "./mascot.js";

const HOLD_MS = 3200; // how long the mascot lingers before running out
const tauri = globalThis.__TAURI__;
const appWindow = tauri?.window?.getCurrentWindow?.();

let holdTimer = null;

const mascot = new Mascot({
  onHidden: () => {
    // Exit animation finished → release the screen.
    appWindow?.hide?.();
  },
});

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

async function handleEvent(payload) {
  const type = payload?.type || "done";
  const project = payload?.project || "";

  mascot.setMood(type, project);

  if (!mascot.isVisible()) {
    // Show the OS window first, then trigger the run-in on the next frame so the
    // off-screen start state paints before the transition.
    await appWindow?.show?.();
    requestAnimationFrame(() => mascot.show());
  }
  // If already visible (burst within the hold window), we just updated the mood
  // and reset the timer below — no re-run, so it never jitters.

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
