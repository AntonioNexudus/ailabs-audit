const { safeId } = require('../util');
const { getContracts } = require('../data');

// #34. Duplicate contracts — same member on same tariff (non-cancelled)
function checkDuplicateContracts() {
  const contracts = getContracts();
  const groups = new Map();

  for (const c of contracts) {
    if (c.Cancelled) continue;
    const key = `${c.CoworkerId}::${c.TariffId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const issues = [];
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    for (const c of group) {
      issues.push({
        contractId: c.Id,
        member: c.CoworkerFullName,
        tariff: c.TariffName,
        startDate: c.StartDate?.slice(0, 10) || 'N/A',
        count: group.length,
        fix: `nexudus coworkercontracts get --id ${safeId(c.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkDuplicateContracts;
