const { safeId } = require('../util');
const { getContracts, getTariffs } = require('../data');

// #33. Contracts with a manual price override that differs from the plan price
function checkContractPriceOverrides() {
  const contracts = getContracts();
  const tariffs = getTariffs();
  const tariffPriceMap = new Map();
  for (const t of tariffs) {
    tariffPriceMap.set(t.Id, t.Price);
  }

  const issues = [];
  for (const c of contracts) {
    if (c.Cancelled) continue;
    if (c.Price != null && c.TariffId) {
      const tariffPrice = tariffPriceMap.get(c.TariffId);
      if (tariffPrice != null && c.Price !== tariffPrice) {
        issues.push({
          contractId: c.Id,
          member: c.CoworkerFullName,
          tariff: c.TariffName,
          contractPrice: c.Price,
          tariffPrice,
          diff: (c.Price - tariffPrice).toFixed(2),
          fix: `nexudus coworkercontracts get --id ${safeId(c.Id)}`,
        });
      }
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkContractPriceOverrides;
