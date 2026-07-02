const { fetchAllPages } = require('../nexudus-cli');
const { getContracts, filterByBusiness } = require('../data');
const { TODAY } = require('../config');

const WINDOW_DAYS = 30;

// #19. Space usage signal: are members actually checking in? "checkins list"
// has no server-side business filter (it's not in nexudus-cli.js's
// BUSINESS_FLAG map), so — matching unclosedCheckins.js's proven pattern for
// this exact entity — fetch account-wide with --from-from-time and scope with
// filterByBusiness() in memory, rather than looping a --business-id flag the
// CLI doesn't support for this entity.
function checkUsageActivity() {
  const activeContracts = getContracts().filter(c => c && !c.Cancelled);
  if (activeContracts.length === 0) {
    return { status: 'skip', detail: 'No active contracts in scope — no usage expected yet.' };
  }

  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

  const checkins = filterByBusiness(fetchAllPages(['checkins', 'list', '--from-from-time', cutoff.toISOString()]));
  const total = checkins.length;

  if (total > 0) {
    return {
      status: 'pass',
      detail: `${total} check-in${total !== 1 ? 's' : ''} recorded in the last ${WINDOW_DAYS} days across ${activeContracts.length} active contract${activeContracts.length !== 1 ? 's' : ''}.`,
    };
  }
  return {
    status: 'warn',
    detail: `No check-ins recorded in the last ${WINDOW_DAYS} days, despite ${activeContracts.length} active contract${activeContracts.length !== 1 ? 's' : ''}.`,
    hint: 'Confirm members know how to check in, and that the check-in method (app/QR/access control) is actually working — a healthy account should show regular usage.',
  };
}

module.exports = checkUsageActivity;
