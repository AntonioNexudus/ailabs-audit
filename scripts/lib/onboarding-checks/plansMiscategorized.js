const { getTariffs } = require('../data');
const { table } = require('./_helpers');

// #5. Plans that read like a Hot Desk / Dedicated Desk / Virtual Office plan
// in their name or description but are set to a different SystemTariffType.
// Port of samaudittoollocal/membership_plans.py's mistype heuristic — a
// mistyped plan type is invisible to type-based filtering elsewhere in Nexudus.
const TARIFF_TYPE_NAMES = {
  1: 'Full-time Private Office', 2: 'Part-time Private Office',
  3: 'Full-time Dedicated Desk', 4: 'Part-time Dedicated Desk',
  5: 'Full-time Hot Desk', 6: 'Part-time Hot Desk',
  7: 'Full-time Other', 8: 'Part-time Other',
  9: 'Storage', 10: 'Virtual Office', 11: 'Virtual', 99: 'Other',
};

const CORRECT_TYPE_IDS = {
  'Hot Desk': new Set([5, 6]),
  'Dedicated Desk': new Set([3, 4]),
  'Virtual Office': new Set([10, 11]),
};

const MISTYPE_KEYWORDS = {
  'Hot Desk': ['hot desk', 'hot-desk', 'hotdesk', 'flex desk', 'flexi desk', 'floating desk', 'shared desk', 'coworking desk'],
  'Dedicated Desk': ['dedicated desk', 'fixed desk', 'assigned desk', 'permanent desk'],
  'Virtual Office': ['virtual office', 'postal address', 'registered address', 'mail address', 'mailing address'],
};

const CORRECT_TYPE_LABEL = {
  'Hot Desk': 'Full-time Hot Desk or Part-time Hot Desk',
  'Dedicated Desk': 'Full-time Dedicated Desk or Part-time Dedicated Desk',
  'Virtual Office': 'Virtual Office or Virtual',
};

function checkPlansMiscategorized() {
  const all = getTariffs().filter(t => t && !t.Archived);

  const rows = [];
  for (const t of all) {
    const text = `${t.Name || ''} ${t.Description || ''}`.toLowerCase();
    for (const [label, keywords] of Object.entries(MISTYPE_KEYWORDS)) {
      if (!keywords.some(kw => text.includes(kw))) continue;
      // Name/description implies `label`'s category — flag only if the actual
      // type isn't one of *that* category's correct IDs (catches a plan swapped
      // between two tracked categories, e.g. "Hot Desk" saved as Dedicated Desk,
      // not just types wholly outside the tracked set).
      if (!CORRECT_TYPE_IDS[label].has(t.SystemTariffType)) {
        const current = TARIFF_TYPE_NAMES[t.SystemTariffType] || String(t.SystemTariffType ?? '?');
        rows.push([t.Name || 'Unnamed', current, CORRECT_TYPE_LABEL[label]]);
      }
      break;
    }
  }

  if (rows.length === 0) {
    return {
      status: 'pass',
      detail: all.length > 0
        ? `No plan naming/type mismatches found across ${all.length} active plans.`
        : 'No active plans to check.',
    };
  }
  return {
    status: 'warn',
    detail: table(['Plan', 'Current type', 'Should be'], rows),
    hint: 'These plan names/descriptions suggest a different plan type than what is set. Fix the type so filtering and reporting treat them correctly.',
  };
}

module.exports = checkPlansMiscategorized;
