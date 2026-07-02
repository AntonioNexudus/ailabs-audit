const { TODAY, CHARGE_STALE_DAYS } = require('../config');
const { daysBetween, safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { getBusinesses } = require('../data');
const log = require('../log');

// #23. Uninvoiced charges older than 30 days (fetches per business — charges require business filter)
function checkUninvoicedCharges() {
  const businesses = getBusinesses();
  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - CHARGE_STALE_DAYS);
  const issues = [];

  for (const biz of businesses) {
    let charges;
    try {
      charges = fetchAllPages(['charges', 'list', '--business-id', safeId(biz.Id), '--invoiced', 'false']);
    } catch (err) {
      log.warn(`  [warn] skipping charges for business ${biz.Id} (${biz.Name}): ${err.message}`);
      continue;
    }

    for (const ch of charges) {
      if (ch.SaleDate && new Date(ch.SaleDate) < cutoff) {
        issues.push({
          id: ch.Id,
          description: ch.Description || 'N/A',
          amount: ch.TotalAmount,
          member: ch.CoworkerFullName || 'Unknown',
          coworkerId: ch.CoworkerId,
          business: biz.Name,
          saleDate: ch.SaleDate.slice(0, 10),
          daysOld: daysBetween(ch.SaleDate, TODAY),
          fix: `nexudus charges get --id ${safeId(ch.Id)}`,
        });
      }
    }
  }

  issues.sort((a, b) => b.daysOld - a.daysOld);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkUninvoicedCharges;
