const { safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { getContracts } = require('../data');

// #10. Refundable deposits on cancelled contracts — may need refund processing
function checkDepositsOnCancelledContracts() {
  // contractdeposits has no BusinessId; the business filter is applied
  // indirectly via the cancelled-contract join below (getContracts() is
  // already business-filtered, so deposits referencing other businesses'
  // contracts won't appear in cancelledContractIds and get dropped).
  const deposits = fetchAllPages(['contractdeposits', 'list']);
  if (deposits.length === 0) return { status: 'PASS', items: [] };

  const contracts = getContracts();
  const cancelledContractIds = new Set();
  const contractMap = new Map();
  for (const c of contracts) {
    if (c.Cancelled) {
      cancelledContractIds.add(c.Id);
      contractMap.set(c.Id, c);
    }
  }

  const issues = [];
  for (const dep of deposits) {
    if (dep.Refundable && cancelledContractIds.has(dep.CoworkerContractId)) {
      const contract = contractMap.get(dep.CoworkerContractId);
      issues.push({
        depositId: dep.Id,
        product: dep.ProductName,
        price: dep.Price,
        contractId: dep.CoworkerContractId,
        coworkerId: contract?.CoworkerId,
        member: contract?.CoworkerFullName || 'Unknown',
        tariff: contract?.TariffName || 'Unknown',
        fix: `nexudus contractdeposits get --id ${safeId(dep.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkDepositsOnCancelledContracts;
