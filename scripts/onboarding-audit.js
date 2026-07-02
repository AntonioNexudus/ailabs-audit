#!/usr/bin/env node

// Entry point for the Nexudus Onboarding Check-in Audit. Same interactive
// flow as scripts/audit.js (Business-ID prompt -> run -> progress line ->
// report link) but simpler: no depth tiers (every check always runs, this
// audit is small), pass/warn/fail/skip semantics instead of issue counts, and
// only an HTML report is written (no .md — there's no AI fix flow for this
// audit, the HTML is the whole deliverable). Reuses the same lib/* modules
// scripts/audit.js does; this file owns only the wiring.

const fs = require('fs');
const path = require('path');
const state = require('./lib/state');
const log = require('./lib/log');
const {
  TODAY_STR, TIMESTAMP, MAX_CONCURRENT_CLI_CLEAR, MAX_CONCURRENT_CLI_REDACTED,
  resolveReportsDir,
} = require('./lib/config');
const {
  runCLI, acquireLock, computeOperatorCacheKey, configureCache,
  setConcurrencyLimit, CACHE_DIR_BASE,
} = require('./lib/nexudus-cli');
const { fetchAccessibleBusinessIds, getBusinesses } = require('./lib/data');
const { ONBOARDING_CHECK_DEFS } = require('./lib/onboarding-check-defs');
const { buildOnboardingReport } = require('./lib/onboarding-report');
const { loadCliTokenMap, detokenizeResults } = require('./lib/detokenize');

// ---------------------------------------------------------------------------
// CLI argument parsing — lenient, ignores unknown flags. Deliberately smaller
// than audit.js's: no --level/--checks (no depth tiers) and no --serial (no
// prefetch phase to skip).
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    businessIds: null,   // raw string: 'all', '12345', '12345,67890'
    showChecks: false,
    cache: false,
    output: null,
  };
  const requireValue = (flag, idx) => {
    if (idx >= argv.length) throw new Error(`Flag ${flag} requires a value`);
    return argv[idx];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--show-checks': opts.showChecks = true; break;
      case '--cache': opts.cache = true; break;
      case '--business-ids':
      case '--business-id':
        opts.businessIds = requireValue(arg, ++i);
        break;
      case '--output':
        opts.output = requireValue(arg, ++i);
        break;
      // unknown flags ignored to stay forward-compatible
    }
  }
  return opts;
}

// Same validation gate as audit.js: throws on the first unknown ID without
// echoing the operator's real business list, so AI-driven invocations don't
// leak it into the conversation.
function validateBusinessIds(str, accessible) {
  if (!accessible || accessible.size === 0) {
    throw new Error('No businesses are accessible to this account. Run `nexudus login` or contact your Nexudus administrator.');
  }
  if (str == null || String(str).trim().toLowerCase() === 'all') return null;
  const ids = String(str).split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    throw new Error('No Business IDs provided. Pass a comma-separated list or "all".');
  }
  for (const id of ids) {
    if (!/^\d+$/.test(id)) {
      throw new Error(`Invalid Business ID: "${id}" (must be numeric).`);
    }
    if (!accessible.has(id)) {
      throw new Error(`Business ID "${id}" is not in your accessible businesses. Run \`nexudus businesses list\` to see your IDs.`);
    }
  }
  return new Set(ids);
}

function buildChecksTable() {
  const lines = [];
  const bySection = new Map();
  for (const def of ONBOARDING_CHECK_DEFS) {
    if (!bySection.has(def.section)) bySection.set(def.section, []);
    bySection.get(def.section).push(def);
  }

  const renderBoxTable = (headers, rows) => {
    const widths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => r[i].length))
    );
    const rule = (left, mid, right) =>
      left + widths.map(w => '─'.repeat(w + 2)).join(mid) + right;
    const fmtRow = cells =>
      '│ ' + cells.map((c, i) => String(c).padEnd(widths[i])).join(' │ ') + ' │';
    return [
      rule('┌', '┬', '┐'),
      fmtRow(headers),
      rule('├', '┼', '┤'),
      ...rows.map(fmtRow),
      rule('└', '┴', '┘'),
    ];
  };

  lines.push(`Onboarding check-in audit checks — ${ONBOARDING_CHECK_DEFS.length} total, always run in full (no depth tiers)`);
  for (const [section, defs] of bySection) {
    lines.push('');
    lines.push(section);
    lines.push('');
    lines.push(...renderBoxTable(['#', 'Check'], defs.map(d => [String(d.num), d.name])));
  }

  return lines.join('\n');
}

function promptStdin(question) {
  const readline = require('readline');
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer == null ? '' : String(answer).trim());
    });
  });
}

async function promptBusinessIds(opts, accessibleBusinessIds) {
  if (opts.businessIds) return;
  let collected = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ans = await promptStdin('Enter Business IDs to check in on, comma-separated (or "all"): ');
    if (!ans) {
      console.log('Must enter business ID to continue');
      if (attempt === 0) continue;
      break;
    }
    try {
      validateBusinessIds(ans, accessibleBusinessIds);
      collected = ans;
      break;
    } catch (err) {
      console.log(err.message);
      if (attempt === 0) continue;
      break;
    }
  }
  if (collected == null) {
    throw new Error('No valid Business ID entered after 2 attempts. Exiting.');
  }
  opts.businessIds = collected;
}

function fmtBusinessScope(ids) {
  if (!ids) return 'all businesses';
  return `${ids.size} business${ids.size !== 1 ? 'es' : ''}`;
}

// Probe the CLI's PII state once, same as audit.js: the envelope's
// piiRedaction flag is "off" only when the operator has unlocked pii-mode.
function detectPiiMode() {
  try {
    const r = runCLI(['businesses', 'list', '--page-size', '1']);
    state.fetchClear = !!r && r.piiRedaction === 'off';
  } catch {
    state.fetchClear = false;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  log.init({ interactive: !!(process.stdout.isTTY && process.stderr.isTTY) });

  // Print the grouped checklist and exit — no lock, auth, or PII probe needed.
  if (opts.showChecks) {
    console.log(buildChecksTable());
    return;
  }

  const lock = acquireLock();
  if (!lock.acquired) {
    if (lock.pid) {
      console.error(`\nAnother audit is already running (pid ${lock.pid}). Wait for it to finish or kill the process.\n`);
    } else {
      console.error(`\nCould not acquire audit lock: ${lock.error || 'unknown error'}\n`);
    }
    process.exitCode = 1;
    return;
  }
  if (lock.reclaimed) {
    log.warn('Reclaimed stale lock from previous run.');
  }

  try {
    const doctor = runCLI(['doctor', '--json']);
    if (!doctor.ok || !doctor.data?.credentialsStored) {
      console.error('\n Authentication error: nexudus CLI not logged in.');
      console.error('   Run: nexudus login\n');
      process.exitCode = 1;
      return;
    }
  } catch (err) {
    console.error('\n Failed to verify authentication:', err.message, '\n');
    process.exitCode = 1;
    return;
  }

  detectPiiMode();

  setConcurrencyLimit(state.fetchClear ? MAX_CONCURRENT_CLI_CLEAR : MAX_CONCURRENT_CLI_REDACTED);
  if (state.fetchClear) {
    log.info(`pii-mode is unlocked: fetching clear data with up to ${MAX_CONCURRENT_CLI_CLEAR} parallel CLI calls.`);
  }

  let accessibleBusinessIds;
  try {
    accessibleBusinessIds = fetchAccessibleBusinessIds();
  } catch (err) {
    console.error('\nFailed to fetch accessible businesses:', err.message, '\n');
    process.exitCode = 1;
    return;
  }

  const diskCacheEnabled = !!opts.cache;
  const operatorCacheKey = computeOperatorCacheKey(accessibleBusinessIds);
  configureCache(diskCacheEnabled, operatorCacheKey);
  if (diskCacheEnabled) {
    log.info(`Disk cache enabled (TTL 1h) — ${path.join(CACHE_DIR_BASE, operatorCacheKey)}`);
  }

  if (opts.businessIds == null) {
    if (process.stdin.isTTY) {
      try {
        await promptBusinessIds(opts, accessibleBusinessIds);
      } catch (err) {
        console.error(`\n${err.message}\n`);
        process.exitCode = 2;
        return;
      }
    }
    // Non-TTY with no --business-ids: keep legacy behavior (all businesses),
    // same as audit.js, so piped/automation callers don't need the flag.
  }

  try {
    state.selectedBusinessIds = validateBusinessIds(opts.businessIds, accessibleBusinessIds);
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  log.out(`Nexudus Onboarding Check-in Audit — ${TODAY_STR} · ${fmtBusinessScope(state.selectedBusinessIds)} · ${ONBOARDING_CHECK_DEFS.length} checks`);
  log.info('');
  log.progress.start('Preparing…');

  const results = {};
  for (let i = 0; i < ONBOARDING_CHECK_DEFS.length; i++) {
    const def = ONBOARDING_CHECK_DEFS[i];
    log.progress.update(`[${i + 1}/${ONBOARDING_CHECK_DEFS.length}] #${def.num} ${def.name}`);
    const prefix = `  [${i + 1}/${ONBOARDING_CHECK_DEFS.length}] #${def.num} ${def.name}`;
    let summary;
    try {
      const r = def.fn();
      results[def.key] = r && typeof r === 'object' && r.status ? r : { status: 'skip', detail: 'Check returned no result.' };
      summary = results[def.key].status.toUpperCase();
    } catch (err) {
      results[def.key] = { status: 'fail', detail: `Check errored: ${err.message}`, hint: 'Re-run the audit; if this persists, capture the error and the check number for triage.' };
      summary = `ERROR: ${err.message}`;
      log.warn(`${prefix} — ${summary}`);
    }
    log.info(`${prefix} — ${summary}`);
  }

  log.info('');
  log.progress.update('Writing report…');

  // Group into report sections, preserving ONBOARDING_CHECK_DEFS order.
  const sectionOrder = [];
  const sectionMap = new Map();
  for (const def of ONBOARDING_CHECK_DEFS) {
    if (!sectionMap.has(def.section)) {
      sectionMap.set(def.section, []);
      sectionOrder.push(def.section);
    }
    const r = results[def.key];
    sectionMap.get(def.section).push({
      num: def.num,
      name: def.name,
      status: r.status,
      detail: r.detail,
      hint: r.hint,
    });
  }
  let sections = sectionOrder.map(title => ({ title, checks: sectionMap.get(title) }));

  // The .html is the operator-only deliverable: reverse the CLI's tokens back
  // to real values using the CLI's own local token store, same as audit.js.
  const tokenMap = loadCliTokenMap();
  sections = detokenizeResults(sections, tokenMap);

  // Resolve business names for the header scope line.
  const businessNames = new Map();
  try {
    for (const b of getBusinesses()) {
      businessNames.set(String(b.Id), b.Name || '');
    }
  } catch (_err) {
    // Non-fatal: names will be empty and the report shows just the IDs.
  }

  const scopeMeta = {
    businesses: state.selectedBusinessIds ? Array.from(state.selectedBusinessIds) : null,
    businessNames,
  };

  if (state.fetchClear) {
    log.warn('Warning: pii-mode is UNLOCKED — the report will contain REAL PII (the CLI did not tokenize it).');
  }
  if (!state.fetchClear && tokenMap.size === 0) {
    log.warn('Note: local PII token map (~/.nexudus/pii-tokens.json) not found — the report will show tokens, not real values.');
  }

  const htmlReport = buildOnboardingReport(sections, scopeMeta);

  const reportsDir = opts.output
    ? path.dirname(path.resolve(opts.output))
    : resolveReportsDir();
  fs.mkdirSync(reportsDir, { recursive: true });
  const htmlPath = opts.output
    ? (path.extname(opts.output) ? path.resolve(opts.output) : path.resolve(opts.output) + '.html')
    : path.join(reportsDir, `onboarding-audit-${TIMESTAMP}.html`);
  fs.writeFileSync(htmlPath, htmlReport, 'utf8');

  // Final summary block.
  log.progress.done();
  const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const { pathToFileURL } = require('url');
  const bold = s => (log.isInteractive() ? `\x1b[1m${s}\x1b[0m` : s);
  const rule = '─'.repeat(60);

  let warnCount = 0, failCount = 0, skipCount = 0;
  for (const def of ONBOARDING_CHECK_DEFS) {
    const status = results[def.key].status;
    if (status === 'warn') warnCount++;
    else if (status === 'fail') failCount++;
    else if (status === 'skip') skipCount++;
  }

  log.out('');
  log.out(rule);
  log.out(bold(`  Check-in complete — ${warnCount} warning${warnCount === 1 ? '' : 's'}, ${failCount} failed of ${ONBOARDING_CHECK_DEFS.length} checks in ${elapsedSec}s`));
  if (skipCount > 0) {
    log.out(`  (${skipCount} check${skipCount === 1 ? '' : 's'} skipped — data not reachable via the CLI, see hints in the report)`);
  }
  log.out('');
  log.out('  Report (Ctrl+Click to open · Ctrl+P to save as PDF):');
  log.out(`    ${bold(pathToFileURL(htmlPath).href)}`);
  log.out(rule);
}

main().catch(err => {
  log.progress.done();
  console.error('Fatal error:', err.message);
  process.exitCode = 1;
});
