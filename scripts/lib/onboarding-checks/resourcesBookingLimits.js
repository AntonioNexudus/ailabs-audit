const { getResources } = require('../data');
const { fields } = require('./_helpers');

// #9. Booking limits configured on visible resources: min/max booking length,
// advance-booking window, and a cancellation policy. Missing limits mean the
// portal/AI cannot answer "how long can I book it?" or "how far ahead?"
function checkResourcesBookingLimits() {
  const resources = getResources().filter(r => r && r.Visible && !r.Archived);
  if (resources.length === 0) {
    return { status: 'skip', detail: 'No visible, active resources to check.', hint: 'Create and publish bookable resources first.' };
  }
  const total = resources.length;
  const withDuration = resources.filter(r => r.MinBookingLength || r.MaxBookingLength).length;
  const withAdvance = resources.filter(r => r.BookInAdvanceLimit).length;
  const withCancel = resources.filter(r => r.LateCancellationLimit).length;

  const detail = fields([
    ['Duration limits (min/max)', `${withDuration}/${total} resources`],
    ['Advance booking window', `${withAdvance}/${total} resources`],
    ['Cancellation policy', `${withCancel}/${total} resources`],
  ]);

  if (withDuration === total && withAdvance === total && withCancel === total) {
    return { status: 'pass', detail };
  }
  return {
    status: 'warn',
    detail,
    hint: 'Set MinBookingLength/MaxBookingLength, BookInAdvanceLimit, and LateCancellationLimit on each resource so booking rules are clear to members and the portal.',
  };
}

module.exports = checkResourcesBookingLimits;
