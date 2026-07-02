const { TODAY, CHECKIN_STALE_HOURS } = require('../config');
const { hoursBetween, safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { filterByBusiness } = require('../data');

// #22. Unclosed check-ins older than 24 hours — member forgot to check out
function checkUnclosedCheckins() {
  const thirtyDaysAgo = new Date(TODAY);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const checkins = filterByBusiness(fetchAllPages(['checkins', 'list', '--from-from-time', thirtyDaysAgo.toISOString()]));
  const issues = [];

  for (const ci of checkins) {
    if (!ci.ToTime && ci.FromTime && hoursBetween(ci.FromTime, TODAY) >= CHECKIN_STALE_HOURS) {
      issues.push({
        id: ci.Id,
        member: ci.CoworkerFullName,
        business: ci.BusinessName,
        from: ci.FromTime.slice(0, 16).replace('T', ' '),
        hoursOpen: hoursBetween(ci.FromTime, TODAY),
        fix: `nexudus checkins get --id ${safeId(ci.Id)}`,
      });
    }
  }

  issues.sort((a, b) => b.hoursOpen - a.hoursOpen);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkUnclosedCheckins;
