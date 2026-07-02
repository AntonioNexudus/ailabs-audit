const { getContracts, getTariffs } = require('../data');
const { TODAY } = require('../config');
const { table } = require('./_helpers');

const GO_LIVE_GRACE_DAYS = 90;

// #20. Active contracts still priced at (near) £0 against a plan that
// normally isn't free, well after go-live — often a leftover onboarding/trial
// price that was never corrected to the standard rate.
function checkHeavyDiscountContracts() {
  const contracts = getContracts().filter(c => c && !c.Cancelled);
  if (contracts.length === 0) {
    return { status: 'skip', detail: 'No active contracts in scope.' };
  }

  const tariffPriceById = new Map();
  for (const t of getTariffs()) tariffPriceById.set(t.Id, t.Price);

  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - GO_LIVE_GRACE_DAYS);

  const rows = [];
  for (const c of contracts) {
    if (c.Price == null || c.Price > 0) continue;
    const tariffPrice = tariffPriceById.get(c.TariffId);
    if (!(tariffPrice > 0)) continue; // plan is genuinely free; not a discount artifact
    if (!c.StartDate || new Date(c.StartDate) >= cutoff) continue; // still inside the grace window
    rows.push([c.CoworkerFullName || 'Unknown', c.TariffName || 'Unknown', c.StartDate.slice(0, 10)]);
  }

  if (rows.length === 0) {
    return {
      status: 'pass',
      detail: `No long-standing £0 contracts found among ${contracts.length} active contract${contracts.length !== 1 ? 's' : ''}.`,
    };
  }
  return {
    status: 'warn',
    detail: table(['Member', 'Plan', 'Contract start'], rows),
    hint: `These contracts have been £0 for over ${GO_LIVE_GRACE_DAYS} days on a plan that normally isn't free — confirm the discount is still intentional, then correct the price if not.`,
  };
}

module.exports = checkHeavyDiscountContracts;
