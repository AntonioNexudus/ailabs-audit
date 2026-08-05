// Shared helpers for the onboarding check-in checks. Not a check itself —
// required by the individual checks in this directory. Mirrors the small
// `_names()` truncation helper samaudittoollocal's Python checks use so the
// onboarding checks read the same way as their reference heuristics.

const { safeId, escPipe } = require('../util');

// Joins up to `limit` item names with ", " and an "and N more" suffix.
function names(items, key = 'Name', limit = 3) {
  const list = Array.isArray(items) ? items : [];
  const ns = list.slice(0, limit).map(i => String((i && i[key]) || 'Unnamed')).join(', ');
  const more = list.length > limit ? ` and ${list.length - limit} more` : '';
  return ns + more;
}

// Builds a " | " delimited table (header + rows) for the multi-column detail
// shape onboarding-report.js renders as a <table>. Cell values are escPipe'd
// since they can be live business/plan/member data — an unescaped "|" would
// otherwise be misread as an extra column boundary by onboarding-report.js's
// " | " split.
function table(headers, rows) {
  const esc = (cells) => cells.map(c => escPipe(c)).join(' | ');
  return [esc(headers), ...rows.map(esc)].join('\n');
}

// Builds "Label: value" lines for the 2-column field-table detail shape.
function fields(pairs) {
  return pairs.map(([label, value]) => `${label}: ${value == null || value === '' ? '—' : value}`).join('\n');
}

// Builds the "N booking-policy rule(s) could not be verified" note shared by
// resourcesNoBookingPolicy.js (#29) and resourcesBookingPolicyIncomplete.js
// (#30) — both consume data.js's getResourceAccessRuleMap(), whose
// fetchFailedRuleIds set surfaces the same caveat in both checks. Returns ''
// when nothing failed, so callers can splice it in unconditionally.
function fetchFailedCaveat(fetchFailedRuleIds, suffix) {
  if (!fetchFailedRuleIds || fetchFailedRuleIds.size === 0) return '';
  const n = fetchFailedRuleIds.size;
  return `Note: ${n} booking-policy rule${n !== 1 ? 's' : ''} could not be verified (fetch failed)${suffix ? `, ${suffix}` : ''}.`;
}

module.exports = { names, table, fields, fetchFailedCaveat, safeId };
