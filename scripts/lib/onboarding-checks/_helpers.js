// Shared helpers for the onboarding check-in checks. Not a check itself —
// required by the individual checks in this directory. Mirrors the small
// `_names()` truncation helper samaudittoollocal's Python checks use so the
// onboarding checks read the same way as their reference heuristics.

const { safeId, escPipe } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const log = require('../log');

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

// Fetch a per-business list, tolerating a failure on any single business (the
// same defensive pattern helpDeskDeptsNoManagers.js / unassignedHelpDeskTickets.js
// use in the account-health audit) so one broken business doesn't fail the
// whole check.
function fetchPerBusiness(businesses, argsFor, onError) {
  const out = [];
  for (const biz of businesses) {
    try {
      const items = fetchAllPages(argsFor(biz));
      for (const item of items) out.push({ biz, item });
    } catch (err) {
      if (typeof onError === 'function') onError(biz, err);
      else log.warn(`  [warn] skipping business ${biz.Id} (${biz.Name}): ${err.message}`);
    }
  }
  return out;
}

module.exports = { names, table, fields, fetchPerBusiness, safeId };
