const { TODAY } = require('../config');
const { daysBetween, safeId } = require('../util');
const { getContracts, getCoworkersArchived } = require('../data');

// #9. Suspended contracts past cancellation date — couldn't auto-cancel because member was archived
function checkSuspendedContractsPastCancellation() {
  const archived = getCoworkersArchived();
  if (archived.length === 0) return { status: 'PASS', items: [] };

  const archivedIds = new Set(archived.map(cw => cw.Id));
  const archivedMap = new Map(archived.map(cw => [cw.Id, cw]));
  const contracts = getContracts();
  const issues = [];

  for (const c of contracts) {
    if (!c.Cancelled && c.CancellationDate && new Date(c.CancellationDate) < TODAY && archivedIds.has(c.CoworkerId)) {
      const cw = archivedMap.get(c.CoworkerId);
      issues.push({
        contractId: c.Id,
        member: c.CoworkerFullName,
        email: cw?.Email || '',
        tariff: c.TariffName,
        cancellationDate: c.CancellationDate.slice(0, 10),
        daysPast: daysBetween(c.CancellationDate, TODAY),
        fix: `nexudus coworkers get --id ${safeId(c.CoworkerId)}`,
      });
    }
  }

  issues.sort((a, b) => b.daysPast - a.daysPast);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkSuspendedContractsPastCancellation;
