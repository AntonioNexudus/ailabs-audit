// Nexudus brand reference — single source of truth for all audit report
// styling. Mirrors the official brand file (samaudittoollocal/brand.py).
//
// Fonts:  Parkinsans (headings/labels) · Poppins (body/captions)
// Hero:   Orange #FE4D00 — must appear in every design
// Core:   Navy #212C6A · Blue #5757F4 · Green #28B95F · Pink #FF4F95
//
// Both report builders (report-html.js and the onboarding report) import from
// here so a rebrand is a one-file edit. Zero dependencies.

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

const C = {
  // Hero
  orange: '#FE4D00',
  orange_pale: '#FFF2EC',
  orange_light: '#FFDACC',
  orange_medium: '#FF6E2F',
  orange_dark: '#723031',

  // Core — Navy
  navy: '#212C6A',

  // Core — Blue
  blue: '#5757F4',
  blue_pale: '#F1F4FF',
  blue_light: '#C5CCFF',
  blue_medium: '#8694FF',

  // Core — Green (used for PASS)
  green: '#28B95F',
  green_pale: '#E0FFF0',
  green_light: '#9AE9B8',
  green_medium: '#70CF94',
  green_dark: '#00703E',

  // Core — Pink (used for FAIL / HIGH severity)
  pink: '#FF4F95',
  pink_pale: '#FFF0F5',
  pink_light: '#FFCCDF',
  pink_medium: '#FF84B5',
  pink_dark: '#6D1A3B',

  // Neutrals
  white: '#FDFDFD',
  bg: '#F8F8F8',
  bg_warm: '#F6F4EE',
  border_warm: '#D6D4CE',
  border_neutral: '#ECECEC',
  border_cool: '#CBCDD2',
  grey_medium: '#98989F',
  text_body: '#535060',
  bg_blue_tint: '#EEF6FF',
  black: '#151515',
};

// ---------------------------------------------------------------------------
// Typography — Google Fonts with system fallbacks so the report still reads
// well offline (the fonts <link> is the report's only external reference).
// ---------------------------------------------------------------------------

const FONT_DISPLAY = "Parkinsans, 'Segoe UI', system-ui, -apple-system, sans-serif";
const FONT_BODY = "Poppins, 'Segoe UI', system-ui, -apple-system, Helvetica, Arial, sans-serif";

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  'family=Parkinsans:wght@400;500;600' +
  '&family=Poppins:wght@400;500;600' +
  '&display=swap';

// ---------------------------------------------------------------------------
// Severity colour mapping (account-health audit).
//   HIGH    → Pink        MEDIUM → Hero orange   LOW → Blue
//   INSIGHT → Neutral grey
//   PASS    → Green (used for zero-count pills, never as a finding family)
// Each entry: { badge (solid, white text), bg (card), border (card), text }.
// MEDIUM sharing the hero orange matches the brand's own STATUS.warn.
// ---------------------------------------------------------------------------

const SEVERITY_COLORS = {
  HIGH: { badge: C.pink, bg: C.pink_pale, border: C.pink_light, text: C.pink_dark },
  MEDIUM: { badge: C.orange, bg: C.orange_pale, border: C.orange_light, text: C.orange_dark },
  LOW: { badge: C.blue, bg: C.blue_pale, border: C.blue_light, text: C.navy },
  INSIGHT: { badge: C.grey_medium, bg: C.bg, border: C.border_neutral, text: C.text_body },
  PASS: { badge: C.green, bg: C.green_pale, border: C.green_light, text: C.green_dark },
};

// ---------------------------------------------------------------------------
// Status colour mapping (onboarding check-in report).
//   pass → Green · warn → Orange · fail → Pink (darkened text) · skip → Grey
// ---------------------------------------------------------------------------

const STATUS = {
  pass: { badge: C.green, bg: C.green_pale, border: C.green_light, text: C.green_dark },
  warn: { badge: C.orange, bg: C.orange_pale, border: C.orange_light, text: C.orange_dark },
  fail: { badge: C.pink, bg: C.pink_pale, border: C.pink_light, text: C.pink_dark },
  skip: { badge: C.grey_medium, bg: C.bg, border: C.border_neutral, text: C.grey_medium },
};

// ---------------------------------------------------------------------------
// Shared template CSS — the branded report shell every audit report uses:
// page card, navy header (+ text wordmark & kicker label), orange accent bar,
// score bar, collapsible <details> sections, badges, pill counters, summary
// table, footer + watermark, and print flattening.
// Report-specific rules (data tables, finding families, …) live with each
// report builder and are appended after this.
// ---------------------------------------------------------------------------

function baseCss() {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: ${FONT_BODY};
  background: ${C.bg};
  color: ${C.text_body};
  font-size: 14px;
  line-height: 1.5;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Page wrapper ── */
.page {
  max-width: 960px;
  margin: 48px auto;
  background: ${C.white};
  border-radius: 24px;
  box-shadow: 0 4px 24px rgba(33,44,106,0.10);
  overflow: hidden;
}

/* ── Header ── */
header {
  background: ${C.navy};
  color: ${C.white};
  padding: 32px 48px 28px;
  display: flex;
  align-items: center;
  gap: 32px;
}
header img { height: 32px; width: auto; flex-shrink: 0; }
/* Text wordmark placeholder — swap for an <img> data URI when a logo lands. */
header .wordmark {
  font-family: ${FONT_DISPLAY};
  font-size: 28px;
  font-weight: 600;
  color: ${C.white};
  letter-spacing: -0.01em;
  line-height: 1;
  flex-shrink: 0;
}
header .header-text .label {
  font-family: ${FONT_DISPLAY};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${C.blue_light};
  margin-bottom: 6px;
}
header h1 {
  font-family: ${FONT_DISPLAY};
  font-size: 22px;
  font-weight: 600;
  color: ${C.white};
  line-height: 1.29;
}
header .meta {
  margin-top: 6px;
  font-size: 13px;
  color: ${C.blue_light};
  font-family: ${FONT_BODY};
}

/* ── Orange accent bar ── */
.accent-bar {
  height: 4px;
  background: ${C.orange};
}

/* ── Score bar ── */
.score-bar {
  background: ${C.blue_pale};
  border-bottom: 1px solid ${C.blue_light};
  padding: 20px 48px;
  display: flex;
  gap: 36px;
  align-items: center;
  flex-wrap: wrap;
}
.score-item {
  font-family: ${FONT_BODY};
  font-size: 13px;
  color: ${C.text_body};
}
.score-item strong {
  display: block;
  font-family: ${FONT_DISPLAY};
  font-size: 26px;
  font-weight: 600;
  color: ${C.navy};
  line-height: 1.1;
}
.score-item strong.orange { color: ${C.orange}; }
.score-divider {
  width: 1px;
  height: 36px;
  background: ${C.blue_light};
}

/* ── Body ── */
.body { padding: 40px 48px 56px; }

/* ── Section dropdowns ── */
details.section {
  margin-bottom: 12px;
  border: 1px solid ${C.border_neutral};
  border-radius: 12px;
  overflow: hidden;
}
details.section > summary { list-style: none; }
details.section > summary::-webkit-details-marker { display: none; }

.section-title {
  font-family: ${FONT_DISPLAY};
  font-size: 15px;
  font-weight: 600;
  color: ${C.navy};
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  background: ${C.white};
  transition: background 0.15s;
}
.section-title:hover { background: ${C.bg}; }
.section-title .orange-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: ${C.orange};
  flex-shrink: 0;
}
.section-title-text { flex: 1; }
.section-pills { display: flex; gap: 5px; }
.section-chevron {
  font-size: 18px;
  color: ${C.grey_medium};
  transition: transform 0.2s;
  line-height: 1;
}
details.section[open] > summary .section-chevron { transform: rotate(90deg); }
.section-body {
  padding: 4px 14px 14px;
  background: ${C.bg};
  border-top: 1px solid ${C.border_neutral};
}

/* ── Badges (solid, white text) ── */
.badge {
  font-family: ${FONT_DISPLAY};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 6px;
  color: ${C.white};
  flex-shrink: 0;
}
.badge.pass { background: ${STATUS.pass.badge}; }
.badge.warn { background: ${STATUS.warn.badge}; }
.badge.fail { background: ${STATUS.fail.badge}; }
.badge.skip { background: ${STATUS.skip.badge}; }

/* ── Mini pills (counters) ── */
.pill {
  display: inline-block;
  font-family: ${FONT_DISPLAY};
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  color: ${C.white};
}
.pill.pass { background: ${STATUS.pass.badge}; }
.pill.warn { background: ${STATUS.warn.badge}; }
.pill.fail { background: ${STATUS.fail.badge}; }
.pill.skip { background: ${STATUS.skip.badge}; }

/* ── Summary table ── */
.summary-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 40px;
  font-size: 13px;
  font-family: ${FONT_BODY};
}
.summary-table th {
  font-family: ${FONT_DISPLAY};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: ${C.grey_medium};
  border-bottom: 2px solid ${C.border_neutral};
  padding: 8px 12px;
  text-align: left;
}
.summary-table td {
  padding: 11px 12px;
  border-bottom: 1px solid ${C.border_neutral};
  vertical-align: middle;
  color: ${C.text_body};
}
.summary-table tr:last-child td { border-bottom: none; }
.summary-table .sname {
  font-family: ${FONT_DISPLAY};
  font-weight: 600;
  color: ${C.navy};
}
.summary-table .pill-group { display: flex; gap: 6px; flex-wrap: wrap; }

/* ── Footer ── */
footer {
  border-top: 1px solid ${C.border_neutral};
  padding: 18px 48px;
  font-family: ${FONT_BODY};
  font-size: 12px;
  color: ${C.grey_medium};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}
footer .watermark {
  font-family: ${FONT_DISPLAY};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${C.border_cool};
  white-space: nowrap;
}

/* ── Print flattening ── */
@media print {
  body { background: ${C.white}; }
  .page { margin: 0; border-radius: 0; box-shadow: none; max-width: 100%; }
  .section-title:hover { background: ${C.white}; }
  .section-chevron { display: none; }
}
`;
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

// Embeds logo.png (repo root) as a base64 data URI so the report stays a
// single self-contained file. Mirrors samaudittoollocal/brand.py's
// logo_data_uri(). Returns '' if the file is missing, so report-html.js /
// onboarding-report.js fall back to the text wordmark (Logo.png is optional —
// forks/clones without one still render correctly).
function logoDataUri() {
  const logoPath = path.join(__dirname, '..', '..', 'logo.png');
  try {
    return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
  } catch {
    return '';
  }
}

module.exports = { C, FONT_DISPLAY, FONT_BODY, GOOGLE_FONTS_URL, SEVERITY_COLORS, STATUS, baseCss, logoDataUri };
