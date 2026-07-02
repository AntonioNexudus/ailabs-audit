const { TODAY, TODAY_STR } = require('./config');
const { escHtml, classifyError, ERROR_HINTS } = require('./util');
const { CHECK_DEFS, REMEDIATIONS } = require('./check-defs');

// ---------------------------------------------------------------------------
// Branded HTML report — Nexudus-branded operator deliverable.
//
// Brand sampled from help.nexudus.com on 2026-05-07: primary #FF5100,
// body font Nunito, heading font Red Hat Display, border-radius 8px.
// To re-sample if Nexudus rebrands, edit BRAND_* constants below.
// ---------------------------------------------------------------------------

const BRAND_PRIMARY = '#FF5100';
const BRAND_PRIMARY_TEXT = '#FFFFFF';
const BRAND_INK = '#1A1A1A';
const BRAND_INK_MUTED = '#5C5C5C';
const BRAND_SURFACE = '#FFFFFF';
const BRAND_SURFACE_ALT = '#F7F7F8';
const BRAND_BORDER = '#E4E4E7';
const BRAND_RADIUS = '8px';
const BRAND_FONT_BODY = "'Nunito', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const BRAND_FONT_HEAD = "'Red Hat Display', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

// Severity palette. Kept distinct from the brand orange so the brand colour
// never reads as a "high severity" signal.
const SEVERITY_COLORS = {
  HIGH: { bg: '#FEE2E2', fg: '#991B1B', bar: '#DC2626' },
  MEDIUM: { bg: '#FEF3C7', fg: '#92400E', bar: '#D97706' },
  LOW: { bg: '#DBEAFE', fg: '#1E40AF', bar: '#2563EB' },
  INSIGHT: { bg: '#E4E4E7', fg: '#3F3F46', bar: '#71717A' },
};

function buildHtmlReport(results, ranDefs, scopeMeta) {
  const defsForReport = Array.isArray(ranDefs) && ranDefs.length > 0 ? ranDefs : CHECK_DEFS;
  const severityDefs = defsForReport.filter((d) => !d.section || d.section === 'severity');
  const insightDefs = defsForReport.filter((d) => d.section === 'insights');

  // Invariant: when a check declares a "Fix" column it must be the last one.
  // The HTML builder omits the CLI fix command by dropping the trailing cell,
  // so a Fix column anywhere else would silently drop the wrong cell. Checked
  // up front so a bad check definition fails before any rendering.
  for (const def of defsForReport) {
    const fixIdx = def.columns.indexOf('Fix');
    if (fixIdx !== -1 && fixIdx !== def.columns.length - 1) {
      throw new Error(`Check #${def.num} (${def.key}) has 'Fix' column at index ${fixIdx}; must be last for HTML/text builders.`);
    }
  }

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
  const depthLabel = scopeMeta ? scopeMeta.level : 'thorough';
  const checksRanCount = scopeMeta ? scopeMeta.checksRun.length : defsForReport.length;
  const coworkerStats = scopeMeta && scopeMeta.coworkerStats;

  let totalIssues = 0;
  for (const def of severityDefs) {
    const r = results[def.key];
    if (r && r.status !== 'ERROR') totalIssues += r.items.length;
  }

  // ---------- helpers (local scope) ----------
  const severityBadge = (sev) => {
    const c = SEVERITY_COLORS[sev] || SEVERITY_COLORS.INSIGHT;
    return `<span class="sev-badge" style="background:${c.bg};color:${c.fg}">${escHtml(sev)}</span>`;
  };

  const renderTable = (def, items) => {
    // Drop the trailing "Fix" column; CLI commands are not for this audience.
    const cols = def.columns.filter((c) => c !== 'Fix');
    const colCount = cols.length;
    const head = cols.map((c) => `<th>${escHtml(c)}</th>`).join('');
    const rows = items.map((item) => {
      const cells = def.row(item).slice(0, colCount).map((c) =>
        // Strip backticks (markdown code markers from def.row); HTML-escape rest.
        escHtml(String(c == null ? '' : c).replace(/`/g, ''))
      );
      return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');
    const table = `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    return `<div class="data-table-scroll">${table}</div>`;
  };

  const renderRemediation = (def) => {
    const rem = REMEDIATIONS[def.key];
    if (!rem || !rem.steps) return '';
    // Only allow http/https URLs into the help link to prevent javascript: or
    // data: URIs sneaking into the operator-facing artefact.
    const safeHelpUrl = rem.helpUrl && /^https?:\/\//i.test(rem.helpUrl) ? rem.helpUrl : null;
    const link = safeHelpUrl
      ? `<a href="${escHtml(safeHelpUrl)}" class="rem-link" target="_blank" rel="noopener">Learn more on Nexudus help →</a>`
      : '';
    return `
      <div class="remediation">
        <div class="rem-title">Recommended action</div>
        <p class="rem-steps">${escHtml(rem.steps)}</p>
        ${link}
      </div>`;
  };

  // ---------- exec-summary table ----------
  const summaryRows = defsForReport.map((def) => {
    const r = results[def.key];
    const count = !r ? '—' : r.status === 'ERROR' ? 'ERROR' : r.items.length;
    const sev = def.section === 'insights' ? 'INSIGHT' : def.severity;
    const anchor = `check-${def.num}`;
    const hasIssues = typeof count === 'number' && count > 0;
    const linkOpen = hasIssues ? `<a href="#${anchor}" class="summary-link">` : '';
    const linkClose = hasIssues ? '</a>' : '';
    return `
      <tr>
        <td class="num">${def.num}</td>
        <td>${linkOpen}${escHtml(def.name)}${linkClose}</td>
        <td>${severityBadge(sev)}</td>
        <td class="count ${hasIssues ? 'has-issues' : ''}">${escHtml(String(count))}</td>
      </tr>`;
  }).join('');

  // ---------- finding sections (severity, then insights) ----------
  const renderFindingSections = (defs) => defs.map((def) => {
    const r = results[def.key];
    if (!r) return '';
    const sev = def.section === 'insights' ? 'INSIGHT' : def.severity;
    const c = SEVERITY_COLORS[sev] || SEVERITY_COLORS.INSIGHT;

    if (r.status === 'ERROR') {
      const cls = r.errorClass || classifyError({ message: r.error });
      const hint = ERROR_HINTS[cls] || ERROR_HINTS.unknown;
      return `
        <section class="finding error" id="check-${def.num}" style="border-left-color:${c.bar}">
          <header class="finding-header">
            <span class="finding-num">#${def.num}</span>
            <h2 class="finding-title">${escHtml(def.heading)}</h2>
            ${severityBadge(sev)}
            <span class="error-class-tag">[${escHtml(cls)}]</span>
          </header>
          <p class="finding-error">Could not run this check: ${escHtml(r.error || 'unknown error')}</p>
          <p class="finding-error-hint"><strong>Hint:</strong> ${escHtml(hint)}</p>
        </section>`;
    }
    if (r.items.length === 0) return ''; // no empty sections in findings

    return `
      <section class="finding" id="check-${def.num}" style="border-left-color:${c.bar}">
        <header class="finding-header">
          <span class="finding-num">#${def.num}</span>
          <h2 class="finding-title">${escHtml(def.heading)}</h2>
          ${severityBadge(sev)}
        </header>
        <p class="finding-desc">${escHtml(def.description(r.items.length))}</p>
        ${renderRemediation(def)}
        ${renderTable(def, r.items)}
      </section>`;
  }).join('\n');

  const severitySections = renderFindingSections(severityDefs);
  const insightSections = renderFindingSections(insightDefs);

  // ---------- assemble document ----------
  // Local time zone of the machine that ran the audit. Operators in different
  // regions see the timestamp in their own clock, not UTC.
  const generatedHuman = TODAY.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const generatedIso = TODAY.toISOString(); // kept for footer machine-readability

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Nexudus Account Health Audit: ${escHtml(TODAY_STR)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&family=Red+Hat+Display:wght@600;700;800&display=swap');

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ${BRAND_FONT_BODY};
  color: ${BRAND_INK};
  background: ${BRAND_SURFACE_ALT};
  font-size: 14px;
  line-height: 1.5;
}
.page {
  max-width: 880px;
  margin: 0 auto;
  background: ${BRAND_SURFACE};
}

/* Header banner — white background, Nexudus-orange text */
.banner {
  background: ${BRAND_SURFACE};
  color: ${BRAND_PRIMARY};
  padding: 28px 40px 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid ${BRAND_BORDER};
}
.banner .wordmark {
  font-family: ${BRAND_FONT_HEAD};
  font-weight: 800;
  font-size: 32px;
  letter-spacing: -0.02em;
  line-height: 1;
  color: ${BRAND_PRIMARY};
}
.banner .doctitle {
  font-family: ${BRAND_FONT_HEAD};
  font-weight: 700;
  font-size: 18px;
  margin-top: 6px;
  color: ${BRAND_PRIMARY};
}
.banner .timestamp {
  font-size: 13px;
  font-weight: 600;
  margin-top: 6px;
  color: ${BRAND_PRIMARY};
  letter-spacing: 0.01em;
}

/* Scope card */
.scope {
  padding: 20px 40px;
  border-bottom: 1px solid ${BRAND_BORDER};
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 32px;
}
.scope .label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${BRAND_INK_MUTED};
  font-weight: 700;
}
.scope .value {
  font-size: 14px;
  color: ${BRAND_INK};
  margin-top: 2px;
}
.scope .total-issues {
  font-family: ${BRAND_FONT_HEAD};
  font-weight: 800;
  font-size: 22px;
  color: ${BRAND_PRIMARY};
}

/* Section headings */
h1, h2, h3 {
  font-family: ${BRAND_FONT_HEAD};
  font-weight: 700;
  color: ${BRAND_INK};
}
.section-title {
  font-family: ${BRAND_FONT_HEAD};
  font-weight: 800;
  font-size: 20px;
  margin: 36px 40px 12px;
  padding-bottom: 6px;
  border-bottom: 2px solid ${BRAND_PRIMARY};
  display: inline-block;
}

/* Executive summary table */
.summary-wrap { padding: 0 40px; }
.summary-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 24px;
}
.summary-table th, .summary-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid ${BRAND_BORDER};
  font-size: 13px;
}
.summary-table th {
  font-family: ${BRAND_FONT_HEAD};
  font-weight: 700;
  background: ${BRAND_SURFACE_ALT};
  color: ${BRAND_INK_MUTED};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px;
}
.summary-table td.num {
  width: 40px;
  font-variant-numeric: tabular-nums;
  color: ${BRAND_INK_MUTED};
}
.summary-table td.count {
  text-align: right;
  width: 70px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.summary-table td.count.has-issues { color: ${BRAND_PRIMARY}; font-weight: 700; }
.summary-link { color: inherit; text-decoration: none; border-bottom: 1px dotted ${BRAND_INK_MUTED}; }

/* Severity badges */
.sev-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: ${BRAND_RADIUS};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Finding sections */
.finding {
  margin: 0 40px 20px;
  padding: 16px 18px 18px;
  border-left: 5px solid ${BRAND_BORDER};
  background: ${BRAND_SURFACE_ALT};
  border-radius: 0 ${BRAND_RADIUS} ${BRAND_RADIUS} 0;
  page-break-inside: avoid;
}
.finding-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.finding-num {
  font-family: ${BRAND_FONT_HEAD};
  font-weight: 700;
  color: ${BRAND_INK_MUTED};
  font-size: 14px;
}
.finding-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  flex: 1;
}
.finding-desc {
  margin: 4px 0 12px;
  color: ${BRAND_INK_MUTED};
  font-size: 13px;
}
.finding-error {
  color: ${SEVERITY_COLORS.HIGH.fg};
  background: ${SEVERITY_COLORS.HIGH.bg};
  padding: 8px 12px;
  border-radius: ${BRAND_RADIUS};
  font-size: 13px;
  margin: 8px 0 0;
}
.finding-error-hint {
  color: ${BRAND_INK_MUTED};
  background: ${BRAND_SURFACE};
  border: 1px dashed ${BRAND_BORDER};
  padding: 8px 12px;
  border-radius: ${BRAND_RADIUS};
  font-size: 13px;
  margin: 6px 0 0;
}
.error-class-tag {
  display: inline-block;
  font-family: ${BRAND_FONT_BODY};
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: lowercase;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${SEVERITY_COLORS.HIGH.bg};
  color: ${SEVERITY_COLORS.HIGH.fg};
  margin-left: 8px;
}

/* Recommended-action card */
.remediation {
  background: ${BRAND_SURFACE};
  border: 1px solid ${BRAND_BORDER};
  border-radius: ${BRAND_RADIUS};
  padding: 12px 14px;
  margin: 10px 0 14px;
}
.rem-title {
  font-family: ${BRAND_FONT_HEAD};
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${BRAND_PRIMARY};
  margin-bottom: 4px;
}
.rem-steps { margin: 0; font-size: 13.5px; line-height: 1.55; }
.rem-link {
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
  color: ${BRAND_PRIMARY};
  text-decoration: none;
  font-weight: 600;
}
.rem-link:hover { text-decoration: underline; }

/* Scrollable table container */
.data-table-scroll {
  max-height: 400px;
  overflow-y: auto;
  margin-top: 6px;
  border: 1px solid ${BRAND_BORDER};
  border-radius: ${BRAND_RADIUS};
}

/* Data tables in findings */
.data-table {
  width: 100%;
  border-collapse: collapse;
  background: ${BRAND_SURFACE};
  font-size: 12.5px;
}
.data-table th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: ${BRAND_SURFACE_ALT};
  font-family: ${BRAND_FONT_HEAD};
  font-weight: 700;
  text-align: left;
  padding: 8px 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${BRAND_INK_MUTED};
  border-bottom: 1px solid ${BRAND_BORDER};
}
.data-table td {
  padding: 8px 10px;
  border-bottom: 1px solid ${BRAND_BORDER};
  vertical-align: top;
  word-break: break-word;
}
.data-table tbody tr:last-child td { border-bottom: none; }

/* Footer */
.footer {
  margin-top: 40px;
  padding: 16px 40px 28px;
  border-top: 1px solid ${BRAND_BORDER};
  font-size: 11px;
  color: ${BRAND_INK_MUTED};
  text-align: center;
}

/* Print styles — Ctrl+P → Save as PDF should look like a real document */
@media print {
  body { background: ${BRAND_SURFACE}; font-size: 11pt; }
  .page { max-width: none; margin: 0; }
  .summary-link { border-bottom: none; }
  .finding { break-inside: avoid; page-break-inside: avoid; }
  .data-table-scroll { max-height: none; overflow-y: visible; }
  .data-table { page-break-inside: auto; }
  .data-table thead { display: table-header-group; }
  .data-table th { position: static; }
  .data-table tr { page-break-inside: avoid; }
  /* Chrome/Edge print-to-PDF adds page numbers via its own dialog and does
     not implement paged-media @bottom rules, so none are authored here. */
  @page {
    size: A4;
    margin: 14mm 12mm 18mm;
  }
}
</style>
</head>
<body>
<div class="page">

  <header class="banner">
    <div class="wordmark">Nexudus</div>
    <div class="doctitle">Account Health Audit</div>
    <div class="timestamp">Generated ${escHtml(generatedHuman)}</div>
  </header>

  <section class="scope">
    <div>
      <div class="label">Scope</div>
      <div class="value">${bizScope}</div>
    </div>
    <div>
      <div class="label">Depth</div>
      <div class="value">${escHtml(depthLabel)} (${escHtml(String(checksRanCount))} of ${escHtml(String(CHECK_DEFS.length))} checks)</div>
    </div>
    ${coworkerStats ? `
    <div>
      <div class="label">Coworkers</div>
      <div class="value">${escHtml(String(coworkerStats.total))} total · ${escHtml(String(coworkerStats.members))} Members · ${escHtml(String(coworkerStats.contacts))} Contacts</div>
    </div>` : ''}
    <div>
      <div class="label">Total issues</div>
      <div class="value total-issues">${escHtml(String(totalIssues))}</div>
    </div>
  </section>

  <h2 class="section-title">Executive summary</h2>
  <div class="summary-wrap">
    <table class="summary-table">
      <thead>
        <tr><th>#</th><th>Check</th><th>Severity</th><th style="text-align:right">Issues</th></tr>
      </thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </div>

  ${severitySections.trim() ? `<h2 class="section-title">Findings</h2>${severitySections}` : ''}
  ${insightSections.trim() ? `<h2 class="section-title">Insights</h2>${insightSections}` : ''}

  <footer class="footer">
    Nexudus Account Health Audit · Generated ${escHtml(generatedIso)}<br>
    Confidential! For Admins of ${footerScope}
  </footer>

</div>
</body>
</html>
`;
}

module.exports = { buildHtmlReport };
