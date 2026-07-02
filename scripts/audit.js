#!/usr/bin/env node

// Entry point for the Nexudus account-health audit. Parses CLI flags, drives the
// interactive prompts, orchestrates prefetch + checks, and writes the .md and
// .html reports. The audit logic lives in ./lib/*; this file wires it together.

const fs = require('fs');
const path = require('path');
const state = require('./lib/state');
const log = require('./lib/log');
const {
  TODAY_STR, TIMESTAMP, MAX_CONCURRENT_CLI_CLEAR, MAX_CONCURRENT_CLI_REDACTED,
  resolveReportsDir,
} = require('./lib/config');
const { classifyError } = require('./lib/util');
const {
  runCLI, acquireLock, computeOperatorCacheKey, configureCache,
  setConcurrencyLimit, CACHE_DIR_BASE,
} = require('./lib/nexudus-cli');
const {
  fetchAccessibleBusinessIds, prefetchAll, getBusinesses, computeCoworkerStats,
} = require('./lib/data');
const {
  CHECK_DEFS, CHECK_TIERS, CHECK_DEPS, LEVEL_TO_LETTER,
} = require('./lib/check-defs');
const { buildReport } = require('./lib/report-markdown');
const { buildHtmlReport } = require('./lib/report-html');
const { loadCliTokenMap, detokenizeResults } = require('./lib/detokenize');

// ---------------------------------------------------------------------------
// CLI argument parsing — lenient, ignores unknown flags
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    businessIds: null,   // raw string from CLI: 'all', '12345', '12345,67890'
    level: null,         // 'quick' | 'medium' | 'thorough'
    checks: null,        // raw string of check numbers: '2,4,9,20'
    showChecks: false,
    all: false,
    cache: false,
    serial: false,
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
      case '--all': opts.all = true; break;
      case '--cache': opts.cache = true; break;
      case '--serial': opts.serial = true; break;
      case '--business-ids':
      case '--business-id':
        opts.businessIds = requireValue(arg, ++i);
        break;
      case '--level':
        opts.level = requireValue(arg, ++i);
        break;
      case '--checks':
        opts.checks = requireValue(arg, ++i);
        break;
      case '--output':
        opts.output = requireValue(arg, ++i);
        break;
      // unknown flags ignored to stay forward-compatible
    }
  }
  if (opts.all) {
    if (!opts.businessIds) opts.businessIds = 'all';
    if (!opts.level && !opts.checks) opts.level = 'thorough';
  }
  return opts;
}

// Validates a raw --business-ids value against the IDs the logged-in operator
// can actually see. Returns a Set<string> for filtering, or null for "all".
// Throws on the first unknown ID without echoing the operator's real business
// list, so AI-driven invocations don't leak it into the conversation.
function validateBusinessIds(str, accessible) {
  if (!accessible || accessible.size === 0) {
    throw new Error('No businesses are accessible to this account. Run `nexudus login` or contact your Nexudus administrator.');
  }
  // Distinguish "flag not provided" (str == null) from "flag provided empty"
  // (str === ''). The first means audit-all; the second is invalid input that
  // must be rejected so `--business-ids ""` doesn't silently audit everything.
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

function parseChecksArg(str) {
  if (!str) return null;
  const nums = String(str).split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const n = parseInt(s, 10);
    if (Number.isNaN(n) || n < 1) {
      throw new Error(`Invalid check number: "${s}" (must be a positive integer)`);
    }
    return n;
  });
  return nums.length > 0 ? nums : null;
}

// ---------------------------------------------------------------------------
// Selection helpers: drive which checks run and prompt the operator
// ---------------------------------------------------------------------------

function tiersForCheck(num) {
  return CHECK_TIERS[num] || [];
}

function selectChecks(level, customNums) {
  if (customNums && customNums.length > 0) {
    const known = new Set(CHECK_DEFS.map(d => d.num));
    const unknown = customNums.filter(n => !known.has(n));
    if (unknown.length > 0) {
      throw new Error(`Unknown check number(s): ${unknown.join(', ')}. Valid checks are 1-${CHECK_DEFS.length} (run with --show-checks to list them).`);
    }
    const wanted = new Set(customNums);
    return CHECK_DEFS.filter(d => wanted.has(d.num));
  }
  if (!level) return CHECK_DEFS.slice(); // default = all
  const letter = LEVEL_TO_LETTER[String(level).toLowerCase()];
  if (!letter) throw new Error(`Unknown audit level: "${level}" (use quick / medium / thorough)`);
  return CHECK_DEFS.filter(d => tiersForCheck(d.num).includes(letter));
}

function buildChecksTable() {
  const lines = [];
  const counts = { Q: 0, M: 0, T: 0 };
  for (const tiers of Object.values(CHECK_TIERS)) {
    for (const t of tiers) counts[t] = (counts[t] || 0) + 1;
  }

  // Light Unicode box-drawing for a clean, professional look. Renders
  // correctly in modern terminals (Windows Terminal, PowerShell 7+, *nix).
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

  const checkRows = [];
  for (const def of CHECK_DEFS) {
    const sev = def.severity || 'INSIGHT';
    const t = tiersForCheck(def.num);
    const tiers = ['Q', 'M', 'T'].map(letter => t.includes(letter) ? letter : '·').join(' ');
    checkRows.push([String(def.num), sev, tiers, def.name]);
  }

  lines.push(`Audit checks — ${CHECK_DEFS.length} total`);
  lines.push('');
  lines.push(...renderBoxTable(['#', 'Severity', 'Tiers', 'Title'], checkRows));
  lines.push('');
  lines.push('Audit depth options');
  lines.push('');

  const depthRows = [
    ['Q', 'Quick', '~10s', String(counts.Q).padStart(2), 'light data only (products, tariffs, discount codes, resources, paused contracts)'],
    ['M', 'Medium', '~45s', String(counts.M).padStart(2), 'adds Coworkers + contracts'],
    ['T', 'Thorough', '~90s', String(counts.T).padStart(2), 'adds invoices, bookings, charges, checkins'],
  ];
  lines.push(...renderBoxTable(['', 'Tier', 'Time', 'Checks', 'Scope'], depthRows));
  lines.push('');
  lines.push('How to choose');
  lines.push('');

  const instructionRows = [
    ['q  ·  m  ·  t', 'Select a preset tier (Quick, Medium, or Thorough)'],
    ['c <numbers>', 'Select specific checks by number (e.g. c 2,4,9,20)'],
  ];
  lines.push(...renderBoxTable(['Command', 'Description'], instructionRows));

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

function parseChoice(raw) {
  const trimmed = String(raw || '').trim().toLowerCase();
  if (!trimmed) {
    // Empty input = no choice. Caller decides whether to default or re-prompt.
    return { level: null, checks: null, empty: true };
  }
  if (trimmed.startsWith('c')) {
    const rest = trimmed.slice(1).trim().replace(/^[:,\s]+/, '');
    const checks = parseChecksArg(rest);
    if (!checks) throw new Error(`Custom selection needs check numbers (e.g. "c 2,4,9,20"). Got: "${raw}"`);
    return { level: null, checks };
  }
  const first = trimmed.charAt(0);
  if (first === 'q') return { level: 'quick', checks: null };
  if (first === 'm') return { level: 'medium', checks: null };
  if (first === 't') return { level: 'thorough', checks: null };
  throw new Error(`Unknown choice: "${raw}". Type q, m, t, or "c <numbers>".`);
}

async function runInteractivePrompts(opts, accessibleBusinessIds) {
  if (!opts.businessIds) {
    let collected = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ans = await promptStdin('Enter Business IDs to audit, comma-separated (or "all"): ');
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
    // Re-validated in main() below so the flag path and the interactive path
    // go through the same validation gate.
    opts.businessIds = collected;
  }
  if (!opts.level && !opts.checks) {
    console.log('');
    console.log(buildChecksTable());
    console.log('');
    const ans = await promptStdin('Choice — type "q", "m", "t", or "c <numbers>" (e.g. "c 2,4,9,20"): ');
    const parsed = parseChoice(ans);
    if (parsed.empty) {
      console.log(`  No choice entered — defaulting to Thorough (all ${CHECK_DEFS.length} checks). Press Ctrl-C to abort.`);
      opts.level = 'thorough';
    } else {
      if (parsed.level) opts.level = parsed.level;
      if (parsed.checks) opts.checks = parsed.checks.join(',');
    }
  }
}

function fmtBusinessScope(ids) {
  if (!ids) return 'all businesses';
  return `${ids.size} business${ids.size !== 1 ? 'es' : ''}`;
}

function fmtChecksScope(level, checks, totalAvailable) {
  if (checks) return `custom (${checks.length} of ${totalAvailable} checks)`;
  if (level) return `${level} (${totalAvailable} checks)`;
  return `${totalAvailable} checks`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Probe the CLI's PII state once. The envelope's piiRedaction flag is "off"
// only when the operator has unlocked pii-mode in their session, in which case
// fetches return clear data and the .md gets a loud warning at write time.
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

  // Pick the output mode once: interactive (single redrawing progress line,
  // chatter suppressed) only when both stdout and stderr are real TTYs; any
  // piped/redirected stream (incl. the AI-driven skill flow) gets plain
  // sequential logging with no ANSI escapes.
  log.init({ interactive: !!(process.stdout.isTTY && process.stderr.isTTY) });

  // Print the tier-tagged checklist and exit. The table is built from static
  // data, so skip the lock, auth check and PII probe entirely. The AI-driven
  // flow calls this to render the same selection table shown in standalone.
  if (opts.showChecks) {
    console.log(buildChecksTable());
    return;
  }

  // Refuse to start if another audit is already running: concurrent runs
  // would race on cache files and report output. Stale locks (process gone)
  // are reclaimed automatically.
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

  // Verify auth upfront before doing anything else (prompts, data fetches, etc).
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

  // Detect whether the CLI returns clear PII (operator unlocked pii-mode). The
  // audit relies on the CLI's automatic tokenization (locked mode) to keep the
  // .md PII-free, so a clear/unlocked fetch is a caveat we warn about at write
  // time. Detected before any fetch so the disk-cache key reflects it.
  detectPiiMode();

  // Redacted fetches must stay sequential (parallel redaction crashes the
  // CLI); clear fetches are safe to parallelise. Set before any fetch.
  setConcurrencyLimit(state.fetchClear ? MAX_CONCURRENT_CLI_CLEAR : MAX_CONCURRENT_CLI_REDACTED);
  if (state.fetchClear) {
    log.info(`pii-mode is unlocked: fetching clear data with up to ${MAX_CONCURRENT_CLI_CLEAR} parallel CLI calls.`);
  }

  // Fetch the operator's accessible businesses up front so we can validate any
  // ID supplied via flag or interactive prompt before doing real work.
  let accessibleBusinessIds;
  try {
    accessibleBusinessIds = fetchAccessibleBusinessIds();
  } catch (err) {
    console.error('\nFailed to fetch accessible businesses:', err.message, '\n');
    process.exitCode = 1;
    return;
  }

  // Configure disk cache if requested. Operator-key derived from the accessible
  // business set so a different login lands in a different cache directory.
  const diskCacheEnabled = !!opts.cache;
  const operatorCacheKey = computeOperatorCacheKey(accessibleBusinessIds);
  configureCache(diskCacheEnabled, operatorCacheKey);
  if (diskCacheEnabled) {
    log.info(`Disk cache enabled (TTL 1h) — ${path.join(CACHE_DIR_BASE, operatorCacheKey)}`);
  }

  // If running interactively (TTY) and the operator hasn't provided flags,
  // walk them through the same prompts the AI would.
  const needsBusiness = opts.businessIds == null;
  const needsDepth = opts.level == null && opts.checks == null;
  if (needsBusiness || needsDepth) {
    if (process.stdin.isTTY) {
      try {
        await runInteractivePrompts(opts, accessibleBusinessIds);
      } catch (err) {
        console.error(`\n${err.message}\n`);
        process.exitCode = 2;
        return;
      }
    } else if (needsBusiness && needsDepth) {
      // Non-TTY with no flags: keep legacy behavior (full audit, all businesses).
      // This preserves automation use cases where the script is piped.
    } else {
      console.error('Missing required flags. Provide --business-ids and --level (or --checks), or run interactively.');
      console.error('Usage:');
      console.error('  node audit.js --business-ids <ids|all> --level <quick|medium|thorough>');
      console.error('  node audit.js --business-ids <ids|all> --checks 2,4,9,20');
      console.error('  node audit.js --all                 # full audit, no prompts');
      console.error('  node audit.js --show-checks         # print the tier-tagged checklist');
      process.exitCode = 2;
      return;
    }
  }

  // Resolve selections. Validation fails fast on unknown / unauthorized IDs.
  try {
    state.selectedBusinessIds = validateBusinessIds(opts.businessIds, accessibleBusinessIds);
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  const customNums = parseChecksArg(opts.checks);
  const selectedDefs = selectChecks(opts.level, customNums);

  if (selectedDefs.length === 0) {
    console.error('No checks selected. Nothing to do.');
    process.exitCode = 2;
    return;
  }

  // Compact scope line, then the single self-updating progress line takes
  // over (stderr; no-op in plain mode where the per-step logging remains).
  log.out(`Nexudus Account Health Audit — ${TODAY_STR} · ${fmtBusinessScope(state.selectedBusinessIds)} · ${fmtChecksScope(opts.level, customNums, selectedDefs.length)}`);
  log.info('');
  log.progress.start('Preparing…');

  // Prefetch shared entities unless --serial was requested. Each getX()
  // returns straight from `cache` afterwards, so the data-fetch phase happens
  // in one upfront pass instead of piecemeal inside the checks.
  if (!opts.serial) {
    const needed = new Set();
    for (const def of selectedDefs) {
      for (const dep of CHECK_DEPS[def.num] || []) needed.add(dep);
    }
    // Contracts are scoped by joining to the selected businesses' coworkers,
    // so when scoping is active prefetch those too; otherwise the join would
    // fetch them lazily (serially) at check time.
    if (state.selectedBusinessIds && needed.has('contracts')) {
      needed.add('coworkersAll');
    }
    // prefetchAll never rejects: failed entities are reported, left uncached,
    // and re-fetched lazily by their getX() when a check needs them. The
    // onEntity callback drives the progress line as fetches settle.
    const totalEntities = needed.size;
    if (totalEntities > 0) {
      log.progress.update(`Fetching data… 0/${totalEntities} entities`);
    }
    await prefetchAll([...needed], (done, total) => {
      log.progress.update(`Fetching data… ${done}/${total} entities`);
    });
    log.info('');
  }

  const results = {};
  let erroredChecks = 0;
  for (let i = 0; i < selectedDefs.length; i++) {
    const def = selectedDefs[i];
    // Interactive: the progress line shows the check that is about to run —
    // checks are synchronous (spawnSync), so this boundary update is the only
    // moment the line can move. Plain mode: no progress line; the per-check
    // result line below is the (unchanged) progress signal.
    log.progress.update(`[${i + 1}/${selectedDefs.length}] #${def.num} ${def.name}`);
    const prefix = `  [${i + 1}/${selectedDefs.length}] #${def.num} ${def.name}`;
    let summary;
    let errored = false;
    try {
      results[def.key] = def.fn();
      const r = results[def.key];
      summary = r.status === 'PASS' ? 'PASS' : `${r.items.length} issue(s)`;
    } catch (err) {
      const errorClass = classifyError(err);
      results[def.key] = { status: 'ERROR', items: [], error: err.message, errorClass };
      summary = `ERROR [${errorClass}]: ${err.message}`;
      errored = true;
      erroredChecks++;
    }
    if (errored && log.isInteractive()) {
      // Errors must surface even with per-check chatter suppressed.
      log.warn(`${prefix} — ${summary}`);
    }
    // Plain mode keeps the exact per-check output line; dropped in interactive.
    log.info(`${prefix} — ${summary}`);
  }

  log.info('');
  log.progress.update('Writing reports…');

  // Determine output paths. Without --output, reports go to the Desktop
  // "Nexudus Audit Reports" folder (resolveReportsDir creates it).
  const reportsDir = opts.output
    ? path.dirname(path.resolve(opts.output))
    : resolveReportsDir();
  fs.mkdirSync(reportsDir, { recursive: true });

  const mdPath = opts.output
    ? path.resolve(opts.output)
    : path.join(reportsDir, `account-audit-${TIMESTAMP}.md`);
  const mdExt = path.extname(mdPath);
  const basePath = mdExt ? mdPath.slice(0, -mdExt.length) : mdPath;
  const htmlPath = basePath + '.html';

  // Count total issues (severity checks only; insights are informational)
  let totalIssues = 0;
  for (const def of selectedDefs) {
    if (def.section === 'insights') continue;
    const r = results[def.key];
    if (r && r.status !== 'ERROR') totalIssues += r.items.length;
  }

  // Filter the registry to only the checks that ran, so reports don't show
  // unselected checks as "no issues" (which would be misleading).
  const ranKeys = new Set(selectedDefs.map(d => d.key));
  const ranDefs = CHECK_DEFS.filter(d => ranKeys.has(d.key));

  // Resolve business names for the scope card / footer in the branded HTML.
  // If the businesses lookup fails the report still renders with just IDs.
  const businessNames = new Map();
  try {
    for (const b of getBusinesses()) {
      businessNames.set(String(b.Id), b.Name || '');
    }
  } catch (_err) {
    // Non-fatal: names will be empty and the report shows just the IDs.
  }

  // Write reports: .md for AI-assisted fixes, .html as the Nexudus-branded
  // operator deliverable.
  const scopeMeta = {
    businesses: state.selectedBusinessIds ? Array.from(state.selectedBusinessIds) : null,
    businessNames,
    level: opts.level || (customNums ? 'custom' : 'thorough'),
    checksRun: ranDefs.map(d => d.num),
    coworkerStats: computeCoworkerStats(),
  };
  // The .md keeps whatever the CLI returned. In a locked run that's tokens
  // (AI-safe); if the operator unlocked pii-mode the fetch came back clear and
  // the .md will contain real PII, so warn loudly. We never tokenize data
  // ourselves.
  if (state.fetchClear) {
    log.warn('Warning: pii-mode is UNLOCKED — the .md will contain REAL PII (the CLI did not tokenize it). Run with pii-mode locked for a redacted .md.');
  }
  const report = buildReport(results, ranDefs, scopeMeta);
  fs.writeFileSync(mdPath, report, 'utf8');

  // The .html is the operator-only deliverable: reverse the CLI's tokens back
  // to real values using the CLI's own local token store. No-op when the data
  // is already clear or the store is unavailable (the .html then keeps tokens).
  const tokenMap = loadCliTokenMap();
  const htmlResults = detokenizeResults(results, tokenMap);
  const htmlReport = buildHtmlReport(htmlResults, ranDefs, scopeMeta);
  fs.writeFileSync(htmlPath, htmlReport, 'utf8');
  if (!state.fetchClear && tokenMap.size === 0) {
    log.warn('Note: local PII token map (~/.nexudus/pii-tokens.json) not found — the .html will show tokens, not real values.');
  }

  // Final summary block; the user sees this before deciding to share the .md
  // with AI. Progress line is retired first so the block lands on clean rows.
  log.progress.done();
  const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const { pathToFileURL } = require('url');
  // Bold ANSI only when writing to a real terminal; plain mode stays escape-free.
  const bold = s => (log.isInteractive() ? `\x1b[1m${s}\x1b[0m` : s);
  const rule = '─'.repeat(60);
  log.out('');
  log.out(rule);
  log.out(bold(`  Audit complete — ${totalIssues} issue(s) across ${selectedDefs.length} check(s) in ${elapsedSec}s`));
  if (erroredChecks > 0) {
    log.out(`  (${erroredChecks} check${erroredChecks === 1 ? '' : 's'} errored — details in the report)`);
  }
  log.out('');
  log.out('  Report (Ctrl+Click to open · Ctrl+P to save as PDF):');
  log.out(`    ${bold(pathToFileURL(htmlPath).href)}`);
  log.out('');
  log.out(`  md (AI-readable): ${mdPath}`);
  log.out(rule);
}

main().catch(err => {
  // Retire any live progress line so the error isn't spliced into it.
  log.progress.done();
  console.error('Fatal error:', err.message);
  process.exitCode = 1;
});
