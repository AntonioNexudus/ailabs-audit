const { getTariffs } = require('../data');
const { names } = require('./_helpers');

// #1. Membership plans published & visible on the members portal. A plan that
// is not archived but has Visible = false exists in the system yet nobody can
// self-serve sign up to it — a common onboarding gap left over from setup.
function checkPlansPublished() {
  const active = getTariffs().filter(t => t && !t.Archived);
  if (active.length === 0) {
    return {
      status: 'fail',
      detail: 'No active membership plans found for this scope.',
      hint: 'Create at least one membership plan (Inventory > Plans) before members can sign up.',
    };
  }
  const hidden = active.filter(t => !t.Visible);
  if (hidden.length === 0) {
    return {
      status: 'pass',
      detail: `All ${active.length} active plan${active.length !== 1 ? 's are' : ' is'} visible on the members portal: ${names(active)}.`,
    };
  }
  if (hidden.length === active.length) {
    return {
      status: 'fail',
      detail: `All ${active.length} active plans are hidden from the portal: ${names(hidden)}.`,
      hint: 'Set Visible = on for the plans members should be able to find and sign up to themselves.',
    };
  }
  return {
    status: 'warn',
    detail: `${hidden.length} of ${active.length} active plans are hidden: ${names(hidden)}.`,
    hint: 'Hidden plans cannot be self-served on the portal. Set Visible = on for any plan you want members to find and sign up to directly.',
  };
}

module.exports = checkPlansPublished;
