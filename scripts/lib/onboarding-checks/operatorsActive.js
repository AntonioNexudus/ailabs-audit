const { fetchAllPages } = require('../nexudus-cli');
const { TODAY } = require('../config');
const { names } = require('./_helpers');

const WINDOW_DAYS = 30;

// #22. At least one admin operator has logged in during the last 30 days —
// an account nobody is actively managing during its first year is a churn
// risk. Tenant-wide (users has no business filter), same as the account-health
// audit's stale-operators check (#25), but inverted: this flags an *absence*
// of recent activity rather than listing stale accounts.
function checkOperatorsActive() {
  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

  const users = fetchAllPages([
    'users', 'list',
    '--active', 'true',
    '--is-admin', 'true',
    '--from-last-access', cutoff.toISOString(),
  ]);

  const recentlyActive = users.filter(u => u && u.LastAccess && new Date(u.LastAccess) >= cutoff);

  if (recentlyActive.length > 0) {
    return {
      status: 'pass',
      detail: `${recentlyActive.length} admin operator${recentlyActive.length !== 1 ? 's' : ''} logged in within the last ${WINDOW_DAYS} days: ${names(recentlyActive, 'FullName')}.`,
    };
  }
  return {
    status: 'warn',
    detail: `No admin operator has logged in within the last ${WINDOW_DAYS} days.`,
    hint: 'Confirm the client\'s team is still actively managing their Nexudus account — no recent admin logins can mean the account is going unmanaged.',
  };
}

module.exports = checkOperatorsActive;
