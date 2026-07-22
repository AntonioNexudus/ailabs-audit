#!/usr/bin/env node
'use strict';

// Local web dashboard for the Nexudus audits. Zero dependencies (Node built-ins
// only), loopback-only HTTP server. It never runs audit logic in-process:
// audits are spawned as child processes (node audit.js / onboarding-audit.js)
// with piped stdio so they emit plain, ANSI-free line output this server parses
// into live progress. Everything here is additive — deleting the four new files
// (this, lib/ui-page.js, lib/ui-client.js, Run Audit Dashboard.cmd) fully
// reverts the feature. The existing audit scripts and lib/* are untouched.
//
// It reads only the *static* registries from check-defs / onboarding-check-defs
// and the async CLI helpers (runCLIAsync / fetchAllPagesAsync) from
// nexudus-cli. It deliberately never calls data.js's synchronous getters (they
// spawnSync and would freeze the event loop) nor mutates lib/state.js.

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { fileURLToPath } = require('url');

const { resolveReportsDir } = require('./lib/config');
const { runCLIAsync, fetchAllPagesAsync } = require('./lib/nexudus-cli');
const { CHECK_DEFS, CHECK_TIERS } = require('./lib/check-defs');
const { ONBOARDING_CHECK_DEFS } = require('./lib/onboarding-check-defs');
const { renderPage } = require('./lib/ui-page');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_MARKER = 'ailabs-audit-dashboard';
const APP_VERSION = 1;
const DEFAULT_PORT = 4680;
const REPO_ROOT = path.join(__dirname, '..');
const SCRIPTS_DIR = __dirname;
const CLIENT_JS_PATH = path.join(__dirname, 'lib', 'ui-client.js');
const SETUP_TTL_MS = 60_000;
const LOG_RING = 500;
const MAX_BODY_BYTES = 1_000_000;

// Report filename contract (matches audit.js / onboarding-audit.js output):
// <type>-audit-YYYY-MM-DD-HH-MM-SS.(html|md)
const REPORT_NAME_RE = /^(account-audit|onboarding-audit)-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.(html|md)$/;

// Resolved once at boot: resolveReportsDir() spawns PowerShell per call to
// follow a OneDrive-redirected Desktop, so we never want it on the hot path.
// Memoized on both success AND failure (never re-spawned) and never throws, so
// no request path can hang or repeatedly block the event loop if it fails.
let REPORTS_DIR = null;
function reportsDir() {
  if (REPORTS_DIR) return REPORTS_DIR;
  try {
    REPORTS_DIR = resolveReportsDir();
  } catch (err) {
    REPORTS_DIR = path.join(REPO_ROOT, 'scripts', 'reports');
    try { fs.mkdirSync(REPORTS_DIR, { recursive: true }); } catch { /* best effort */ }
    console.error('Warning: could not resolve the Desktop reports folder (' + (err && err.message) + '); using ' + REPORTS_DIR);
  }
  return REPORTS_DIR;
}

let ACTUAL_PORT = DEFAULT_PORT;

// ---------------------------------------------------------------------------
// Static meta (check registries) — instant, no CLI
// ---------------------------------------------------------------------------

function buildMeta() {
  const LETTER_TO_LEVEL = { Q: 'quick', M: 'medium', T: 'thorough' };
  const tierCounts = { quick: 0, medium: 0, thorough: 0 };
  for (const tiers of Object.values(CHECK_TIERS)) {
    for (const t of tiers) {
      const lvl = LETTER_TO_LEVEL[t];
      if (lvl) tierCounts[lvl]++;
    }
  }
  return {
    app: APP_MARKER,
    version: APP_VERSION,
    port: ACTUAL_PORT,
    account: {
      checks: CHECK_DEFS.map((d) => ({
        num: d.num, name: d.name, severity: d.severity || 'INSIGHT', section: d.section || 'severity',
      })),
      tiers: CHECK_TIERS,
      levels: ['quick', 'medium', 'thorough'],
      tierCounts,
    },
    onboarding: {
      checks: ONBOARDING_CHECK_DEFS.map((d) => ({ num: d.num, name: d.name, section: d.section })),
    },
  };
}

// ---------------------------------------------------------------------------
// Setup probes (doctor + PII), cached; never probed while a run is active
// because parallel redacted CLI calls have been observed to crash the CLI.
// ---------------------------------------------------------------------------

let setupCache = null; // { data, at }

function isEnoent(err) {
  return !!err && (err.code === 'ENOENT' || /\bENOENT\b/.test(String(err.message || '')));
}

async function probeSetup() {
  let cliFound = true;
  let loggedIn = false;
  let piiUnlocked = false;
  try {
    const doctor = await runCLIAsync(['doctor']);
    loggedIn = !!(doctor && doctor.ok && doctor.data && doctor.data.credentialsStored);
  } catch (err) {
    if (isEnoent(err)) cliFound = false;
    // Any other error: CLI is present but doctor failed — treat as not-signed-in.
  }
  if (cliFound && loggedIn) {
    try {
      const r = await runCLIAsync(['businesses', 'list', '--page-size', '1']);
      piiUnlocked = !!(r && r.piiRedaction === 'off');
    } catch {
      // Non-fatal: leave piiUnlocked false.
    }
  }
  return { cliFound, loggedIn, piiUnlocked, checkedAt: Date.now() };
}

async function getSetup(refresh) {
  if (isRunning()) {
    if (setupCache) return Object.assign({}, setupCache.data, { cached: true });
    return { busy: true };
  }
  if (!refresh && setupCache && (Date.now() - setupCache.at) < SETUP_TTL_MS) {
    return setupCache.data;
  }
  const data = await probeSetup();
  setupCache = { data, at: Date.now() };
  return data;
}

// ---------------------------------------------------------------------------
// Businesses (lazy, cached). Uses the async paginator so a slow CLI never
// blocks the HTTP event loop.
// ---------------------------------------------------------------------------

let bizCache = null; // { data, at }

async function getBusinesses(refresh) {
  if (isRunning()) {
    if (bizCache) return { businesses: bizCache.data, cached: true };
    return { busy: true };
  }
  if (!refresh && bizCache) return { businesses: bizCache.data };
  const raw = await fetchAllPagesAsync(['businesses', 'list']);
  const businesses = (raw || [])
    .filter((b) => b && b.Id != null)
    .map((b) => ({ id: String(b.Id), name: b.Name || '' }));
  bizCache = { data: businesses, at: Date.now() };
  return { businesses };
}

function friendlyBizError(err) {
  const s = String((err && err.message) || '').toLowerCase();
  if (isEnoent(err)) return 'The Nexudus CLI was not found. Contact your administrator.';
  if (/not logged in|credential|unauthor|authentication/.test(s)) {
    return 'The Nexudus CLI is not signed in. Run “nexudus login”, then Refresh.';
  }
  return 'Could not load businesses. Check the setup status above and try Refresh.';
}

// ---------------------------------------------------------------------------
// Run manager — one run at a time (matches the audits' own single-instance lock)
// ---------------------------------------------------------------------------

let currentRun = null;
let lastRun = null;
const sseClients = new Set();

function isRunning() {
  return !!(currentRun && currentRun.status === 'running');
}

function newRunId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// The slice of a run that is safe to send to the browser.
function publicRun(run) {
  if (!run) return null;
  return {
    runId: run.runId,
    type: run.type,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    total: run.total,
    done: run.done,
    checks: run.checks.filter(Boolean),
    warnings: run.warnings,
    log: run.log,
    scopeLine: run.scopeLine,
    summary: run.summary,
    error: run.error,
  };
}

function sseSend(res, event, data) {
  res.write('event: ' + event + '\n');
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

function broadcast(event, data) {
  for (const res of sseClients) {
    try { sseSend(res, event, data); } catch { /* client gone; 'close' will prune it */ }
  }
}

// --- stdout / stderr parsing ------------------------------------------------

function pushLog(run, line) {
  run.log.push(line);
  if (run.log.length > LOG_RING) run.log.shift();
  broadcast('log', { line });
}

// Classify a per-check summary tail into a status the client can colour.
function classifySummary(type, summary) {
  const s = String(summary).trim();
  if (/^ERROR\b/.test(s)) return { status: 'error' };
  if (type === 'onboarding') {
    const u = s.toUpperCase();
    if (u === 'PASS') return { status: 'pass' };
    if (u === 'WARN') return { status: 'warn' };
    if (u === 'FAIL') return { status: 'fail' };
    if (u === 'SKIP') return { status: 'skip' };
    return { status: 'skip' };
  }
  if (s === 'PASS') return { status: 'pass' };
  const m = s.match(/^(\d+)\s+issue/);
  if (m) {
    const n = parseInt(m[1], 10);
    return { status: n > 0 ? 'issues' : 'pass', count: n };
  }
  return { status: 'pass' };
}

// Parse a plain-mode per-check line: "  [i/N] #num <name> — <summary>".
// Returns { index, total, num, name, summary } or null when the line isn't one.
// Splitting on the first " — " is safe because no check name contains it.
function parseCheckLine(line) {
  const m = line.match(/^\s+\[(\d+)\/(\d+)\]\s+#(\d+)\s+(.+)$/);
  if (!m) return null;
  const rest = m[4];
  const sep = rest.indexOf(' — ');
  return {
    index: parseInt(m[1], 10),
    total: parseInt(m[2], 10),
    num: parseInt(m[3], 10),
    name: sep === -1 ? rest : rest.slice(0, sep),
    summary: sep === -1 ? '' : rest.slice(sep + 3),
  };
}

function handleStdoutLine(run, line) {
  pushLog(run, line);

  // Scope header line, e.g. "Nexudus Account Health Audit — 2026-07-22 · …"
  if (/^Nexudus .+ Audit — /.test(line)) {
    run.scopeLine = line.trim();
    broadcast('scope', { scopeLine: run.scopeLine, total: run.total, type: run.type });
    return;
  }

  // Per-check line: "  [i/N] #num <name> — <summary>"
  const parsedLine = parseCheckLine(line);
  if (parsedLine) {
    const parsed = classifySummary(run.type, parsedLine.summary);
    const check = {
      index: parsedLine.index, num: parsedLine.num, name: parsedLine.name,
      total: parsedLine.total, done: parsedLine.index,
      status: parsed.status, count: parsed.count, summary: parsedLine.summary,
    };
    run.checks[parsedLine.index - 1] = check;
    run.total = parsedLine.total;
    run.done = parsedLine.index;
    broadcast('check', check);
    return;
  }

  // Final summary line: "  Audit complete — …" / "  Check-in complete — …"
  if (/complete — /.test(line)) {
    run.summaryText = line.trim();
    const im = line.match(/complete — (\d+) issue/);
    if (im) run.totalIssues = parseInt(im[1], 10);
    return;
  }

  // Report URL line: a file:/// URL to the .html deliverable.
  const fm = line.match(/(file:\/\/\/\S+\.html)/);
  if (fm) {
    try { run.reportName = path.basename(fileURLToPath(fm[1])); } catch { /* ignore */ }
    return;
  }

  // Markdown path line (account audit only): "  md (AI-readable): C:\…\x.md"
  const md = line.match(/md \(AI-readable\):\s*(.+\.md)\s*$/);
  if (md) {
    run.mdName = path.basename(md[1].trim());
    return;
  }
}

function stderrToWarning(line) {
  if (/Reclaimed stale lock/i.test(line)) return { level: 'info', text: 'Reclaimed a stale lock from a previous run.' };
  if (/token map/i.test(line)) return { level: 'info', text: line };
  return { level: 'warn', text: line };
}

function handleStderrLine(run, line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  pushLog(run, '[stderr] ' + trimmed);
  const w = stderrToWarning(trimmed);
  run.warnings.push(w);
  broadcast('warning', w);
}

function drainLines(buffer, chunk, onLine) {
  buffer.value += chunk;
  let idx;
  while ((idx = buffer.value.indexOf('\n')) !== -1) {
    let line = buffer.value.slice(0, idx);
    buffer.value = buffer.value.slice(idx + 1);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    onLine(line);
  }
}

function classifyExit(code, stderr) {
  const s = String(stderr || '').toLowerCase();
  if (/already running/.test(s)) {
    return { kind: 'already-running', message: 'Another audit is already running. Wait for it to finish, then try again.' };
  }
  if (/not logged in|authentication error/.test(s)) {
    return { kind: 'not-logged-in', message: 'The Nexudus CLI is not signed in. Run “nexudus login”, then re-check setup.' };
  }
  if (/not in your accessible businesses|invalid business id|no businesses are accessible/.test(s)) {
    return { kind: 'bad-business', message: 'One or more selected businesses aren’t available to this account. Refresh the list and try again.' };
  }
  if (code === 2) {
    return { kind: 'usage', message: 'The audit could not start with those options. ' + tailOf(stderr) };
  }
  return { kind: 'error', message: 'The audit stopped unexpectedly. ' + tailOf(stderr) };
}

function tailOf(stderr) {
  if (!stderr) return '';
  const t = String(stderr).trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' ');
  return t.length > 300 ? t.slice(-300) : t;
}

// Fallback report discovery: newest matching .html at/after the run started.
function findLatestReport(run) {
  try {
    const dir = reportsDir();
    const prefix = run.type === 'onboarding' ? 'onboarding-audit-' : 'account-audit-';
    let best = null;
    let bestT = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(prefix) || !f.endsWith('.html') || !REPORT_NAME_RE.test(f)) continue;
      const st = fs.statSync(path.join(dir, f));
      if (st.mtimeMs >= run.startedAt - 2000 && st.mtimeMs > bestT) { best = f; bestT = st.mtimeMs; }
    }
    return best;
  } catch {
    return null;
  }
}

function finishRun(run, outcome) {
  if (run.status !== 'running') return; // guard against error+close double fire

  // Flush any trailing partial lines before finalizing.
  if (run.stdoutBuf.value) { handleStdoutLine(run, run.stdoutBuf.value.replace(/\r$/, '')); run.stdoutBuf.value = ''; }
  if (run.stderrBuf.value) { handleStderrLine(run, run.stderrBuf.value); run.stderrBuf.value = ''; }

  run.finishedAt = Date.now();

  if (outcome.spawnError) {
    run.status = 'error';
    run.error = { kind: 'spawn', message: 'Could not start the audit process: ' + outcome.spawnError.message };
  } else if (run.killedByUs) {
    // Only a deliberate Cancel is reported as cancelled. An unexpected
    // signal-termination (no Cancel requested) falls through to the error path
    // rather than being mislabeled as user-cancelled.
    run.status = 'cancelled';
  } else if (outcome.code === 0) {
    run.status = 'done';
    if (!run.reportName) run.reportName = findLatestReport(run);
    run.summary = {
      text: run.summaryText || 'Audit complete.',
      totalIssues: run.totalIssues,
      reportName: run.reportName,
      reportUrl: run.reportName ? '/report/' + encodeURIComponent(run.reportName) : null,
      mdName: run.mdName,
    };
  } else {
    run.status = 'error';
    run.error = classifyExit(outcome.code, run.stderr);
  }

  lastRun = run;
  currentRun = null;
  broadcast('done', publicRun(run));
}

function startRun(opts) {
  const run = {
    runId: newRunId(),
    type: opts.type,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    total: null,
    done: 0,
    checks: [],
    warnings: [],
    log: [],
    scopeLine: null,
    summary: null,
    error: null,
    pid: null,
    killedByUs: false,
    stderr: '',
    summaryText: null,
    totalIssues: null,
    reportName: null,
    mdName: null,
    stdoutBuf: { value: '' },
    stderrBuf: { value: '' },
  };
  currentRun = run;

  const script = opts.type === 'onboarding' ? 'onboarding-audit.js' : 'audit.js';
  const args = [path.join(SCRIPTS_DIR, script), '--business-ids', opts.businessIds];
  if (opts.type === 'account') {
    if (opts.checks) args.push('--checks', opts.checks);
    else args.push('--level', opts.level);
  }
  if (opts.cache) args.push('--cache');

  let child;
  try {
    child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: process.env,
    });
  } catch (err) {
    finishRun(run, { spawnError: err });
    return run;
  }

  run.pid = child.pid;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => drainLines(run.stdoutBuf, chunk, (l) => handleStdoutLine(run, l)));
  child.stderr.on('data', (chunk) => {
    run.stderr += chunk;
    drainLines(run.stderrBuf, chunk, (l) => handleStderrLine(run, l));
  });
  // Force-killing the child on Cancel can surface an EPIPE/ECONNRESET on its
  // stdio pipes; without these listeners an unhandled stream 'error' would take
  // the whole dashboard down. The 'close' handler below does the finalizing.
  child.stdout.on('error', () => {});
  child.stderr.on('error', () => {});
  child.on('error', (err) => finishRun(run, { spawnError: err }));
  child.on('close', (code, signal) => finishRun(run, { code, signal }));

  broadcast('snapshot', publicRun(run));
  return run;
}

function cancelRun() {
  const run = currentRun;
  if (!run || run.status !== 'running' || !run.pid) return false;
  run.killedByUs = true;
  // taskkill /T kills the whole tree; a plain kill would orphan the nexudus.exe
  // grandchildren the audit spawns. The stale lock they leave is auto-reclaimed
  // by the next run.
  try {
    spawn('taskkill', ['/pid', String(run.pid), '/T', '/F'], { windowsHide: true });
  } catch {
    try { process.kill(run.pid); } catch { /* already gone */ }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Reports listing + safe serving
// ---------------------------------------------------------------------------

// Pure: fold a flat directory listing into newest-first report entries, folding
// each .md into a `hasMd` flag on its .html sibling. Lone .md files (no .html)
// are dropped — the .html is the deliverable. No fs access, so it's testable.
function parseReportEntries(files) {
  const byBase = new Map();
  for (const f of files) {
    if (!REPORT_NAME_RE.test(f)) continue;
    const base = f.replace(/\.(html|md)$/, '');
    if (!byBase.has(base)) byBase.set(base, { html: null, md: null });
    if (f.endsWith('.html')) byBase.get(base).html = f;
    else byBase.get(base).md = f;
  }
  const out = [];
  for (const rec of byBase.values()) {
    if (!rec.html) continue;
    const name = rec.html;
    const m = REPORT_NAME_RE.exec(name);
    out.push({
      name,
      type: m[1] === 'onboarding-audit' ? 'onboarding' : 'account',
      stamp: name.slice(m[1].length + 1).replace(/\.html$/, ''),
      hasMd: !!rec.md,
    });
  }
  out.sort((a, b) => b.stamp.localeCompare(a.stamp));
  return out;
}

function listReports() {
  let files;
  try { files = fs.readdirSync(reportsDir()); } catch { return []; }
  return parseReportEntries(files).map((entry) => {
    let size = null;
    let mtime = null;
    try { const st = fs.statSync(path.join(reportsDir(), entry.name)); size = st.size; mtime = st.mtimeMs; } catch { /* ignore */ }
    return Object.assign({}, entry, { size, mtime });
  });
}

// Pure name-safety gate for /report/<name>: rejects path separators, parent
// refs and NUL, then requires the exact report filename shape. Returns a reason
// code ('bad' → 400, 'unknown' → 404) or null when the name is safe to resolve.
function reportNameRejection(name) {
  if (/[/\\]|\.\.|\0/.test(name)) return 'bad';
  if (!REPORT_NAME_RE.test(name)) return 'unknown';
  return null;
}

function serveReport(res, rawName) {
  let name;
  try { name = decodeURIComponent(rawName); } catch { return sendText(res, 400, 'Bad request'); }
  const rejection = reportNameRejection(name);
  if (rejection === 'bad') return sendText(res, 400, 'Bad request');
  if (rejection === 'unknown') return sendText(res, 404, 'Not found');
  const dir = reportsDir();
  const full = path.resolve(dir, name);
  if (full !== path.join(dir, name) || !full.startsWith(dir + path.sep)) return sendText(res, 400, 'Bad request');
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return sendText(res, 404, 'Not found');
    // .md served as text/plain (not text/markdown, which some browsers download).
    const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type });
    const stream = fs.createReadStream(full);
    stream.on('error', () => { try { res.end(); } catch { /* noop */ } });
    stream.pipe(res);
  });
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function sendText(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

// The server binds IPv4 loopback only, so these are the only legitimate Hosts.
function hostAllowed(req) {
  const h = req.headers.host;
  if (!h) return false;
  return h === '127.0.0.1:' + ACTUAL_PORT || h === 'localhost:' + ACTUAL_PORT;
}

// CSRF defense for state-changing (POST) endpoints. The Host check alone stops
// DNS-rebinding but not a plain cross-site POST aimed straight at 127.0.0.1:port
// (its Host header is legitimately ours). Browsers always attach an Origin
// header to such cross-origin requests, so we reject any Origin that isn't the
// dashboard's own. A missing Origin (curl, same-origin form nav, non-browser
// clients) is allowed — those can't be driven by a malicious web page.
function originAllowed(req) {
  const o = req.headers.origin;
  if (!o) return true;
  return o === 'http://127.0.0.1:' + ACTUAL_PORT || o === 'http://localhost:' + ACTUAL_PORT;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('Body too large')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Pure server-side validation of a /api/run body. Returns { error } on any
// rejection, or { opts } ready for startRun(). `knownNums` is a Set<string> of
// valid account check numbers. Enforces: type whitelist, businessIds shape,
// and for account audits exactly one of level|checks with valid values.
function validateRunBody(body, knownNums) {
  const type = body && body.type;
  if (type !== 'account' && type !== 'onboarding') return { error: 'Invalid audit type.' };

  const businessIds = String((body && body.businessIds) || '').trim();
  if (!/^(all|\d+(,\d+)*)$/.test(businessIds)) return { error: 'Invalid business selection.' };

  const opts = { type, businessIds, cache: !!(body && body.cache) };

  if (type === 'account') {
    const hasChecks = body.checks != null && String(body.checks).trim() !== '';
    const hasLevel = body.level != null && String(body.level).trim() !== '';
    if (hasChecks === hasLevel) return { error: 'Choose a depth tier or custom checks (exactly one).' };
    if (hasChecks) {
      const checks = String(body.checks).trim();
      if (!/^\d+(,\d+)*$/.test(checks)) return { error: 'Invalid custom check list.' };
      for (const n of checks.split(',')) {
        if (!knownNums.has(n)) return { error: 'Unknown check number: ' + n };
      }
      opts.checks = checks;
    } else {
      const level = String(body.level).trim().toLowerCase();
      if (!['quick', 'medium', 'thorough'].includes(level)) return { error: 'Invalid depth tier.' };
      opts.level = level;
    }
  }
  return { opts };
}

const KNOWN_CHECK_NUMS = new Set(CHECK_DEFS.map((d) => String(d.num)));

function handleRunPost(res, body) {
  if (isRunning()) return sendJson(res, 409, { error: 'An audit is already running.' });
  const result = validateRunBody(body, KNOWN_CHECK_NUMS);
  if (result.error) return sendJson(res, 400, { error: result.error });
  const run = startRun(result.opts);
  return sendJson(res, 202, { runId: run.runId });
}

function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  sseSend(res, 'snapshot', publicRun(currentRun || lastRun));
  sseClients.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* pruned on close */ } }, 15_000);
  ping.unref();
  req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
}

function serveClientJs(res) {
  fs.readFile(CLIENT_JS_PATH, (err, data) => {
    if (err) { res.writeHead(500, { 'Content-Type': 'application/javascript' }); res.end('// client unavailable'); return; }
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(data);
  });
}

function openFolder(res) {
  try {
    spawn('explorer.exe', [reportsDir()], { detached: true }).unref();
  } catch { /* explorer may not be present in odd environments; non-fatal */ }
  sendJson(res, 200, { ok: true });
}

function handle(req, res) {
  try {
    dispatch(req, res);
  } catch (err) {
    // A synchronous route threw. Keep the socket from hanging (the top-level
    // uncaughtException handler would otherwise leave the response unfinished).
    console.error('Request error:', err && err.message ? err.message : err);
    if (!res.headersSent) { try { sendText(res, 500, 'Internal error'); } catch { /* socket gone */ } }
  }
}

function dispatch(req, res) {
  // Applied to every response (DNS-rebinding hardening happens just below).
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (!hostAllowed(req)) return sendText(res, 403, 'Forbidden');

  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  const method = req.method;

  if (method === 'GET') {
    if (p === '/') return sendHtml(res, renderPage({ version: APP_VERSION }));
    if (p === '/client.js') return serveClientJs(res);
    if (p === '/api/meta') return sendJson(res, 200, buildMeta());
    if (p === '/api/setup') {
      return getSetup(url.searchParams.get('refresh') === '1')
        .then((d) => sendJson(res, 200, d))
        .catch((e) => sendJson(res, 200, { cliFound: true, loggedIn: false, piiUnlocked: false, error: String(e.message || e) }));
    }
    if (p === '/api/businesses') {
      return getBusinesses(url.searchParams.get('refresh') === '1')
        .then((d) => sendJson(res, 200, d))
        .catch((e) => sendJson(res, 200, { businesses: [], error: friendlyBizError(e) }));
    }
    if (p === '/api/reports') return sendJson(res, 200, { reports: listReports() });
    if (p === '/api/run/state') return sendJson(res, 200, { run: publicRun(currentRun || lastRun) });
    if (p === '/api/run/events') return handleSse(req, res);
    if (p.startsWith('/report/')) return serveReport(res, p.slice('/report/'.length));
    return sendText(res, 404, 'Not found');
  }

  if (method === 'POST') {
    // CSRF guard: reject cross-origin state-changing requests.
    if (!originAllowed(req)) return sendText(res, 403, 'Forbidden');
    if (p === '/api/run') {
      // Require a JSON content type so the CORS-safelisted text/plain trick
      // (a "simple" request that skips preflight) can't reach this endpoint.
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
        return sendJson(res, 415, { error: 'Content-Type must be application/json.' });
      }
      return readJsonBody(req)
        .then((body) => handleRunPost(res, body))
        .catch(() => sendJson(res, 400, { error: 'Bad request body.' }));
    }
    if (p === '/api/run/cancel') return sendJson(res, 202, { cancelled: cancelRun() });
    if (p === '/api/open-folder') return openFolder(res);
    return sendText(res, 404, 'Not found');
  }

  return sendText(res, 405, 'Method not allowed');
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// ---------------------------------------------------------------------------
// Boot / port handling
// ---------------------------------------------------------------------------

const server = http.createServer(handle);
let usedEphemeralPort = false;

function openBrowser(url) {
  // Opt-out for headless/automated launches; the printed URL still works.
  if (process.env.NEXUDUS_DASHBOARD_NO_OPEN) return;
  // Empty '' fills `start`'s title slot so a URL with spaces isn't taken as the title.
  try {
    spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true, detached: true }).unref();
  } catch { /* headless / no shell — the printed URL still works */ }
}

function printBanner(url) {
  // Border width derived from the content so the box always lines up.
  const title = 'Nexudus Audit Dashboard is running';
  const bar = '─'.repeat(title.length + 6);
  console.log('');
  console.log('  ┌' + bar + '┐');
  console.log('  │   ' + title + '   │');
  console.log('  └' + bar + '┘');
  console.log('');
  console.log('  Open in your browser:  ' + url);
  console.log('');
  console.log('  Keep this window open while you use the dashboard.');
  console.log('  Close it (or press Ctrl+C) to stop the dashboard.');
  console.log('');
}

function onListening() {
  ACTUAL_PORT = server.address().port;
  const url = 'http://127.0.0.1:' + ACTUAL_PORT + '/';
  printBanner(url);
  openBrowser(url);
}

function probeExisting(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/meta', timeout: 1500 }, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => {
        try { resolve(JSON.parse(d).app === APP_MARKER); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function fatal(err) {
  console.error('Dashboard failed to start:', err.message);
  process.exit(1);
}

function onServerError(err) {
  if (err.code === 'EADDRINUSE' && !usedEphemeralPort) {
    probeExisting(DEFAULT_PORT).then((isUs) => {
      const url = 'http://127.0.0.1:' + DEFAULT_PORT + '/';
      if (isUs) {
        console.log('A dashboard is already running — opening ' + url);
        openBrowser(url);
        process.exit(0);
      } else {
        console.log('Port ' + DEFAULT_PORT + ' is in use; starting on a free port instead.');
        usedEphemeralPort = true;
        server.listen(0, '127.0.0.1');
      }
    });
    return;
  }
  fatal(err);
}

// The dashboard is a long-lived local server the operator leaves open; a single
// stray event (a child stdio hiccup, a client socket resetting mid-write) must
// never crash it. Log and keep serving rather than exit.
process.on('uncaughtException', (err) => { console.error('Dashboard warning (continuing):', err && err.message ? err.message : err); });
process.on('unhandledRejection', (err) => { console.error('Dashboard warning (continuing):', err && err.message ? err.message : err); });

function main() {
  reportsDir(); // resolve (and memoize) up front; logs a warning if it fails
  server.on('listening', onListening);
  server.on('error', onServerError);
  server.listen(DEFAULT_PORT, '127.0.0.1');
}

// Only boot the server when run directly (node scripts/ui.js). When required as
// a module (unit tests), just expose the pure, spawn-free helpers.
if (require.main === module) {
  main();
}

module.exports = {
  parseCheckLine,
  classifySummary,
  reportNameRejection,
  parseReportEntries,
  validateRunBody,
  classifyExit,
  buildMeta,
};
