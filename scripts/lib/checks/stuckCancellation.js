const { TODAY } = require('../config');
const { daysBetween, safeId } = require('../util');
const { getContracts } = require('../data');

// #5. Contracts with a past cancellation date that are still not cancelled
function checkContractsStuckCancellation() {
  const contracts = getContracts();
  const issues = [];

  for (const c of contracts) {
    if (!c.Cancelled && c.CancellationDate && new Date(c.CancellationDate) < TODAY) {
      issues.push({
        contractId: c.Id,
        member: c.CoworkerFullName,
        tariff: c.TariffName,
        cancellationDate: c.CancellationDate.slice(0, 10),
        daysPast: daysBetween(c.CancellationDate, TODAY),
        fix: `nexudus coworkercontracts get --id ${safeId(c.Id)}`,
      });
    }
  }

  issues.sort((a, b) => b.daysPast - a.daysPast);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkContractsStuckCancellation;
