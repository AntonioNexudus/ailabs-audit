const { CONTRACT_LIMIT_WARNING, CONTRACT_LIMIT_MAX } = require('../config');
const { safeId } = require('../util');
const { getContracts } = require('../data');

// #19. Members approaching the 25-contract limit (20+ active contracts)
function checkContractLimitApproaching() {
  const contracts = getContracts();
  const countByCoworker = new Map();

  for (const c of contracts) {
    if (c.Cancelled) continue;
    countByCoworker.set(c.CoworkerId, (countByCoworker.get(c.CoworkerId) || 0) + 1);
  }

  const nameByCoworker = new Map();
  for (const c of contracts) {
    if (!c.Cancelled && !nameByCoworker.has(c.CoworkerId)) {
      nameByCoworker.set(c.CoworkerId, c.CoworkerFullName);
    }
  }

  const issues = [];
  for (const [coworkerId, count] of countByCoworker) {
    if (count >= CONTRACT_LIMIT_WARNING) {
      issues.push({
        coworkerId,
        member: nameByCoworker.get(coworkerId) || 'Unknown',
        activeContracts: count,
        limit: CONTRACT_LIMIT_MAX,
        fix: `nexudus coworkers get --id ${safeId(coworkerId)}`,
      });
    }
  }

  issues.sort((a, b) => b.activeContracts - a.activeContracts);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkContractLimitApproaching;
