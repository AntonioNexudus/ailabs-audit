const { getEventAttendees } = require('../data');
const { table } = require('./_helpers');

// #23. Event attendees checked in but not billed/invoiced. Direct parallel to
// the account-health audit's uninvoiced-bookings/uninvoiced-charges checks
// (scripts/lib/checks/uninvoicedBookings.js, uninvoicedCharges.js), applied to
// `eventattendees` — an entity that check never covered. Fields confirmed via
// `nexudus eventattendees list --help`: --checked-in, --invoiced, --billed
// (plus --coworker-invoice-paid, not used here — Invoiced/Billed already
// capture the "was this ever put on an invoice" signal the check needs;
// CoworkerInvoicePaid answers a different question, whether that invoice was
// later paid, which is out of scope for this readiness check).
function checkEventAttendeesUnbilled() {
  const attendees = getEventAttendees();
  const checkedIn = attendees.filter(a => a && a.CheckedIn);
  if (checkedIn.length === 0) {
    return { status: 'skip', detail: 'No checked-in event attendees found for this scope yet.' };
  }

  // Falsy check (not strict `=== false`), matching the health audit's
  // uninvoicedBookings.js (`!b.Invoiced && !b.Billed`) — if the API returns
  // null/undefined rather than an explicit false for an attendee that hasn't
  // been invoiced yet, a strict-equality check would silently miss it.
  const unbilled = checkedIn.filter(a => !a.Invoiced || !a.Billed);
  if (unbilled.length === 0) {
    return {
      status: 'pass',
      detail: `All ${checkedIn.length} checked-in event attendee${checkedIn.length !== 1 ? 's are' : ' is'} invoiced and billed.`,
    };
  }
  return {
    status: unbilled.length === checkedIn.length ? 'fail' : 'warn',
    detail: table(
      ['Event', 'Attendee', 'Invoiced', 'Billed'],
      unbilled.map(a => [
        `#${a.CalendarEventId ?? '—'}`,
        a.FullName || a.Email || `#${a.CoworkerId ?? a.Id}`,
        a.Invoiced ? 'Yes' : 'No',
        a.Billed ? 'Yes' : 'No',
      ]),
    ),
    hint: 'Open Events > Attendees and invoice/bill these checked-in attendees — checked-in usually means the event was delivered, so unbilled attendees are lost revenue.',
  };
}

module.exports = checkEventAttendeesUnbilled;
