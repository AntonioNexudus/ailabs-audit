const { parseIds, safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { getContracts, filterByBusiness } = require('../data');

// #1. Floorplan desks still assigned to cancelled contracts
function checkDesksOnCancelledContracts() {
  const contracts = getContracts();
  const cancelledIds = new Set();
  const cancelledMap = new Map();

  for (const c of contracts) {
    if (c.Cancelled) {
      cancelledIds.add(String(c.Id));
      cancelledMap.set(String(c.Id), c);
    }
  }

  if (cancelledIds.size === 0) return { status: 'PASS', items: [] };

  const desks = filterByBusiness(fetchAllPages(['floorplandesks', 'list']));
  const issues = [];

  for (const desk of desks) {
    const contractIds = parseIds(desk.CoworkerContractIds);
    for (const cid of contractIds) {
      if (cancelledIds.has(cid)) {
        const contract = cancelledMap.get(cid);
        issues.push({
          deskId: desk.Id,
          deskName: desk.Name,
          floorPlan: desk.FloorPlanName,
          coworkerId: contract?.CoworkerId,
          member: contract?.CoworkerFullName || desk.CoworkerFullName || 'Unknown',
          contractId: cid,
          cancelledOn: contract?.CancellationDate?.slice(0, 10) || 'N/A',
          fix: `nexudus floorplandesks update --id ${safeId(desk.Id)} --coworker-contract-ids ""`,
        });
      }
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkDesksOnCancelledContracts;
