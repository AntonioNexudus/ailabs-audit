// The dashboard's single HTML document. Purely presentational: a branded shell
// (reusing brand.js's baseCss + logo) plus empty containers that ui-client.js
// fills in at runtime from the JSON API. No data, no CLI, no state here — this
// is a pure string builder so it stays trivially testable and additive.
//
// The <style> is brand.js's shared report CSS (so the dashboard looks like the
// same product as the branded reports) followed by ~dashboard-only rules that
// interpolate the same C.* palette. Everything is self-contained except the
// Google Fonts <link>, exactly as the report builders do it.

const { C, FONT_DISPLAY, FONT_BODY, GOOGLE_FONTS_URL, baseCss, logoDataUri } = require('./brand');

// Dashboard-specific CSS layered on top of the shared brand shell. Kept in one
// template string so a palette change in brand.js restyles it too.
function dashboardCss() {
  return `
/* ── Dashboard layout ── */
.body { padding: 32px 48px 48px; }
.dash-card {
  border: 1px solid ${C.border_neutral};
  border-radius: 16px;
  padding: 22px 24px;
  margin-bottom: 20px;
  background: ${C.white};
}
.dash-card > h2 {
  font-family: ${FONT_DISPLAY};
  font-size: 16px;
  font-weight: 600;
  color: ${C.navy};
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 9px;
}
.dash-card > h2 .orange-dot {
  width: 8px; height: 8px; border-radius: 50%; background: ${C.orange}; flex-shrink: 0;
}
.dash-card .card-sub {
  font-size: 12.5px;
  color: ${C.grey_medium};
  margin-bottom: 16px;
}
.muted { color: ${C.grey_medium}; }
.hidden { display: none !important; }

/* ── Buttons ── */
button {
  font-family: ${FONT_DISPLAY};
  font-size: 13px;
  font-weight: 600;
  border: 1px solid ${C.border_cool};
  background: ${C.white};
  color: ${C.navy};
  padding: 9px 16px;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}
button:hover { background: ${C.bg}; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.primary {
  background: ${C.orange};
  border-color: ${C.orange};
  color: ${C.white};
  padding: 11px 26px;
  font-size: 14px;
}
button.primary:hover { background: ${C.orange_medium}; }
button.primary:disabled { background: ${C.orange_light}; border-color: ${C.orange_light}; }
button.ghost { padding: 7px 13px; font-size: 12px; }
button.danger { border-color: ${C.pink_light}; color: ${C.pink_dark}; }
button.danger:hover { background: ${C.pink_pale}; }

/* ── Setup strip ── */
.setup-strip { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.setup-pills { display: flex; gap: 10px; flex-wrap: wrap; flex: 1; }
.setup-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ${FONT_BODY};
  font-size: 12.5px;
  font-weight: 500;
  padding: 7px 13px;
  border-radius: 20px;
  border: 1px solid ${C.border_neutral};
  background: ${C.bg};
  color: ${C.text_body};
}
.setup-pill .dot { width: 9px; height: 9px; border-radius: 50%; background: ${C.grey_medium}; flex-shrink: 0; }
.setup-pill.ok { background: ${C.green_pale}; border-color: ${C.green_light}; color: ${C.green_dark}; }
.setup-pill.ok .dot { background: ${C.green}; }
.setup-pill.bad { background: ${C.pink_pale}; border-color: ${C.pink_light}; color: ${C.pink_dark}; }
.setup-pill.bad .dot { background: ${C.pink}; }
.setup-pill.amber { background: ${C.orange_pale}; border-color: ${C.orange_light}; color: ${C.orange_dark}; }
.setup-pill.amber .dot { background: ${C.orange}; }
.setup-pill small { font-weight: 400; opacity: 0.85; }

/* ── Segmented toggle (audit type) ── */
.field { margin-bottom: 20px; }
.field > label.field-label {
  display: block;
  font-family: ${FONT_DISPLAY};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${C.grey_medium};
  margin-bottom: 9px;
}
.segmented { display: inline-flex; border: 1px solid ${C.border_cool}; border-radius: 10px; overflow: hidden; }
.segmented button {
  border: none;
  border-radius: 0;
  background: ${C.white};
  color: ${C.text_body};
  padding: 9px 20px;
}
.segmented button.active { background: ${C.navy}; color: ${C.white}; }
.segmented button + button { border-left: 1px solid ${C.border_cool}; }

/* ── Business picker ── */
.biz-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.biz-search {
  font-family: ${FONT_BODY};
  font-size: 13px;
  padding: 8px 12px;
  border: 1px solid ${C.border_cool};
  border-radius: 9px;
  min-width: 220px;
  flex: 1;
}
.biz-list {
  border: 1px solid ${C.border_neutral};
  border-radius: 10px;
  max-height: 240px;
  overflow-y: auto;
  background: ${C.bg};
}
.biz-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid ${C.border_neutral};
  font-size: 13px;
  cursor: pointer;
}
.biz-row:last-child { border-bottom: none; }
.biz-row:hover { background: ${C.blue_pale}; }
.biz-row.master { font-weight: 600; color: ${C.navy}; background: ${C.white}; position: sticky; top: 0; z-index: 1; }
.biz-row input { width: 16px; height: 16px; accent-color: ${C.orange}; cursor: pointer; }
.biz-row .biz-id { color: ${C.grey_medium}; font-size: 12px; margin-left: auto; }

/* ── Depth tiers ── */
.tier-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tier-card {
  border: 1.5px solid ${C.border_neutral};
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  background: ${C.white};
}
.tier-card:hover { border-color: ${C.blue_light}; }
.tier-card.active { border-color: ${C.orange}; background: ${C.orange_pale}; }
.tier-card .tier-name {
  font-family: ${FONT_DISPLAY};
  font-size: 14px;
  font-weight: 600;
  color: ${C.navy};
}
.tier-card .tier-meta { font-size: 12px; color: ${C.grey_medium}; margin-top: 3px; }
.custom-checks {
  margin-top: 14px;
  border: 1px solid ${C.border_neutral};
  border-radius: 10px;
  padding: 12px 14px;
  background: ${C.bg};
  max-height: 300px;
  overflow-y: auto;
}
.custom-group-title {
  font-family: ${FONT_DISPLAY};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${C.grey_medium};
  margin: 10px 0 6px;
}
.custom-group-title:first-child { margin-top: 0; }
.check-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 4px 0;
  font-size: 12.5px;
  cursor: pointer;
}
.check-row input { margin-top: 2px; width: 15px; height: 15px; accent-color: ${C.orange}; }
.check-row .cnum { color: ${C.grey_medium}; min-width: 22px; }

/* ── Options row ── */
.opt-row { display: flex; align-items: center; gap: 9px; margin-top: 18px; font-size: 13px; }
.opt-row input { width: 16px; height: 16px; accent-color: ${C.orange}; }
.run-row { display: flex; align-items: center; gap: 16px; margin-top: 22px; flex-wrap: wrap; }
.run-error { color: ${C.pink_dark}; font-size: 13px; }

/* ── Progress ── */
.progress-head { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.progress-count { font-family: ${FONT_DISPLAY}; font-size: 14px; font-weight: 600; color: ${C.navy}; }
.bar { flex: 1; min-width: 180px; height: 8px; background: ${C.blue_pale}; border-radius: 6px; overflow: hidden; }
.bar > span { display: block; height: 100%; background: ${C.orange}; width: 0%; transition: width 0.25s; }
.check-list { display: flex; flex-direction: column; gap: 0; margin: 6px 0; }
.check-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid ${C.border_neutral};
  font-size: 13px;
}
.check-item:last-child { border-bottom: none; }
.check-item .ci-num { color: ${C.grey_medium}; min-width: 28px; font-size: 12px; }
.check-item .ci-name { flex: 1; color: ${C.text_body}; }
.check-item .pill { white-space: nowrap; }
.pill.sev-pass { background: ${C.green}; }
.pill.sev-high { background: ${C.pink}; }
.pill.sev-medium { background: ${C.orange}; }
.pill.sev-low { background: ${C.blue}; }
.pill.sev-insight { background: ${C.grey_medium}; }
.pill.st-error { background: ${C.pink_dark}; }

.progress-hint {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 2px 0 6px;
  font-size: 12.5px;
  color: ${C.text_body};
}
.progress-hint .pulse-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: ${C.orange}; flex-shrink: 0;
  animation: dashPulse 1.2s ease-in-out infinite;
}
@keyframes dashPulse { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }

.warnings { margin: 14px 0; display: flex; flex-direction: column; gap: 8px; }
.warn-line {
  font-size: 12.5px;
  padding: 8px 13px;
  border-radius: 9px;
  border: 1px solid ${C.orange_light};
  background: ${C.orange_pale};
  color: ${C.orange_dark};
}
.warn-line.info { border-color: ${C.blue_light}; background: ${C.blue_pale}; color: ${C.navy}; }

.raw-log {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.55;
  background: ${C.black};
  color: #d8d8dc;
  padding: 12px 14px;
  border-radius: 9px;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin-top: 8px;
}
details.log-details > summary {
  cursor: pointer;
  font-size: 12px;
  color: ${C.grey_medium};
  font-family: ${FONT_DISPLAY};
  font-weight: 600;
  list-style: none;
  margin-top: 8px;
}
details.log-details > summary::-webkit-details-marker { display: none; }

.run-summary {
  margin-top: 16px;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid ${C.border_neutral};
  background: ${C.bg};
}
.run-summary.ok { border-color: ${C.green_light}; background: ${C.green_pale}; }
.run-summary.err { border-color: ${C.pink_light}; background: ${C.pink_pale}; }
.run-summary .rs-title { font-family: ${FONT_DISPLAY}; font-weight: 600; color: ${C.navy}; font-size: 14px; }
.run-summary .rs-actions { display: flex; gap: 12px; margin-top: 14px; flex-wrap: wrap; }

/* ── Reports list ── */
.report-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 4px;
  border-bottom: 1px solid ${C.border_neutral};
  font-size: 13px;
}
.report-row:last-child { border-bottom: none; }
.report-row .rr-type {
  font-family: ${FONT_DISPLAY};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 6px;
  color: ${C.white};
  flex-shrink: 0;
}
.report-row .rr-type.account { background: ${C.navy}; }
.report-row .rr-type.onboarding { background: ${C.blue}; }
.report-row .rr-when { flex: 1; color: ${C.text_body}; }
.report-row .rr-size { color: ${C.grey_medium}; font-size: 12px; }
.report-row .rr-actions { display: flex; gap: 8px; }
.report-row a.report-link {
  font-family: ${FONT_DISPLAY};
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  color: ${C.blue};
  border: 1px solid ${C.blue_light};
  padding: 6px 12px;
  border-radius: 8px;
}
.report-row a.report-link:hover { background: ${C.blue_pale}; }

.banner-loading { font-size: 13px; color: ${C.grey_medium}; padding: 8px 0; }

@media (max-width: 640px) {
  .body { padding: 24px 20px 36px; }
  header { padding: 24px 20px; gap: 18px; }
  .dash-card { padding: 18px 16px; }
}
`;
}

// Returns the full HTML document as a string. `meta` is optional and only used
// to stamp the marker/version into the page for debugging; the page itself
// pulls all live data from the JSON API via ui-client.js.
function renderPage(meta) {
  const logoSrc = logoDataUri();
  const headerLogo = logoSrc
    ? `<img src="${logoSrc}" alt="Nexudus">`
    : '<div class="wordmark">nexudus</div>';
  const version = (meta && meta.version != null) ? String(meta.version) : '1';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nexudus Audit Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<style>
${baseCss()}
${dashboardCss()}
</style>
</head>
<body data-app-version="${version}">
  <div class="page">
    <header>
      ${headerLogo}
      <div class="header-text">
        <div class="label">Nexudus Audit</div>
        <h1>Audit Dashboard</h1>
        <div class="meta">Run and review your location health &amp; onboarding audits</div>
      </div>
    </header>
    <div class="accent-bar"></div>
    <div class="body">

      <section class="dash-card setup-strip" id="setup-card">
        <div class="setup-pills" id="setup-pills">
          <span class="setup-pill"><span class="dot"></span>Checking setup…</span>
        </div>
        <button class="ghost" id="setup-recheck">Re-check</button>
      </section>

      <section class="dash-card" id="run-card">
        <h2><span class="orange-dot"></span>Run an audit</h2>
        <div class="card-sub">Pick the audit type, choose which businesses to include, then run.</div>

        <div class="field">
          <label class="field-label">Audit type</label>
          <div class="segmented" id="type-toggle">
            <button data-type="account" class="active">Account Health</button>
            <button data-type="onboarding">Onboarding Check-in</button>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Businesses</label>
          <div class="biz-controls">
            <input class="biz-search" id="biz-search" type="text" placeholder="Filter businesses…" autocomplete="off">
            <button class="ghost" id="biz-refresh">Refresh list</button>
          </div>
          <div class="biz-list" id="biz-list">
            <div class="banner-loading">Loading businesses…</div>
          </div>
        </div>

        <div class="field" id="depth-field">
          <label class="field-label">Audit depth</label>
          <div class="tier-grid" id="tier-grid"></div>
          <div class="custom-checks hidden" id="custom-checks"></div>
        </div>

        <label class="opt-row">
          <input type="checkbox" id="opt-cache">
          <span>Reuse recently fetched data (faster re-runs within the hour)</span>
        </label>

        <div class="run-row">
          <button class="primary" id="run-btn" disabled>Run audit</button>
          <span class="run-error hidden" id="run-error"></span>
        </div>
      </section>

      <section class="dash-card hidden" id="progress-card">
        <h2><span class="orange-dot"></span><span id="progress-title">Running audit…</span></h2>
        <div class="progress-head">
          <span class="progress-count" id="progress-count">Starting…</span>
          <div class="bar"><span id="progress-bar"></span></div>
          <button class="ghost danger" id="cancel-btn">Cancel</button>
        </div>
        <div class="progress-hint hidden" id="progress-hint">
          <span class="pulse-dot"></span>
          <span id="progress-hint-text">Still working — fetching data for the next check. Larger locations can take a few minutes.</span>
        </div>
        <div class="warnings hidden" id="warnings"></div>
        <div class="check-list" id="check-list"></div>
        <div class="run-summary hidden" id="run-summary"></div>
        <details class="log-details">
          <summary>Details (raw log)</summary>
          <div class="raw-log" id="raw-log"></div>
        </details>
      </section>

      <section class="dash-card" id="reports-card">
        <h2><span class="orange-dot"></span>Past reports</h2>
        <div class="card-sub">
          Saved to your Desktop “Nexudus Audit Reports” folder.
          <button class="ghost" id="reports-refresh" style="margin-left:8px;">Refresh</button>
          <button class="ghost" id="open-folder">Show folder</button>
        </div>
        <div id="reports-list"><div class="banner-loading">Loading…</div></div>
      </section>

    </div>
    <footer>
      <span>Nexudus Audit Dashboard — runs locally on this computer</span>
      <span class="watermark">Nexudus</span>
    </footer>
  </div>
  <script src="/client.js"></script>
</body>
</html>`;
}

module.exports = { renderPage, dashboardCss };
