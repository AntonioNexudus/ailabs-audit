const { TODAY } = require('../config');
const { daysBetween, safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { getContracts } = require('../data');
const state = require('../state');

// #16. Frozen/paused contracts past their pause end date
function checkFrozenContractsPastEndDate() {
  // contractpausedperiods has no BusinessId; constrain via contract membership.
  const allPauses = fetchAllPages(['contractpausedperiods', 'list']);
  let pauses = allPauses;
  if (state.selectedBusinessIds) {
    const contractIds = new Set(getContracts().map(c => c.Id));
    pauses = allPauses.filter(p => contractIds.has(p.CoworkerContractId));
  }
  const issues = [];

  for (const p of pauses) {
    if (p.PauseUntil && new Date(p.PauseUntil) < TODAY) {
      issues.push({
        contractId: p.CoworkerContractId,
        member: p.CoworkerContractCoworkerFullName,
        tariff: p.CoworkerContractTariffName,
        pauseFrom: p.PauseFrom?.slice(0, 10) || 'N/A',
        pauseUntil: p.PauseUntil.slice(0, 10),
        daysPast: daysBetween(p.PauseUntil, TODAY),
        fix: `nexudus coworkercontracts get --id ${safeId(p.CoworkerContractId)}`,
      });
    }
  }

  issues.sort((a, b) => b.daysPast - a.daysPast);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkFrozenContractsPastEndDate;
