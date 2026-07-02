const { TODAY, STALE_OPERATOR_DAYS } = require('../config');
const { daysBetween, safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');

// #25. Stale operator accounts: admins still active but no login for 90+ days.
// Covers --is-admin true (super-admins) only; role-based operators can't be
// filtered on list (UserRoles is get-only). Also tenant-wide: the users list
// has no business filter, so business scoping does not apply to this check.
function checkStaleOperators() {
  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - STALE_OPERATOR_DAYS);
  const cutoffIso = cutoff.toISOString();

  const users = fetchAllPages([
    'users', 'list',
    '--active', 'true',
    '--is-admin', 'true',
    '--to-last-access', cutoffIso,
  ]);

  const issues = [];
  for (const u of users) {
    if (!u.LastAccess) continue;
    const lastAccess = new Date(u.LastAccess);
    if (lastAccess > cutoff) continue;
    issues.push({
      id: u.Id,
      operator: u.FullName || '(no name)',
      email: u.Email || '',
      lastAccess: u.LastAccess.slice(0, 10),
      daysStale: daysBetween(u.LastAccess, TODAY),
      fix: `nexudus users update ${safeId(u.Id)} --active false`,
    });
  }

  issues.sort((a, b) => b.daysStale - a.daysStale);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkStaleOperators;
