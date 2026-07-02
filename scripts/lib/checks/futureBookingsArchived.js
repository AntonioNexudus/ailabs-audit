const { TODAY } = require('../config');
const { safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { filterByBusiness } = require('../data');

// #12. Future bookings on archived resources — members will be affected
function checkFutureBookingsArchivedResources() {
  const futureBookings = filterByBusiness(fetchAllPages(['bookings', 'list', '--from-from-time', TODAY.toISOString()]));
  const archivedResources = filterByBusiness(fetchAllPages(['resources', 'list', '--archived', 'true']));
  const archivedIds = new Set(archivedResources.map((r) => r.Id));
  const issues = [];

  for (const b of futureBookings) {
    if (b.ResourceId && archivedIds.has(b.ResourceId)) {
      issues.push({
        id: b.Id,
        bookingNumber: b.Id,
        resource: b.ResourceName || 'Unknown',
        member: b.CoworkerFullName || 'Unknown',
        date: b.FromTime ? b.FromTime.slice(0, 10) : 'N/A',
        fix: `nexudus bookings get --id ${safeId(b.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkFutureBookingsArchivedResources;
