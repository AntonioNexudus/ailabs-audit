// Static configuration: thresholds, timeouts, the run timestamp, and the
// resolved path to the nexudus CLI binary. No logic, no mutable state.

const path = require('path');
const fs = require('fs');

const PAGE_SIZE = 500;
// PII redaction (CLI 5.0.16+) tokenizes every PII field on every record, so a
// single 500-record `coworkers list` page can take 60-70s on a large tenant.
// 180s leaves headroom for that without masking a genuinely hung call.
const CLI_TIMEOUT = 180_000;
// Concurrency caps for the CLI child processes used by the async paginator
// and prefetch. With PII redaction active the CLI crashes (exit -1, empty
// stderr) as soon as heavy list pages run in parallel, and contention slows
// the surviving calls anyway, so redacted runs stay strictly sequential.
// Clear fetches (pii-mode unlocked) skip tokenization entirely and tolerate
// parallel calls, so they get a wider gate. The effective limit is chosen in
// main() once detectPiiMode() has set FETCH_CLEAR.
const MAX_CONCURRENT_CLI_REDACTED = 1;
const MAX_CONCURRENT_CLI_CLEAR = 4;
const CLI_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];
const MAX_PAGES = 1000; // 500k records — abort guard against runaway pagination
const DRAFT_STALE_DAYS = 7;
const BOOKING_STALE_DAYS = 7;
const OVERDUE_WRITEOFF_DAYS = 365;
const CHARGE_STALE_DAYS = 30;
const CHECKIN_STALE_HOURS = 24;
const CONTRACT_LIMIT_WARNING = 20;
const CONTRACT_LIMIT_MAX = 25;
const STALE_OPERATOR_DAYS = 90;
const UNASSIGNED_TICKET_DAYS = 7;

const TODAY = new Date();
const _yyyy = TODAY.getFullYear();
const _mm = String(TODAY.getMonth() + 1).padStart(2, '0');
const _dd = String(TODAY.getDate()).padStart(2, '0');
const _hh = String(TODAY.getHours()).padStart(2, '0');
const _mi = String(TODAY.getMinutes()).padStart(2, '0');
const _ss = String(TODAY.getSeconds()).padStart(2, '0');
const TODAY_STR = `${_yyyy}-${_mm}-${_dd}`;
const TIMESTAMP = `${_yyyy}-${_mm}-${_dd}-${_hh}-${_mi}-${_ss}`;

// Resolve CLI binary — uses USERPROFILE/HOME to find .dotnet/tools
const CLI = (() => {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const winPath = path.join(home, '.dotnet', 'tools', 'nexudus.exe');
  if (fs.existsSync(winPath)) return winPath;
  const winPathNoExt = path.join(home, '.dotnet', 'tools', 'nexudus');
  if (fs.existsSync(winPathNoExt)) return winPathNoExt;
  return 'nexudus';
})();

module.exports = {
  PAGE_SIZE, CLI_TIMEOUT, MAX_CONCURRENT_CLI_REDACTED, MAX_CONCURRENT_CLI_CLEAR,
  CLI_RETRIES, RETRY_BACKOFF_MS, MAX_PAGES,
  DRAFT_STALE_DAYS, BOOKING_STALE_DAYS, OVERDUE_WRITEOFF_DAYS, CHARGE_STALE_DAYS,
  CHECKIN_STALE_HOURS, CONTRACT_LIMIT_WARNING, CONTRACT_LIMIT_MAX,
  STALE_OPERATOR_DAYS, UNASSIGNED_TICKET_DAYS,
  TODAY, TODAY_STR, TIMESTAMP, CLI,
};
