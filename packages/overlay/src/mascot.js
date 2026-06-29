// mascot.js — "Chef Crab", a pixel-art mascot on a <canvas>.
// State machine: hidden → run (in from the right, hopping) → cheer (wave + speech bubble,
// held) → runout (back off-screen) → hidden. Sound is played natively by Rust (sound.rs);
// this module is visuals only. Pixel art adapted from a Claude artifact design.

const PX = 5;
const COL = {
  ".": null, " ": null,
  D: "#8f3318", M: "#d4622e", L: "#f0915f", S: "#b14a22",
  W: "#ffffff", B: "#20140f", P: "#f6a98a",
  H: "#ffffff", G: "#d9d9d9", K: "#6e2410",
};

// ── pixel layers ──
const shell = [
  "........DDDDDDDD........",
  ".......DLLLLLLLLD.......",
  "......DLLLLLLLLLLD......",
  ".....DMMMMMMMMMMMMD.....",
  "....DMMMMMMMMMMMMMMD....",
  "....DMMMWWMMMMWWMMMD....",
  "....DMMMWBMMMMBWMMMD....",
  "....DMMMMMMMMMMMMMMD....",
  "....DMPMMKMMMMKMMPMD....",
  "....DMMMMMKKKKMMMMMD....",
  ".....DMMMMMMMMMMMMD.....",
  ".....DSSSSSSSSSSSSD.....",
  "......DDDDDDDDDDDD......",
];
const hat = [
  "........HH.HH.HH........",
  ".......HHHHHHHHHH.......",
  ".......HHHHHHHHHH.......",
  "........HHHHHHHH........",
  "........GGGGGGGG........",
];
const legAttach = ".......M..M..M..M.......";
const feetStraight = ".......M..M..M..M.......";
const feetSplay = "......M..M....M..M......";
const legsA = [legAttach, feetStraight];
const legsB = [legAttach, feetSplay];

const clawBig = [
  ".DDDDD.", "DMMMMLD", "DMMMMMD", ".DDMMMD", "...DMMD",
  ".DDMMMD", "DMMMMMD", "DMMMMLD", ".DDDDD.",
];
const clawSmall = [
  ".DDD.", "DMMLD", "DMMD.", "DMMD.", "DMMMD", ".DDD.",
];

const HAT_Y = 4, BODY_Y = 9, LEG_Y = 21;

// English by default. Single line — no project name (deliberately kept minimal).
const MOODS = {
  done: "🍳 Claude finished cooking!",
  waiting: "🦀 Claude is waiting for you",
  error: "🔥 Claude needs your attention",
};

export class Mascot {
  /** @param {{onHidden: () => void}} hooks  onHidden fires after the run-out completes. */
  constructor({ onHidden }) {
    this.cv = document.getElementById("crab");
    this.ctx = this.cv.getContext("2d");
    this.bubble = document.getElementById("bubble");
    this.bubbleText = document.getElementById("bubble-text");
    this.onHidden = onHidden;

    this.type = "done";
    this.phase = "hidden";
    this.frame = 0;
    this.blinkT = 0;
    this.blink = false;
    this.posX = 0;
    this.raf = null;
  }

  _metrics() {
    const host = this.cv.parentElement;
    this.cw = host.clientWidth;
    this.ch = host.clientHeight;
    this.canvasW = this.cv.clientWidth;
    this.canvasH = this.cv.clientHeight;
    this.startLeft = this.cw + 40;
    this.finalLeft = this.cw / 2 - this.canvasW / 2;
    this.baseTop = Math.max(12, this.ch - this.canvasH - 14);
  }

  setMood(type) {
    this.type = MOODS[type] ? type : "done";
    this.bubbleText.textContent = MOODS[this.type];
  }

  /** Run in (or reverse a run-out back in). */
  show() {
    this._metrics();
    if (this.phase === "hidden") {
      this.posX = this.startLeft;
      this.cv.style.left = this.posX + "px";
      this.cv.style.top = this.baseTop + "px";
      this.phase = "run";
      this.frame = 0;
      this._hideBubble();
    } else if (this.phase === "runout") {
      this.phase = "run";
      this.frame = 0;
    }
    this._ensureLoop();
  }

  /** Run out. onHidden fires when the crab is fully off-screen. */
  hide() {
    if (this.phase === "run" || this.phase === "cheer") {
      this.phase = "runout";
      this.frame = 0;
      this._hideBubble();
    }
  }

  isVisible() {
    return this.phase === "run" || this.phase === "cheer";
  }

  _ensureLoop() {
    if (this.raf === null) this._loop();
  }

  _showBubble() {
    // Sit the bubble just above the crab's head (its tail points down at the crab).
    const top = Math.max(6, this.baseTop - this.bubble.offsetHeight - 2);
    this.bubble.style.top = top + "px";
    this.bubble.classList.add("show");
  }
  _hideBubble() {
    this.bubble.classList.remove("show");
  }

  _loop() {
    this.frame++;
    this.blinkT++;
    if (!this.blink && this.blinkT > 110) { this.blink = true; this.blinkT = 0; }
    if (this.blink && this.blinkT > 7) { this.blink = false; this.blinkT = 0; }

    if (this.phase === "run") {
      this.posX -= 7;
      const hop = Math.abs(Math.sin(this.frame / 5)) * 9; // hop: lift the whole canvas
      this.cv.style.left = this.posX + "px";
      this.cv.style.top = this.baseTop - hop + "px";
      const leg = Math.floor(this.frame / 5) % 2 === 0 ? "A" : "B";
      this._render({ leg, bigOY: 11, smOY: 12 });
      if (this.posX <= this.finalLeft) {
        this.posX = this.finalLeft;
        this.cv.style.left = this.posX + "px";
        this.cv.style.top = this.baseTop + "px";
        this.phase = "cheer";
        this.frame = 0;
      }
    } else if (this.phase === "cheer") {
      // Per-mood accent: done waves, waiting waves slow/gentle, error trembles.
      let shake = 0;
      let bigOY = 5;
      if (this.type === "error") {
        shake = Math.round(Math.sin(this.frame / 2) * 3);
      } else if (this.type === "waiting") {
        bigOY = 5 + Math.round(Math.sin(this.frame / 14));
      } else {
        bigOY = 5 + Math.round(Math.sin(this.frame / 9) * 0.7);
      }
      this.cv.style.left = this.finalLeft + shake + "px";
      this.cv.style.top = this.baseTop + "px";
      this._render({ leg: "A", bigOY, smOY: 6 });
      if (this.frame === 3) this._showBubble();
    } else if (this.phase === "runout") {
      this.posX += 11;
      const hop = Math.abs(Math.sin(this.frame / 5)) * 9;
      this.cv.style.left = this.posX + "px";
      this.cv.style.top = this.baseTop - hop + "px";
      const leg = Math.floor(this.frame / 5) % 2 === 0 ? "A" : "B";
      this._render({ leg, bigOY: 11, smOY: 12 });
      if (this.posX >= this.startLeft) {
        this.phase = "hidden";
        cancelAnimationFrame(this.raf);
        this.raf = null;
        this.onHidden?.();
        return;
      }
    } else {
      cancelAnimationFrame(this.raf);
      this.raf = null;
      return;
    }
    this.raf = requestAnimationFrame(() => this._loop());
  }

  // ── drawing ──
  _paint(grid, ox, oy) {
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const col = COL[row[x]];
        if (col) {
          this.ctx.fillStyle = col;
          this.ctx.fillRect((ox + x) * PX, (oy + y) * PX, PX, PX);
        }
      }
    }
  }

  _armBig(oy) {
    const yT = oy + 3, yM = oy + 4, yB = oy + 5;
    this.ctx.fillStyle = COL.M;
    [yT, yM].forEach((y) => { for (let x = 6; x <= 8; x++) this.ctx.fillRect(x * PX, y * PX, PX, PX); });
    this.ctx.fillStyle = COL.D;
    for (let x = 6; x <= 8; x++) this.ctx.fillRect(x * PX, yB * PX, PX, PX);
  }

  _armSmall(oy) {
    const yT = oy + 1, yM = oy + 2, yB = oy + 3;
    this.ctx.fillStyle = COL.M;
    [yT, yM].forEach((y) => { for (let x = 25; x <= 26; x++) this.ctx.fillRect(x * PX, y * PX, PX, PX); });
    this.ctx.fillStyle = COL.D;
    for (let x = 25; x <= 26; x++) this.ctx.fillRect(x * PX, yB * PX, PX, PX);
  }

  _drawBlink() {
    this.ctx.fillStyle = COL.M;
    [[13, 14], [19, 20]].forEach(([a, b]) => {
      for (let yy = 14; yy <= 15; yy++) for (let x = a; x <= b; x++) this.ctx.fillRect(x * PX, yy * PX, PX, PX);
    });
    this.ctx.fillStyle = COL.B;
    [[13, 14], [19, 20]].forEach(([a, b]) => {
      for (let x = a; x <= b; x++) this.ctx.fillRect(x * PX, 14 * PX, PX, PX);
    });
  }

  _render(o) {
    this.ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    this._paint(clawBig, 0, o.bigOY);
    this._paint(clawSmall, 27, o.smOY);
    this._armBig(o.bigOY);
    this._armSmall(o.smOY);
    this._paint(hat, 5, HAT_Y);
    this._paint(shell, 5, BODY_Y);
    if (this.blink) this._drawBlink();
    this._paint(o.leg === "B" ? legsB : legsA, 5, LEG_Y);
  }
}
