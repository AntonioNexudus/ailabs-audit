const { safeId } = require('../util');
const { getContracts, getTariffs } = require('../data');

// #21. Archived (retired) plans that still have active contracts referencing them
function checkArchivedTariffsWithActiveContracts() {
  const tariffs = getTariffs();
  const archivedTariffIds = new Set();
  for (const t of tariffs) {
    if (t.Archived) archivedTariffIds.add(t.Id);
  }

  if (archivedTariffIds.size === 0) return { status: 'PASS', items: [] };

  const contracts = getContracts();

  const countByTariff = new Map();
  const nameByTariff = new Map();
  for (const c of contracts) {
    if (c.Cancelled || !archivedTariffIds.has(c.TariffId)) continue;
    countByTariff.set(c.TariffId, (countByTariff.get(c.TariffId) || 0) + 1);
    if (!nameByTariff.has(c.TariffId)) nameByTariff.set(c.TariffId, c.TariffName);
  }

  const issues = [];
  for (const [tariffId, count] of countByTariff) {
    issues.push({
      tariffId,
      tariff: nameByTariff.get(tariffId),
      activeContracts: count,
      fix: `nexudus tariffs get --id ${safeId(tariffId)}`,
    });
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkArchivedTariffsWithActiveContracts;
