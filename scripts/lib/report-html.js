const { TODAY, TODAY_STR } = require('./config');
const { escHtml, classifyError, ERROR_HINTS } = require('./util');
const { CHECK_DEFS, REMEDIATIONS } = require('./check-defs');
const { C, FONT_DISPLAY, FONT_BODY, GOOGLE_FONTS_URL, SEVERITY_COLORS, baseCss, logoDataUri } = require('./brand');

// ---------------------------------------------------------------------------
// Branded HTML report — Nexudus-branded operator deliverable.
//
// All brand values (palette, fonts, severity colours, shared template CSS)
// live in ./brand.js — the single source of truth mirroring the official
// Nexudus brand reference. Only report-specific structure lives here.
// ---------------------------------------------------------------------------

// CSS class suffix per severity ("sev-high", …), generated from brand data so
// the two never drift.
const sevClass = (sev) => `sev-${String(sev).toLowerCase()}`;

// Human-friendly badge labels, matching the onboarding report (title case
// reads warmer than shouting caps).
const SEVERITY_LABEL = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INSIGHT: 'Insight' };

// Severity-family CSS (badges, pills, finding cards) generated from
// SEVERITY_COLORS so a palette change in brand.js restyles everything.
// Card titles/numbers stay navy/grey (see reportCss) like the onboarding
// report's check cards; the family only tints backgrounds and borders.
function severityFamilyCss() {
  return Object.entries(SEVERITY_COLORS).map(([sev, c]) => {
    const k = sevClass(sev);
    return `
.badge.${k} { background: ${c.badge}; }
.pill.${k} { background: ${c.badge}; }
details.finding.${k} { background: ${c.bg}; border-color: ${c.border}; }`;
  }).join('\n');
}

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
  // Escape the id too: bizScope/footerScope land in the page unescaped, so
  // every character of them must already be safe.
  const formatBusiness = (id) => {
    const name = businessNameFor(id);
    return name ? `${escHtml(String(id))} (${escHtml(name)})` : escHtml(String(id));
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

  // ---------- issue tallies (score bar + section pills) ----------
  const sevCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  let totalIssues = 0;
  for (const def of severityDefs) {
    const r = results[def.key];
    if (r && r.status !== 'ERROR') {
      totalIssues += r.items.length;
      sevCounts[def.severity] = (sevCounts[def.severity] || 0) + r.items.length;
    }
  }
  let insightCount = 0;
  for (const def of insightDefs) {
    const r = results[def.key];
    if (r && r.status !== 'ERROR') insightCount += r.items.length;
  }

  // ---------- helpers (local scope) ----------
  const severityBadge = (sev) =>
    `<span class="badge ${sevClass(SEVERITY_COLORS[sev] ? sev : 'INSIGHT')}">${escHtml(SEVERITY_LABEL[sev] || sev)}</span>`;

  // Count pill: severity-coloured when > 0, green when 0, grey for —/ERROR.
  const countPill = (count, sev) => {
    if (typeof count !== 'number') return `<span class="pill pill-na">${escHtml(String(count))}</span>`;
    if (count === 0) return `<span class="pill ${sevClass('PASS')}">0</span>`;
    return `<span class="pill ${sevClass(SEVERITY_COLORS[sev] ? sev : 'INSIGHT')}">${count}</span>`;
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
    const count = !r ? '—' : r.status === 'ERROR' ? 'Error' : r.items.length;
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
        <td class="count">${countPill(count, sev)}</td>
      </tr>`;
  }).join('');

  // ---------- finding cards (severity, then insights) ----------
  const renderFindingCards = (defs) => defs.map((def) => {
    const r = results[def.key];
    if (!r) return '';
    const sev = def.section === 'insights' ? 'INSIGHT' : def.severity;
    const family = sevClass(SEVERITY_COLORS[sev] ? sev : 'INSIGHT');

    if (r.status === 'ERROR') {
      // Errored checks render in the pink (fail) family regardless of severity
      // so a broken check never hides behind a calm colour.
      const cls = r.errorClass || classifyError({ message: r.error });
      const hint = ERROR_HINTS[cls] || ERROR_HINTS.unknown;
      return `
      <details class="finding ${sevClass('HIGH')}" id="check-${def.num}" open>
        <summary class="finding-summary">
          ${severityBadge(sev)}
          <span class="finding-num">#${def.num}</span>
          <h2 class="finding-title">${escHtml(def.heading)}</h2>
          <span class="pill pill-na">Error</span>
          <span class="section-chevron">›</span>
        </summary>
        <div class="finding-body">
          <p class="finding-error"><span class="error-class-tag">[${escHtml(cls)}]</span> Could not run this check: ${escHtml(r.error || 'unknown error')}</p>
          <p class="finding-error-hint"><strong>Hint:</strong> ${escHtml(hint)}</p>
        </div>
      </details>`;
    }
    if (r.items.length === 0) return ''; // no empty cards in findings

    return `
      <details class="finding ${family}" id="check-${def.num}" open>
        <summary class="finding-summary">
          ${severityBadge(sev)}
          <span class="finding-num">#${def.num}</span>
          <h2 class="finding-title">${escHtml(def.heading)}</h2>
          ${countPill(r.items.length, sev)}
          <span class="section-chevron">›</span>
        </summary>
        <div class="finding-body">
          <p class="finding-desc">${escHtml(def.description(r.items.length))}</p>
          ${renderRemediation(def)}
          ${renderTable(def, r.items)}
        </div>
      </details>`;
  }).join('\n');

  const severityCards = renderFindingCards(severityDefs);
  const insightCards = renderFindingCards(insightDefs);

  // Collapsible section shells (samaudit-style): orange dot + title + count
  // pills + rotating chevron. A section with nothing to show is skipped.
  const sectionShell = (title, pillsHtml, innerHtml) => `
    <details class="section" open>
      <summary>
        <div class="section-title">
          <span class="orange-dot"></span>
          <span class="section-title-text">${escHtml(title)}</span>
          <span class="section-pills">${pillsHtml}</span>
          <span class="section-chevron">›</span>
        </div>
      </summary>
      <div class="section-body">
        ${innerHtml}
      </div>
    </details>`;

  const findingsPills = ['HIGH', 'MEDIUM', 'LOW']
    .filter((sev) => sevCounts[sev] > 0)
    .map((sev) => `<span class="pill ${sevClass(sev)}">${sevCounts[sev]}</span>`)
    .join('');
  const insightsPills = insightCount > 0
    ? `<span class="pill ${sevClass('INSIGHT')}">${insightCount}</span>`
    : '';

  const findingsSection = severityCards.trim()
    ? sectionShell('Findings', findingsPills, severityCards)
    : '';
  const insightsSection = insightCards.trim()
    ? sectionShell('Insights', insightsPills, insightCards)
    : '';

  // ---------- score bar ----------
  // Class-based stat colours matching the onboarding report's score bar:
  // hero orange for the headline stat (shared by Medium, as onboarding shares
  // it with Warnings), dark pink for High, navy default for checks run.
  // Insights appear only when insight checks ran.
  const scoreItem = (value, label, cls) =>
    `<div class="score-item"><strong${cls ? ` class="${cls}"` : ''}>${escHtml(String(value))}</strong>${escHtml(label)}</div>`;
  const scoreDivider = '<div class="score-divider"></div>';
  const scoreItems = [
    scoreItem(totalIssues, 'Total issues', 'orange'),
    scoreItem(sevCounts.HIGH, 'High', 'score-pink'),
    scoreItem(sevCounts.MEDIUM, 'Medium', 'orange'),
    scoreItem(sevCounts.LOW, 'Low', 'score-blue'),
  ];
  if (insightDefs.length > 0) scoreItems.push(scoreItem(insightCount, 'Insights', 'score-grey'));
  scoreItems.push(scoreItem(`${checksRanCount} of ${CHECK_DEFS.length}`, 'Checks run'));
  const scoreBar = scoreItems.join(scoreDivider);

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
  // Real logo if logo.png exists at the repo root, else the text wordmark.
  const logoSrc = logoDataUri();
  const headerLogo = logoSrc
    ? `<img src="${logoSrc}" alt="Nexudus">`
    : '<div class="wordmark">nexudus</div>';

  // Report-specific CSS layered on top of the shared brand shell.
  const reportCss = `
${severityFamilyCss()}

.pill.pill-na { background: ${C.grey_medium}; }

/* Badges read as title case here (High/Medium/Low/Insight) to match the
   onboarding report, so undo the shared shell's uppercasing and tighten the
   wide tracking it pairs with. */
.badge { text-transform: none; letter-spacing: 0.02em; }

/* Score-bar stat colours — same treatment as the onboarding report. */
.score-item strong.score-pink { color: ${C.pink_dark}; }
.score-item strong.score-blue { color: ${C.blue}; }
.score-item strong.score-grey { color: ${C.grey_medium}; }

/* ── Scope strip ── */
.scope {
  padding: 14px 48px;
  border-bottom: 1px solid ${C.border_neutral};
  display: flex;
  flex-wrap: wrap;
  gap: 8px 48px;
  font-size: 13px;
}
.scope .label {
  font-family: ${FONT_DISPLAY};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: ${C.grey_medium};
}
.scope .value { color: ${C.text_body}; margin-top: 1px; }

/* ── Executive summary ── */
.exec-title {
  font-family: ${FONT_DISPLAY};
  font-size: 15px;
  font-weight: 600;
  color: ${C.navy};
  margin-bottom: 12px;
}
.summary-table td.num {
  width: 40px;
  font-variant-numeric: tabular-nums;
  color: ${C.grey_medium};
}
.summary-table td.count { width: 80px; text-align: right; }
.summary-link { color: inherit; text-decoration: none; border-bottom: 1px dotted ${C.grey_medium}; }
.summary-link:hover { color: ${C.navy}; }

/* ── Finding cards (collapsible, severity-family colours) ── */
details.finding {
  border: 1px solid;
  border-radius: 12px;
  margin-top: 10px;
  overflow: hidden;
}
details.finding > summary { list-style: none; }
details.finding > summary::-webkit-details-marker { display: none; }
.finding-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}
details.finding[open] > summary .section-chevron { transform: rotate(90deg); }
/* Navy titles + grey numbers on every card, like the onboarding report's
   check cards — the tinted card and badge already carry the severity. */
.finding-num {
  font-family: ${FONT_DISPLAY};
  font-weight: 600;
  font-size: 13px;
  color: ${C.grey_medium};
}
.finding-title {
  font-family: ${FONT_DISPLAY};
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  line-height: 1.3;
  color: ${C.navy};
}
.finding-body { padding: 0 16px 14px; }
.finding-desc {
  margin: 2px 0 10px;
  font-size: 13px;
  color: ${C.text_body};
}

/* Errored checks (pink family) */
.finding-error {
  color: ${C.pink_dark};
  background: ${C.white};
  border: 1px solid ${C.pink_light};
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin: 4px 0 0;
}
.finding-error-hint {
  color: ${C.text_body};
  background: ${C.white};
  border: 1px dashed ${C.border_cool};
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin: 6px 0 0;
}
.error-class-tag {
  display: inline-block;
  font-family: ${FONT_BODY};
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: lowercase;
  padding: 1px 8px;
  border-radius: 20px;
  background: ${C.pink};
  color: ${C.white};
  margin-right: 6px;
}

/* ── Recommended-action card (orange accents) ── */
.remediation {
  background: ${C.white};
  border: 1px solid ${C.border_neutral};
  border-left: 3px solid ${C.orange};
  border-radius: 8px;
  padding: 12px 14px;
  margin: 10px 0 14px;
}
.rem-title {
  font-family: ${FONT_DISPLAY};
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  color: ${C.orange};
  margin-bottom: 4px;
}
.rem-steps { margin: 0; font-size: 13px; line-height: 1.55; color: ${C.text_body}; }
.rem-link {
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
  color: ${C.blue};
  text-decoration: none;
  font-weight: 500;
}
.rem-link:hover { text-decoration: underline; }

/* ── Scrollable data tables (sticky headers) ── */
.data-table-scroll {
  max-height: 400px;
  overflow-y: auto;
  margin-top: 6px;
  border: 1px solid ${C.border_neutral};
  border-radius: 8px;
  background: ${C.white};
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  background: ${C.white};
  font-size: 12.5px;
  font-family: ${FONT_BODY};
}
.data-table th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: ${C.bg};
  font-family: ${FONT_DISPLAY};
  font-weight: 600;
  text-align: left;
  padding: 8px 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${C.grey_medium};
  border-bottom: 1px solid ${C.border_neutral};
}
.data-table td {
  padding: 8px 10px;
  border-bottom: 1px solid ${C.border_neutral};
  vertical-align: top;
  word-break: break-word;
  color: ${C.text_body};
}
.data-table tbody tr:last-child td { border-bottom: none; }

/* ── Print — Ctrl+P → Save as PDF should look like a real document ── */
@media print {
  body { font-size: 11pt; }
  .summary-link { border-bottom: none; }
  details.finding { break-inside: avoid; page-break-inside: avoid; }
  .finding-summary { cursor: default; }
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
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nexudus Account Health Audit: ${escHtml(TODAY_STR)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<style>
${baseCss()}
${reportCss}
</style>
</head>
<body>
<div class="page">

  <header>
    ${headerLogo}
    <div class="header-text">
      <div class="label">Account Health Audit</div>
      <h1>${bizScope}</h1>
      <div class="meta">Generated ${escHtml(generatedHuman)}</div>
    </div>
  </header>

  <div class="accent-bar"></div>

  <div class="score-bar">
    ${scoreBar}
  </div>

  <div class="scope">
    <div>
      <div class="label">Scope</div>
      <div class="value">${bizScope}</div>
    </div>
    <div>
      <div class="label">Depth</div>
      <div class="value">${escHtml(depthLabel)}</div>
    </div>
    ${coworkerStats ? `
    <div>
      <div class="label">Coworkers</div>
      <div class="value">${escHtml(String(coworkerStats.total))} total · ${escHtml(String(coworkerStats.members))} Members · ${escHtml(String(coworkerStats.contacts))} Contacts</div>
    </div>` : ''}
  </div>

  <div class="body">

    <h2 class="exec-title">Executive summary</h2>
    <table class="summary-table">
      <thead>
        <tr><th>#</th><th>Check</th><th>Severity</th><th style="text-align:right">Issues</th></tr>
      </thead>
      <tbody>${summaryRows}</tbody>
    </table>

    ${findingsSection}
    ${insightsSection}

  </div>

  <footer>
    <span>Nexudus Account Health Audit · ${escHtml(TODAY_STR)} · Confidential — for admins of ${footerScope}</span>
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

module.exports = { buildHtmlReport };
