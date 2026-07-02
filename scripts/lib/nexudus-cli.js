// All communication with the `nexudus` CLI binary: synchronous and async
// runners with retry, the run lock, the opt-in disk cache, scoped fetch
// planning, and pagination. This is the only module that spawns the CLI.

const { spawnSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  CLI, CLI_TIMEOUT, CLI_RETRIES, RETRY_BACKOFF_MS, MAX_PAGES, PAGE_SIZE,
  MAX_CONCURRENT_CLI_REDACTED,
} = require('./config');
const state = require('./state');
const log = require('./log');

// Async-paginator concurrency cap. Defaults to the redacted (sequential) limit;
// main() raises it for clear runs via setConcurrencyLimit().
let cliConcurrencyLimit = MAX_CONCURRENT_CLI_REDACTED;

function isTransientCliError(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  if (msg.includes('etimedout')) return true;
  if (msg.includes('econnreset')) return true;
  if (msg.includes('econnrefused')) return true;
  if (msg.includes('enetunreach')) return true;
  if (msg.includes('socket hang up')) return true;
  if (msg.includes('timeout')) return true;
  if (msg.includes('timed out')) return true;
  if (/\b5\d\d\b/.test(msg)) return true; // 5xx
  if (msg.includes('non-json output')) return true; // sometimes a 5xx comes back as HTML
  // The .NET CLI intermittently aborts with no stderr and exit code -1
  // (surfaced as unsigned 4294967295); a fresh attempt usually succeeds. Only
  // retry that exact silent-crash signature. An exit that carried stderr (a
  // real auth or validation error) produces a different message and must not
  // be blanket-retried.
  if (/^nexudus exited with code (4294967295|-1)$/.test(msg.trim())) return true;
  return false;
}

function sleepSync(ms) {
  // Blocking sleep, only used for retry backoff so fetchAllPages can stay sync.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runCLI(args) {
  let lastErr;
  for (let attempt = 0; attempt < CLI_RETRIES; attempt++) {
    try {
      const result = spawnSync(CLI, [...args, '--json'], {
        encoding: 'utf8',
        timeout: CLI_TIMEOUT,
        windowsHide: true,
        env: process.env,
        // A single page of invoices/coworkers easily exceeds Node's default
        // 1MB stdout buffer (ENOBUFS). 256MB holds any realistic page.
        maxBuffer: 256 * 1024 * 1024,
      });

      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || `nexudus exited with code ${result.status}`);
      }

      try {
        return JSON.parse(result.stdout);
      } catch {
        throw new Error(`Non-JSON output from CLI: ${result.stdout.slice(0, 300)}`);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < CLI_RETRIES - 1 && isTransientCliError(err)) {
        const backoff = RETRY_BACKOFF_MS[attempt] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
        try { sleepSync(backoff); } catch { /* SAB unavailable — proceed without backoff */ }
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Disk cache (opt-in via --cache). Reuses fetched lists for up to 1 hour so
// re-runs while iterating on fixes don't pay the full data-fetch cost again.
// Operator-keyed: the cache directory is scoped by a hash of the operator's
// accessible business IDs so switching accounts doesn't read stale data.
// ---------------------------------------------------------------------------

// Two levels up because this file lives in scripts/lib/; resolves to
// skills/nexudus-audit/.audit-cache (the same location the cache used before
// the split). Dropping one '..' would silently redirect it to scripts/lib/.
const CACHE_DIR_BASE = path.join(__dirname, '..', '..', '.audit-cache');
const CACHE_TTL_MS = 60 * 60 * 1000;
const LOCK_FILE = path.join(CACHE_DIR_BASE, 'audit.lock');
let DISK_CACHE_ENABLED = false;
let OPERATOR_CACHE_KEY = null;
let LOCK_HELD = false;

// Takes the audit lock. The lock file holds the owning PID; a stale lock
// (process gone) is reclaimed automatically. Returns { acquired: true } on
// success, or { acquired: false, pid } when a live audit already owns it.
function acquireLock() {
  try {
    fs.mkdirSync(CACHE_DIR_BASE, { recursive: true });
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
    LOCK_HELD = true;
    return { acquired: true };
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  // Lock file exists; check whether its owner is still alive.
  let existingPid;
  try {
    existingPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
  } catch {
    existingPid = NaN;
  }
  if (Number.isFinite(existingPid)) {
    try {
      // Signal 0 probes for existence without sending anything (works on
      // Windows too). EPERM means the process exists but we lack permission
      // to signal it, so treat that as live.
      process.kill(existingPid, 0);
      return { acquired: false, pid: existingPid };
    } catch (err) {
      if (err.code === 'EPERM') return { acquired: false, pid: existingPid };
      // ESRCH (or anything else) = stale lock; fall through to reclaim.
    }
  }
  // Reclaim via unlink + exclusive create. If a peer reclaims between the two
  // steps, our wx create fails and we report the lock as taken.
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch { /* peer may have unlinked already; either way try the wx create */ }
  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
    LOCK_HELD = true;
    return { acquired: true, reclaimed: true };
  } catch (err) {
    if (err.code === 'EEXIST') {
      // A peer reclaimed the lock between our unlink and write.
      let peerPid;
      try { peerPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10); } catch { peerPid = null; }
      return { acquired: false, pid: peerPid };
    }
    return { acquired: false, error: err.message };
  }
}

function releaseLock() {
  if (!LOCK_HELD) return;
  try {
    const owner = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
    if (owner === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch { /* nothing to release */ }
  LOCK_HELD = false;
}

// Registered at module load (not inside acquireLock) so the lock is released on
// any process exit for the whole lifetime, including signals received before
// the lock is taken. Safe when no lock is held: releaseLock() no-ops on
// LOCK_HELD === false.
process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(); process.exit(143); });

function computeOperatorCacheKey(accessible) {
  const sorted = [...accessible].map(String).sort().join(',');
  return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 8);
}

function cacheFilePath(entityKey) {
  // main() sets OPERATOR_CACHE_KEY before any cache use; readDiskCache and
  // writeDiskCache early-return while it is still null.
  return path.join(CACHE_DIR_BASE, OPERATOR_CACHE_KEY, `${entityKey}.json`);
}

function readDiskCache(entityKey) {
  if (!DISK_CACHE_ENABLED || !OPERATOR_CACHE_KEY) return null;
  try {
    const file = cacheFilePath(entityKey);
    const stat = fs.statSync(file);
    const age = Date.now() - stat.mtimeMs;
    if (age > CACHE_TTL_MS) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { data, ageSec: Math.floor(age / 1000) };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      log.warn(`  [cache] read failed for ${entityKey}: ${err.message}`);
    }
    return null;
  }
}

function writeDiskCache(entityKey, data) {
  if (!DISK_CACHE_ENABLED || !OPERATOR_CACHE_KEY) return;
  const file = cacheFilePath(entityKey);
  const tmp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* tmp may not exist; ignore */ }
    log.warn(`  [cache] write failed for ${entityKey}: ${err.message}`);
  }
}

function fetchAllPagesCached(entityKey, baseArgs, pageSize) {
  const { key, argSets } = scopedPlan(entityKey, baseArgs);
  const cached = readDiskCache(key);
  if (cached) {
    log.info(`  [cache] hit ${key} (age ${cached.ageSec}s, ${cached.data.length} rows)`);
    return cached.data;
  }
  const data = unionById(argSets.map(args => fetchAllPages(args, pageSize)));
  writeDiskCache(key, data);
  return data;
}

// Bounded-concurrency gate for async CLI calls. acquire/release are paired
// per call inside runCLIAsync and never held across a nested CLI call, so the
// paginator can't deadlock awaiting its own queued pages.
let _cliActive = 0;
const _cliWaiters = [];
function acquireCliSlot() {
  if (_cliActive < cliConcurrencyLimit) {
    _cliActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => _cliWaiters.push(resolve));
}
function releaseCliSlot() {
  const next = _cliWaiters.shift();
  if (next) next();          // hand the in-use slot straight to the next waiter
  else _cliActive--;         // no waiters; free the slot
}

function runCLIAsyncOnce(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI, [...args, '--json'], {
      windowsHide: true,
      env: process.env,
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
    }, CLI_TIMEOUT);
    child.stdout.on('data', d => stdoutChunks.push(d));
    child.stderr.on('data', d => stderrChunks.push(d));
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))).toString('utf8');
      const stderr = Buffer.concat(stderrChunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))).toString('utf8');
      if (timedOut) return reject(new Error('CLI call timed out'));
      if (code !== 0) return reject(new Error((stderr && stderr.trim()) || `nexudus exited with code ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Non-JSON output from CLI: ${stdout.slice(0, 300)}`));
      }
    });
  });
}

// Async counterpart to runCLI, used by the parallel prefetch path. Same retry
// semantics (transient failures only, exponential backoff) and same per-call
// timeout as the sync version.
async function runCLIAsync(args) {
  await acquireCliSlot();
  try {
    let lastErr;
    for (let attempt = 0; attempt < CLI_RETRIES; attempt++) {
      try {
        return await runCLIAsyncOnce(args);
      } catch (err) {
        lastErr = err;
        if (attempt < CLI_RETRIES - 1 && isTransientCliError(err)) {
          const backoff = RETRY_BACKOFF_MS[attempt] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  } finally {
    releaseCliSlot();
  }
}

// Async paginator. Fetches page 1 to learn totalPages, then issues the
// remaining pages concurrently, subject to the CLI slot gate.
async function fetchAllPagesAsync(baseArgs, pageSize = PAGE_SIZE) {
  const firstArgs = [...baseArgs, '--page-size', String(pageSize), '--page-number', '1'];
  const firstResult = await runCLIAsync(firstArgs);
  if (!firstResult.ok) throw new Error(firstResult.summary || 'CLI returned ok:false');
  const totalPages = firstResult.meta?.totalPages ?? 1;
  if (totalPages > MAX_PAGES) {
    throw new Error(`Pagination guard tripped: would fetch ${totalPages} pages on ${baseArgs.join(' ')}`);
  }
  let allItems = firstResult.data || [];
  if (totalPages > 1) {
    const pagePromises = [];
    for (let p = 2; p <= totalPages; p++) {
      const args = [...baseArgs, '--page-size', String(pageSize), '--page-number', String(p)];
      pagePromises.push(runCLIAsync(args));
    }
    // Wait for every page to settle before throwing. Bailing on the first
    // failure would leave the other CLI children running in the background,
    // which has been seen to crash the next call.
    const settled = await Promise.allSettled(pagePromises);
    const failed = settled.find(s => s.status === 'rejected');
    if (failed) throw failed.reason;
    for (const s of settled) {
      if (s.status !== 'fulfilled') continue;
      const r = s.value;
      if (!r.ok) throw new Error(r.summary || 'CLI returned ok:false');
      allItems = allItems.concat(r.data || []);
    }
  }
  return allItems;
}

// Disk-cache-aware async fetcher.
async function fetchAllPagesCachedAsync(entityKey, baseArgs) {
  const { key, argSets } = scopedPlan(entityKey, baseArgs);
  const cached = readDiskCache(key);
  if (cached) {
    log.info(`  [cache] hit ${key} (age ${cached.ageSec}s, ${cached.data.length} rows)`);
    return cached.data;
  }
  // Fetch the selected businesses concurrently (the slot gate enforces the
  // real limit) and settle everything before throwing, so one failure can't
  // leave sibling fetches running unattended in the background.
  const settled = await Promise.allSettled(argSets.map(args => fetchAllPagesAsync(args)));
  const failed = settled.find(s => s.status === 'rejected');
  if (failed) throw failed.reason;
  // All fulfilled: any rejection was thrown above.
  const data = unionById(settled.map(s => s.value));
  writeDiskCache(key, data);
  return data;
}

// Paginates through all pages of a CLI list command and returns combined results
function fetchAllPages(baseArgs, pageSize = PAGE_SIZE) {
  let page = 1;
  let allItems = [];
  let totalPages = 1;

  do {
    if (page > MAX_PAGES) {
      throw new Error(`Pagination guard tripped: exceeded MAX_PAGES=${MAX_PAGES} on ${baseArgs.join(' ')}`);
    }
    const args = [...baseArgs, '--page-size', String(pageSize), '--page-number', String(page)];
    const result = runCLI(args);
    if (!result.ok) throw new Error(result.summary || 'CLI returned ok:false');
    allItems = allItems.concat(result.data || []);
    totalPages = result.meta?.totalPages ?? 1;
    page++;
  } while (page <= totalPages);

  return allItems;
}

// ---------------------------------------------------------------------------
// Server-side business scoping. The shared `--business` flag is silently
// ignored by every CLI list command; what works is each command's *typed*
// business filter, which the API honours server-side. That gives correct
// scoping and far less data (tens of coworkers instead of thousands on a big
// account). One call is issued per selected business and the results unioned.
// Entities missing from this map have no server-side filter and fall back to
// an account-wide fetch scoped in memory (filterByBusiness, or the contract
// CoworkerId join).
// ---------------------------------------------------------------------------
const BUSINESS_FLAG = {
  invoices: '--business-id',
  coworkersAll: '--invoicing-business-id',
  products: '--business-id',
  tariffs: '--business-id',
  discountCodes: '--business-id',
  teamsList: '--business-id',
};

// Builds the fetch plan for an entity under the current scope: a disk-cache key
// (scope-suffixed so a scoped run never reuses an account-wide cache file, or
// vice versa) and the list of CLI arg-sets to fetch and union.
function scopedPlan(entityKey, baseArgs) {
  const flag = BUSINESS_FLAG[entityKey];
  // Clear and redacted fetches must never share a cache file; the data differs.
  const suffix = state.fetchClear ? '__clear' : '';
  if (state.selectedBusinessIds && flag) {
    const ids = [...state.selectedBusinessIds].map(String).sort();
    return {
      key: `${entityKey}__b-${ids.join('-')}${suffix}`,
      argSets: ids.map(id => [...baseArgs, flag, id]),
    };
  }
  return { key: entityKey + suffix, argSets: [baseArgs] };
}

// Concatenates per-business result lists, de-duplicating by record Id (a record
// belongs to a single business, so this is a safety net against overlap).
function unionById(lists) {
  if (lists.length === 1) return lists[0];
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const item of list) {
      if (item == null) continue;   // drop null/undefined array elements outright
      const id = item.Id != null ? String(item.Id) : null;
      if (id != null) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push(item);
    }
  }
  return out;
}

// Setters main() uses to wire in runtime config the CLI layer owns.
function setConcurrencyLimit(n) { cliConcurrencyLimit = n; }
function configureCache(enabled, operatorKey) {
  DISK_CACHE_ENABLED = enabled;
  OPERATOR_CACHE_KEY = operatorKey;
}

module.exports = {
  runCLI, runCLIAsync,
  fetchAllPages, fetchAllPagesAsync, fetchAllPagesCached, fetchAllPagesCachedAsync,
  acquireLock, releaseLock, computeOperatorCacheKey,
  setConcurrencyLimit, configureCache, CACHE_DIR_BASE,
};
