const { getBusinesses } = require('../data');
const { table } = require('./_helpers');

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// #12. Opening hours configured on at least all five weekdays per business.
function weekdaysWithHours(biz) {
  let n = 0;
  for (const day of WEEKDAYS) {
    if (biz[`${day}Closed`]) continue; // deliberately closed still counts as "configured"
    if (biz[`${day}OpenTime`] != null && biz[`${day}CloseTime`] != null) n++;
    else if (biz[`${day}Closed`] === false) n++;
  }
  return n;
}

function checkLocationOpeningHours() {
  const businesses = getBusinesses();
  if (businesses.length === 0) {
    return { status: 'skip', detail: 'No businesses in scope.' };
  }

  const rows = [];
  let incomplete = 0;
  for (const biz of businesses) {
    const covered = weekdaysWithHours(biz);
    if (covered < WEEKDAYS.length) {
      incomplete++;
      rows.push([biz.Name || `#${biz.Id}`, `${covered}/${WEEKDAYS.length} weekdays configured`]);
    }
  }

  if (rows.length === 0) {
    return {
      status: 'pass',
      detail: `All ${businesses.length} business${businesses.length !== 1 ? 'es have' : ' has'} opening hours set on every weekday.`,
    };
  }
  return {
    status: incomplete === businesses.length ? 'fail' : 'warn',
    detail: table(['Business', 'Weekday coverage'], rows),
    hint: 'Set weekday opening hours on the business profile (Settings > Locations) — without them "when are you open?" can\'t be answered accurately.',
  };
}

module.exports = checkLocationOpeningHours;
