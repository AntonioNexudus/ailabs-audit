const { escHtml } = require('./util');
const { TODAY_STR } = require('./config');
const { C, FONT_DISPLAY, FONT_BODY, GOOGLE_FONTS_URL, STATUS, baseCss } = require('./brand');

// ---------------------------------------------------------------------------
// Branded HTML report for the onboarding check-in audit — the samaudit
// pass/warn/fail/skip template built on lib/brand.js's shared shell
// (baseCss(), STATUS). Port of samaudittoollocal/report.py's _detail_html /
// _check_card / _section_html for this tool's check shape ({ status, detail,
// hint }). Self-contained HTML; the Google Fonts <link> is the only external
// reference.
// ---------------------------------------------------------------------------

const STATUS_ORDER = ['pass', 'warn', 'fail', 'skip'];

function badge(status) {
  return `<span class="badge ${status}">${escHtml(status.toUpperCase())}</span>`;
}

function pill(status, n) {
  if (!n) return '';
  return `<span class="pill ${status}">${n}</span>`;
}

// Renders a check's `detail` text, mirroring samaudittoollocal's
// report.py:_detail_html:
//   - empty            -> nothing
//   - single line      -> plain div
//   - lines with " | " -> multi-column table (first line = header)
//   - otherwise        -> "Label: value" 2-column field table (falls back to
//                         a full-width cell for lines without ": ")
// Every value is HTML-escaped; this is the only place check detail text
// reaches the page, so it is also the XSS boundary for check-authored text.
function detailHtml(text) {
  if (!text) return '';
  const lines = String(text).split('\n');
  if (lines.length === 1) {
    return `<div class="check-detail">${escHtml(text)}</div>`;
  }

  if (lines.some(line => line.includes(' | '))) {
    const rows = lines.map((line, i) => {
      const cols = line.split(' | ').map(c => c.trim());
      const tag = i === 0 ? 'th' : 'td';
      return `<tr>${cols.map(c => `<${tag}>${escHtml(c)}</${tag}>`).join('')}</tr>`;
    });
    return `<table class="field-table multi-col">${rows.join('')}</table>`;
  }

  const rows = lines.map(line => {
    const sep = line.indexOf(': ');
    if (sep === -1) return `<tr><td colspan="2">${escHtml(line)}</td></tr>`;
    const label = line.slice(0, sep);
    const value = line.slice(sep + 2);
    const missing = value === '—';
    const cls = missing ? ' class="field-missing"' : '';
    return `<tr><td class="field-label">${escHtml(label)}</td><td${cls}>${escHtml(value)}</td></tr>`;
  });
  return `<table class="field-table">${rows.join('')}</table>`;
}

// `check` is a fully-resolved entry: { num, name, status, detail, hint }.
function checkCard(check) {
  const status = STATUS[check.status] ? check.status : 'skip';
  const hintHtml = check.hint && (status === 'warn' || status === 'fail')
    ? `<div class="check-hint">→ ${escHtml(check.hint)}</div>`
    : '';
  return `
    <div class="check ${status}">
      <div class="check-header">
        ${badge(status)}
        <span class="check-num">#${check.num}</span>
        <span class="check-name">${escHtml(check.name)}</span>
      </div>
      ${detailHtml(check.detail)}
      ${hintHtml}
    </div>`;
}

function sectionScore(checks) {
  const sc = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const check of checks) {
    const status = STATUS[check.status] ? check.status : 'skip';
    sc[status]++;
  }
  return sc;
}

function sectionHtml(title, checks) {
  const sc = sectionScore(checks);
  const cards = checks.map(checkCard).join('');
  const pills = STATUS_ORDER.map(s => pill(s, sc[s])).join('');
  return `
  <details class="section" open>
    <summary class="section-title">
      <span class="orange-dot"></span>
      <span class="section-title-text">${escHtml(title)}</span>
      <span class="section-pills">${pills}</span>
      <span class="section-chevron">&#8250;</span>
    </summary>
    <div class="section-body">${cards}
    </div>
  </details>`;
}

// Report-specific CSS layered on top of brand.js's baseCss() shared shell.
function reportCss() {
  return `
.score-item strong.score-green { color: ${C.green_dark}; }
.score-item strong.score-pink { color: ${C.pink_dark}; }
.check-detail { font-size: 13px; color: ${C.text_body}; margin-top: 2px; white-space: pre-wrap; }
.check { border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; border: 1px solid; }
.check.pass { background: ${STATUS.pass.bg}; border-color: ${STATUS.pass.border}; }
.check.warn { background: ${STATUS.warn.bg}; border-color: ${STATUS.warn.border}; }
.check.fail { background: ${STATUS.fail.bg}; border-color: ${STATUS.fail.border}; }
.check.skip { background: ${STATUS.skip.bg}; border-color: ${STATUS.skip.border}; }
.check-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.check-num { font-family: ${FONT_DISPLAY}; font-size: 11px; font-weight: 600; color: ${C.grey_medium}; }
.check-name { font-family: ${FONT_DISPLAY}; font-size: 13px; font-weight: 600; color: ${C.navy}; }
.check-hint { margin-top: 6px; font-size: 12.5px; color: ${C.orange_dark}; font-family: ${FONT_BODY}; }
.field-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12.5px; font-family: ${FONT_BODY}; }
.field-table td, .field-table th { padding: 5px 8px; border-bottom: 1px solid ${C.border_neutral}; vertical-align: top; text-align: left; }
.field-table th { font-family: ${FONT_DISPLAY}; font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${C.grey_medium}; }
.field-table tr:last-child td { border-bottom: none; }
.field-table .field-label { font-weight: 600; color: ${C.text_body}; white-space: nowrap; width: 1%; }
.field-table .field-missing { color: ${C.grey_medium}; font-style: italic; }
.field-table.multi-col th, .field-table.multi-col td { white-space: normal; }

@media print {
  .check { break-inside: avoid; page-break-inside: avoid; }
}
`;
}

// sections: [{ title, checks: [{ num, name, status, detail, hint }] }], in
// display order — built by onboarding-audit.js from ONBOARDING_CHECK_DEFS
// grouped by `section`, each entry resolved with its check's result.
// scopeMeta: { businesses: string[]|null, businessNames: Map<string,string> }
function buildOnboardingReport(sections, scopeMeta) {
  const businessNameFor = (id) => {
    const m = scopeMeta && scopeMeta.businessNames;
    if (!m) return '';
    if (typeof m.get === 'function') return m.get(String(id)) || '';
    return m[String(id)] || '';
  };
  const formatBusiness = (id) => {
    const name = businessNameFor(id);
    return name ? `${id} (${escHtml(name)})` : String(id);
  };
  const bizScope = scopeMeta && scopeMeta.businesses && scopeMeta.businesses.length > 0
    ? scopeMeta.businesses.map(formatBusiness).join(', ')
    : 'All businesses';
  const footerScope = scopeMeta && scopeMeta.businesses && scopeMeta.businesses.length > 0
    ? scopeMeta.businesses.map(formatBusiness).join(', ')
    : 'all businesses';

  const allChecks = sections.flatMap(s => s.checks);
  const totals = sectionScore(allChecks);
  const graded = totals.pass + totals.warn + totals.fail; // skip excluded from the score
  const scorePct = graded > 0 ? Math.round((totals.pass / graded) * 100) : 0;
  const totalChecks = allChecks.length;

  const scoreBar = `
      <div class="score-item">
        <strong class="orange">${scorePct}%</strong>
        Overall score
      </div>
      <div class="score-divider"></div>
      <div class="score-item">
        <strong class="score-green">${totals.pass}</strong>
        Passed
      </div>
      <div class="score-divider"></div>
      <div class="score-item">
        <strong class="orange">${totals.warn}</strong>
        Warnings
      </div>
      <div class="score-divider"></div>
      <div class="score-item">
        <strong class="score-pink">${totals.fail}</strong>
        Failed
      </div>
      <div class="score-divider"></div>
      <div class="score-item">
        <strong>${totalChecks}</strong>
        Total checks
      </div>`;

  const sectionsHtml = sections.map(s => sectionHtml(s.title, s.checks)).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nexudus Onboarding Check-in Audit: ${escHtml(TODAY_STR)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<style>
${baseCss()}
${reportCss()}
</style>
</head>
<body>
<div class="page">

  <header>
    <div class="wordmark">nexudus</div>
    <div class="header-text">
      <div class="label">Onboarding Check-in Audit</div>
      <h1>${bizScope}</h1>
      <div class="meta">Generated ${escHtml(TODAY_STR)}</div>
    </div>
  </header>

  <div class="accent-bar"></div>

  <div class="score-bar">
    ${scoreBar}
  </div>

  <div class="body">
    ${sectionsHtml}
  </div>

  <footer>
    <span>Nexudus Onboarding Check-in Audit · ${escHtml(TODAY_STR)} · Confidential — for admins of ${footerScope}</span>
    <span class="watermark">Powered by Nexudus</span>
  </footer>

</div>
<script>
// All <details> default open; force any the reader collapsed back open for
// Ctrl+P so the printed PDF always contains the full report.
window.addEventListener('beforeprint', function () {
  document.querySelectorAll('details').forEach(function (d) { d.open = true; });
});
</script>
</body>
</html>
`;
}

module.exports = { buildOnboardingReport };
