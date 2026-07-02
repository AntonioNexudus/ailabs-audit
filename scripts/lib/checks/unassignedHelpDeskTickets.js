const { TODAY, UNASSIGNED_TICKET_DAYS } = require('../config');
const { daysBetween, safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { getBusinesses } = require('../data');

// #27. Open help-desk tickets unassigned for 7+ days — customer issues lingering
// without an owner. List per-business for tighter pagination on large tenants.
function checkUnassignedHelpDeskTickets() {
  const businesses = getBusinesses();
  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - UNASSIGNED_TICKET_DAYS);
  const cutoffIso = cutoff.toISOString();
  const issues = [];

  for (const biz of businesses) {
    let messages;
    try {
      messages = fetchAllPages([
        'helpdeskmessages', 'list',
        '--business-id', safeId(biz.Id),
        '--closed', 'false',
        '--to-created-on', cutoffIso,
      ]);
    } catch (err) {
      console.warn(`  [warn] skipping help-desk tickets for business ${biz.Id} (${biz.Name}): ${err.message}`);
      continue;
    }

    for (const m of messages) {
      const ownerId = m.OwnerId;
      if (ownerId != null && ownerId !== 0 && ownerId !== '0') continue;
      if (!m.CreatedOn) continue;
      issues.push({
        id: m.Id,
        business: biz.Name,
        subject: m.Subject || '(no subject)',
        coworker: m.CoworkerFullName || 'Unknown',
        createdOn: m.CreatedOn.slice(0, 10),
        daysOpen: daysBetween(m.CreatedOn, TODAY),
        fix: `nexudus helpdeskmessages update ${safeId(m.Id)} --owner-id <userId>`,
      });
    }
  }

  issues.sort((a, b) => b.daysOpen - a.daysOpen);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkUnassignedHelpDeskTickets;
