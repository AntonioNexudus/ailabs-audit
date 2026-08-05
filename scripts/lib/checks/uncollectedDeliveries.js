const { TODAY, DELIVERY_STALE_DAYS } = require('../config');
const { daysBetween, safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { getBusinesses } = require('../data');
const log = require('../log');

// #36. Packages and post logged in at reception that nobody has collected for
// DELIVERY_STALE_DAYS+ days. They take up space, the member usually doesn't
// know they're there, and the record keeps the mail room's numbers wrong.
//
// Listed per-business with the narrowing pushed server-side (--collected false
// + --to-created-on), the same shape check #27 uses for help-desk messages.
// An account-wide fetch would be far more expensive here: delivery rows carry
// CoworkerFullName/CoworkerEmail, so under PII redaction every page is
// tokenized and fetched strictly sequentially, and a busy mail room accumulates
// thousands of collected rows the check would only throw away.
function checkUncollectedDeliveries() {
  const businesses = getBusinesses();
  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - DELIVERY_STALE_DAYS);
  const cutoffIso = cutoff.toISOString();
  const issues = [];

  for (const biz of businesses) {
    let deliveries;
    try {
      deliveries = fetchAllPages([
        'coworkerdeliveries', 'list',
        '--business-id', safeId(biz.Id),
        '--collected', 'false',
        '--to-created-on', cutoffIso,
      ]);
    } catch (err) {
      log.warn(`  [warn] skipping deliveries for business ${biz.Id} (${biz.Name}): ${err.message}`);
      continue;
    }

    for (const d of deliveries) {
      if (!d || d.Collected) continue;
      // Forwarded / recycled / shredded / returned-to-sender items are not
      // "collected", but they have already left the building by another route —
      // they are not sitting waiting for the member, so they're not a problem.
      if (d.Forwarded || d.Recycled || d.Shredded || d.ReturnedToSender) continue;
      if (!d.CreatedOn) continue;

      const daysWaiting = daysBetween(d.CreatedOn, TODAY);
      if (!Number.isFinite(daysWaiting) || daysWaiting < DELIVERY_STALE_DAYS) continue;

      issues.push({
        id: d.Id,
        delivery: d.Name || `#${d.Id}`,
        coworker: d.CoworkerFullName || 'Unknown',
        location: d.Location || '—',
        business: biz.Name || `#${biz.Id}`,
        received: String(d.CreatedOn).slice(0, 10),
        daysWaiting,
        fix: `nexudus coworkerdeliveries update ${safeId(d.Id)} --collected true`,
      });
    }
  }

  issues.sort((a, b) => b.daysWaiting - a.daysWaiting);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkUncollectedDeliveries;
