// Small dependency-free helpers shared across the audit: error classification
// plus date and string formatting used by checks and report builders alike.

// ---------------------------------------------------------------------------
// Error classification: buckets CLI failures so the report tells the operator
// at a glance whether to re-login, retry, or file a CLI bug.
// ---------------------------------------------------------------------------

const ERROR_HINTS = {
  auth: 'Run `nexudus login` to re-authenticate, then re-run the audit.',
  timeout: 'Transient — retry the audit. If it persists, the Nexudus API may be slow under load.',
  network: 'Transient — retry the audit. If it persists, check connectivity to api.nexudus.com.',
  'unexpected-schema': 'The CLI returned data the audit could not parse. Likely a CLI / API version mismatch — try `nexudus update` and re-run.',
  'cli-bug': 'The `nexudus` CLI returned a non-zero exit. Re-run the audit; if it persists, file an issue against the CLI.',
  unknown: 'Re-run the audit. If the error repeats, capture the exact message and the check number for triage.',
};

function classifyError(err) {
  const msg = String(err?.message ?? err ?? '').toLowerCase();
  if (!msg) return 'unknown';
  if (/\b(401|403)\b|unauthor|credentials|forbidden|not logged in/.test(msg)) return 'auth';
  if (/etimedout|\btimeout\b|timed out/.test(msg)) return 'timeout';
  if (/econn|enetunreach|socket hang up|\b5\d\d\b|network/.test(msg)) return 'network';
  if (/non-json|unexpected token|json\.parse/.test(msg)) return 'unexpected-schema';
  if (/exited with code/.test(msg)) return 'cli-bug';
  return 'unknown';
}

// Splits a comma-separated ID string into an array
function parseIds(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function daysBetween(dateStr, ref) {
  return Math.floor((ref - new Date(dateStr)) / 86_400_000);
}

function hoursBetween(dateStr, ref) {
  return Math.floor((ref - new Date(dateStr)) / 3_600_000);
}

// Escapes pipe characters for markdown table cells
function escPipe(str) {
  if (!str) return '';
  return String(str).replace(/\|/g, '\\|');
}

// Escapes HTML-significant characters for safe rendering inside HTML report.
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Validates that a value is a numeric ID (prevents command injection)
function safeId(val) {
  const s = String(val);
  if (!/^\d+$/.test(s)) throw new Error(`Unexpected non-numeric ID: ${s}`);
  return s;
}

module.exports = {
  ERROR_HINTS, classifyError,
  parseIds, daysBetween, hoursBetween, escPipe, escHtml, safeId,
};
