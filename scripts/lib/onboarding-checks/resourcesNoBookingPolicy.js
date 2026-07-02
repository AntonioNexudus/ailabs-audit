const { getResources, getResourceAccessRuleMap } = require('../data');
const { names, fetchFailedCaveat } = require('./_helpers');

// #29. Bookable resources with zero resourceaccessrules rows at all — no rule
// means no enforced booking constraints (advance window, notice period,
// duration limits) for that resource. Uses getResourceAccessRuleMap() (in
// data.js), which resolves each rule's linked Resources via a per-rule `get`
// call (list --help confirms the linked-resources relation is not returned by
// `list`, only --applied-resources-count is) — see that function's comment
// for the reasoning, mirroring helpDeskManagers.js's list->get-per-record
// pattern. Coverage is counted regardless of a rule's Active flag: the check
// name is specifically "no rule at all", not "no active rule" (an inactive
// rule is a separate, lower-severity signal — see #27 validationRulesInactive
// for that framing pattern, not reused here since resourceaccessrules'
// Active semantics weren't part of this check's scope).
function checkResourcesNoBookingPolicy() {
  const resources = getResources().filter(r => r && r.Visible && !r.Archived);
  if (resources.length === 0) {
    return { status: 'skip', detail: 'No visible, active resources to check.', hint: 'Create and publish bookable resources first.' };
  }

  const { resourceIdToRuleIds, fetchFailedRuleIds } = getResourceAccessRuleMap();
  const uncovered = resources.filter(r => !resourceIdToRuleIds.has(String(r.Id)));

  const caveat = fetchFailedCaveat(fetchFailedRuleIds, 'so coverage below may be incomplete');

  if (uncovered.length === 0) {
    return {
      status: 'pass',
      detail: `All ${resources.length} visible resources are covered by at least one booking-policy rule.${caveat ? ` ${caveat}` : ''}`,
    };
  }
  return {
    status: uncovered.length === resources.length ? 'fail' : 'warn',
    detail: `${uncovered.length} of ${resources.length} resources have no booking-policy rule at all: ${names(uncovered)}.${caveat ? ` ${caveat}` : ''}`,
    hint: 'Open Operations > Resources > Booking Policy Rules and create a rule covering these resources — without one, booking length, advance-window, and cancellation-notice limits are all unenforced.',
  };
}

module.exports = checkResourcesNoBookingPolicy;
