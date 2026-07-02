const { TODAY_STR } = require('../config');
const { safeId } = require('../util');
const { getContracts, getCoworkersInactive } = require('../data');

// #3. Inactive members that still have active (non-cancelled) contracts
function checkInactiveMembersWithActiveContracts() {
  const inactiveCoworkers = getCoworkersInactive();
  if (inactiveCoworkers.length === 0) return { status: 'PASS', items: [] };

  const contracts = getContracts();
  const activeContractsByCoworker = new Map();

  for (const c of contracts) {
    if (!c.Cancelled) {
      if (!activeContractsByCoworker.has(c.CoworkerId)) {
        activeContractsByCoworker.set(c.CoworkerId, []);
      }
      activeContractsByCoworker.get(c.CoworkerId).push(c);
    }
  }

  const issues = [];

  for (const cw of inactiveCoworkers) {
    const activeContracts = activeContractsByCoworker.get(cw.Id) || [];
    for (const contract of activeContracts) {
      issues.push({
        coworkerId: cw.Id,
        member: cw.FullName,
        email: cw.Email,
        contractId: contract.Id,
        tariff: contract.TariffName,
        startDate: contract.StartDate?.slice(0, 10) || 'N/A',
        fix: `nexudus coworkercontracts update --id ${safeId(contract.Id)} --cancellation-date ${TODAY_STR}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkInactiveMembersWithActiveContracts;
