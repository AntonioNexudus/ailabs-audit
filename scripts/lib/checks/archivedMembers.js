const { safeId } = require('../util');
const { getContracts, getCoworkersArchived } = require('../data');

// #8. Suspended (archived) members that still have active contracts
function checkArchivedMembersWithActiveContracts() {
  const archived = getCoworkersArchived();
  if (archived.length === 0) return { status: 'PASS', items: [] };

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
  for (const cw of archived) {
    const activeContracts = activeContractsByCoworker.get(cw.Id) || [];
    for (const contract of activeContracts) {
      issues.push({
        coworkerId: cw.Id,
        member: cw.FullName,
        email: cw.Email,
        contractId: contract.Id,
        tariff: contract.TariffName,
        fix: `nexudus coworkers get --id ${safeId(cw.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkArchivedMembersWithActiveContracts;
