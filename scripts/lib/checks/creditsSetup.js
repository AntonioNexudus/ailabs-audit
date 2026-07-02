const { safeId } = require('../util');
const { getProducts, getTariffs, getTariffCredits, getProductCredits } = require('../data');

// #28. Plan/product booking credits that are misconfigured: they release on
// contract renewal / product purchase but either grant nothing (amount <= 0) or
// can never be spent (not enabled for bookings, events, or products). Scoped to
// the selected businesses via the tariff/product the credit hangs off.
function checkCreditsSetup() {
  const tariffMap = new Map();
  for (const t of getTariffs()) {
    if (!t.Archived) tariffMap.set(t.Id, t);
  }
  const productMap = new Map();
  for (const p of getProducts()) {
    if (!p.Archived) productMap.set(p.Id, p);
  }

  // A released credit is useless unless it can pay for at least one of bookings,
  // events, or products (universal). If the amount is <= 0 it grants nothing.
  const problemWith = (c) => {
    if (!(c.Credit > 0)) return 'grants no credit (amount is 0 or less)';
    if (!c.CaneBeUsedForBookings && !c.CaneBeUsedForEvents && !c.IsUniversalCredit) {
      return 'not usable for bookings, events, or products — never spendable';
    }
    return null;
  };

  const issues = [];

  for (const c of getTariffCredits()) {
    const parent = tariffMap.get(c.TariffId);
    if (!parent) continue; // credit on an out-of-scope or archived plan
    const problem = problemWith(c);
    if (problem) {
      issues.push({
        type: 'Plan credit',
        id: c.Id,
        name: c.Name,
        owner: parent.Name,
        business: parent.BusinessName,
        problem,
        fix: `nexudus tariffbookingcredits get --id ${safeId(c.Id)}`,
      });
    }
  }

  for (const c of getProductCredits()) {
    const parent = productMap.get(c.ProductId);
    if (!parent) continue; // credit on an out-of-scope or archived product
    const problem = problemWith(c);
    if (problem) {
      issues.push({
        type: 'Product credit',
        id: c.Id,
        name: c.Name,
        owner: parent.Name,
        business: parent.BusinessName,
        problem,
        fix: `nexudus productbookingcredits get --id ${safeId(c.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkCreditsSetup;
