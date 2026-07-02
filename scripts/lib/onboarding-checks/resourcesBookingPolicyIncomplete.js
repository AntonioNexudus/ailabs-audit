const { getResources, getResourceAccessRules, getResourceAccessRuleMap } = require('../data');
const { table, fetchFailedCaveat } = require('./_helpers');

// #30. Booking-policy rules that DO cover at least one resource but are
// missing key limits: either both MinBookingLength/MaxBookingLength (no
// duration bound at all) or both LateBookingLimit/LateCancellationLimit (no
// notice-period enforcement at all). Fields confirmed via `nexudus
// resourceaccessrules list --help` (and cross-checked against `create --help`
// for the plain-English descriptions used in the hint text below).
// Complements #29 (resourcesNoBookingPolicy): that check flags resources with
// zero rules; this one flags rules that exist but are incompletely configured
// — only rules with >=1 linked resource are considered "in use" here (an
// unattached rule isn't constraining anything yet, so it's out of scope for
// this specific check).
function checkResourcesBookingPolicyIncomplete() {
  const resources = getResources().filter(r => r && r.Visible && !r.Archived);
  if (resources.length === 0) {
    return { status: 'skip', detail: 'No visible, active resources to check.', hint: 'Create and publish bookable resources first.' };
  }

  const rules = getResourceAccessRules();
  const { resourceIdToRuleIds, fetchFailedRuleIds } = getResourceAccessRuleMap();

  // Invert resourceIdToRuleIds -> ruleId -> resource names, restricted to the
  // visible/active resources this audit scope cares about.
  const resourceNamesByRuleId = new Map();
  for (const r of resources) {
    const ruleIds = resourceIdToRuleIds.get(String(r.Id));
    if (!ruleIds) continue;
    for (const ruleId of ruleIds) {
      if (!resourceNamesByRuleId.has(ruleId)) resourceNamesByRuleId.set(ruleId, []);
      resourceNamesByRuleId.get(ruleId).push(r.Name || `#${r.Id}`);
    }
  }

  const inUseRules = rules.filter(r => r && r.Id != null && resourceNamesByRuleId.has(r.Id));

  const caveat = fetchFailedCaveat(fetchFailedRuleIds, 'excluded here');

  if (inUseRules.length === 0) {
    return {
      status: 'skip',
      detail: `No booking-policy rules apply to any visible resource in scope yet.${caveat ? ` ${caveat}` : ''}`,
      hint: 'See the "no booking-policy rule" check — create a resourceaccessrules rule covering these resources first.',
    };
  }

  const incomplete = inUseRules.filter(r => {
    const noDuration = !r.MinBookingLength && !r.MaxBookingLength;
    const noNotice = !r.LateBookingLimit && !r.LateCancellationLimit;
    return noDuration || noNotice;
  });

  if (incomplete.length === 0) {
    return {
      status: 'pass',
      detail: `All ${inUseRules.length} booking-policy rule${inUseRules.length !== 1 ? 's' : ''} in use have both duration and notice-period limits set.${caveat ? ` ${caveat}` : ''}`,
    };
  }

  // The caveat is appended to `hint`, not `detail`: detailHtml() in
  // onboarding-report.js decides "render as a table" if ANY line of `detail`
  // contains " | ", then splits EVERY line (including a plain-text caveat
  // sentence with no " | ") on that delimiter — appending it into the same
  // string as table() produced a malformed single-cell row under the 3-column
  // header. `hint` renders in its own separate block, so it can't corrupt the
  // table.
  const hintBase = 'Open Operations > Resources > Booking Policy Rules and set MinBookingLength/MaxBookingLength (bounds booking duration) and LateBookingLimit/LateCancellationLimit (enforces a notice period) on these rules — as configured they leave one or both unbounded.';
  return {
    status: 'warn',
    detail: table(
      ['Rule', 'Missing', 'Applies to'],
      incomplete.map(r => {
        const missing = [];
        if (!r.MinBookingLength && !r.MaxBookingLength) missing.push('min/max booking length');
        if (!r.LateBookingLimit && !r.LateCancellationLimit) missing.push('late-booking/cancellation limit');
        const resourceList = (resourceNamesByRuleId.get(r.Id) || []);
        const shown = resourceList.slice(0, 3).join(', ') + (resourceList.length > 3 ? ` and ${resourceList.length - 3} more` : '');
        return [r.Name || `#${r.Id}`, missing.join('; '), shown];
      }),
    ),
    hint: caveat ? `${hintBase} ${caveat}` : hintBase,
  };
}

module.exports = checkResourcesBookingPolicyIncomplete;
