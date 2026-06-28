// mascot.js — owns the mascot DOM: mood (expression) + show/hide animation state machine.
// States: hidden → runIn → hold → runOut → hidden. Sound is played natively by the Rust
// side (see src-tauri/src/sound.rs), so this module is visuals only.

const MOODS = {
  done: { cls: "mood-done", text: (p) => `✓ ${p || "Claude"} — task done` },
  waiting: { cls: "mood-waiting", text: (p) => `${p || "Claude"} — đang đợi bạn` },
  error: { cls: "mood-error", text: (p) => `${p || "Claude"} — cần chú ý` },
};

export class Mascot {
  /**
   * @param {{onHidden: () => void}} hooks  onHidden fires after the exit animation completes.
   */
  constructor({ onHidden }) {
    this.stage = document.getElementById("stage");
    this.pip = document.getElementById("pip");
    this.bubbleText = document.getElementById("bubble-text");
    this.onHidden = onHidden;
    this.visible = false;

    // When the exit transition finishes, finalize → hidden.
    this.pip.addEventListener("transitionend", (e) => {
      if (e.propertyName !== "transform") return;
      if (!this.visible) this.onHidden?.();
    });
  }

  /** Set the expression + bubble text for an event type. */
  setMood(type, project) {
    const mood = MOODS[type] || MOODS.done;
    this.pip.classList.remove("mood-done", "mood-waiting", "mood-error");
    this.pip.classList.add(mood.cls);
    this.bubbleText.textContent = mood.text(project);
    // retrigger the wave/shake accent
    this.pip.classList.remove("waving");
    void this.pip.offsetWidth; // force reflow so the animation restarts
    this.pip.classList.add("waving");
  }

  /** Run the mascot in (idempotent while already shown). */
  show() {
    this.visible = true;
    this.stage.classList.add("show");
  }

  /** Run the mascot out. onHidden fires when the exit transition ends. */
  hide() {
    this.visible = false;
    this.stage.classList.remove("show");
  }

  isVisible() {
    return this.visible;
  }
}
