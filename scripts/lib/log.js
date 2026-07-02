// Console output router. Every lib module logs through here instead of
// console.* so audit.js can pick, once, between two modes:
//
//  - interactive (both stdout AND stderr are TTYs): chatter is dropped, a
//    single self-redrawing progress line lives on stderr, and warnings/errors
//    are printed without corrupting that line (clear -> print -> redraw).
//  - plain (piped / redirected / AI-driven skill flow): today's sequential
//    logging — every message printed in order, no ANSI escapes, no `\r`.
//
// Before init() is called the router defaults to plain mode, so modules that
// log during early startup (or scripts that never call init) keep the
// traditional sequential behavior.

let interactive = false;

// --- progress line state (interactive mode only) ---------------------------
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let progressText = null;   // null = no active progress line
let frameIdx = 0;
let spinnerTimer = null;

function init(opts) {
  interactive = !!(opts && opts.interactive);
}

function isInteractive() {
  return interactive;
}

// Erase the progress line (if one is showing) so a regular message can be
// printed on a clean line. `\r` returns to column 0, `\x1b[2K` clears the row.
function clearProgressLine() {
  if (interactive && progressText != null) {
    process.stderr.write('\r\x1b[2K');
  }
}

// (Re)draw the progress line in place, truncated to the terminal width so a
// long check name never wraps (a wrapped line breaks the \r redraw).
function drawProgressLine() {
  if (!interactive || progressText == null) return;
  let line = `${SPINNER_FRAMES[frameIdx]} ${progressText}`;
  const cols = process.stderr.columns;
  const max = (Number.isFinite(cols) && cols > 1) ? cols - 1 : 79;
  if (line.length > max) line = line.slice(0, max);
  process.stderr.write('\r\x1b[2K' + line);
}

const progress = {
  // Begin showing the progress line. The braille spinner advances on a timer,
  // but note: the audit's checks are synchronous (spawnSync), which blocks the
  // event loop, so the spinner only actually animates during the async
  // prefetch phase. During the check loop the timer never fires — the line
  // still moves because audit.js calls progress.update() at each check
  // boundary, which is the real progress signal. unref() keeps the timer from
  // holding the process open.
  start(text) {
    if (!interactive) return; // no-op in plain mode
    progressText = String(text == null ? '' : text);
    if (!spinnerTimer) {
      frameIdx = 0;
      spinnerTimer = setInterval(() => {
        frameIdx = (frameIdx + 1) % SPINNER_FRAMES.length;
        drawProgressLine();
      }, 120);
      spinnerTimer.unref();
    }
    drawProgressLine();
  },

  update(text) {
    if (!interactive) return;
    if (progressText == null) return progress.start(text);
    progressText = String(text == null ? '' : text);
    drawProgressLine();
  },

  // Stop the spinner and erase the progress line, leaving the cursor on a
  // clean row for the final output block.
  done() {
    if (!interactive) return;
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    if (progressText != null) process.stderr.write('\r\x1b[2K');
    progressText = null;
  },
};

// Chatter (prefetch summaries, cache hits, per-check status lines): printed in
// plain mode, dropped in interactive mode where the progress line replaces it.
function info(msg) {
  if (!interactive) console.log(msg);
}

// Warnings/errors must never be eaten in either mode. In interactive mode the
// progress line is cleared first and redrawn after, so the message lands on
// its own line and the status line survives.
function warn(msg) {
  clearProgressLine();
  console.warn(msg);
  drawProgressLine();
}

function error(msg) {
  clearProgressLine();
  console.error(msg);
  drawProgressLine();
}

// Always-visible stdout (scope line, final summary block).
function out(msg) {
  clearProgressLine();
  console.log(msg == null ? '' : msg);
  drawProgressLine();
}

module.exports = { init, isInteractive, info, warn, error, out, progress };
