const { TODAY, BOOKING_STALE_DAYS } = require('../config');
const { daysBetween, safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { filterByBusiness } = require('../data');

// #17. Past bookings that are charged but not yet invoiced (>7 days)
function checkChargedUninvoicedBookings() {
  const bookings = filterByBusiness(fetchAllPages(['bookings', 'list']));
  const issues = [];
  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - BOOKING_STALE_DAYS);

  for (const b of bookings) {
    if (!b.Invoiced && !b.Billed && !b.Free && b.FromTime && new Date(b.FromTime) < cutoff) {
      if (new Date(b.ToTime || b.FromTime) < TODAY) {
        issues.push({
          id: b.Id,
          bookingNumber: b.BookingNumber,
          resource: b.ResourceName,
          member: b.CoworkerFullName,
          date: b.FromTime.slice(0, 10),
          daysOld: daysBetween(b.FromTime, TODAY),
          fix: `nexudus bookings get --id ${safeId(b.Id)}`,
        });
      }
    }
  }

  issues.sort((a, b) => b.daysOld - a.daysOld);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkChargedUninvoicedBookings;
