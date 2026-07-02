const { safeId } = require('../util');
const { getContracts, getCoworkersActive, getPaymentMethods } = require('../data');

// #18. Active members on paid plans with no payment method on file
function checkMembersNoPaymentMethod() {
  const activeCoworkers = getCoworkersActive();
  const paymentMethods = getPaymentMethods();
  const issues = [];

  const hasPayment = new Set(paymentMethods.map(pm => pm.CoworkerId));

  const contracts = getContracts();
  const activeContractsByCoworker = new Map();
  for (const c of contracts) {
    if (!c.Cancelled && c.TariffPrice > 0) {
      if (!activeContractsByCoworker.has(c.CoworkerId)) {
        activeContractsByCoworker.set(c.CoworkerId, []);
      }
      activeContractsByCoworker.get(c.CoworkerId).push(c);
    }
  }

  for (const cw of activeCoworkers) {
    if (hasPayment.has(cw.Id)) continue;
    const paidContracts = activeContractsByCoworker.get(cw.Id) || [];
    if (paidContracts.length === 0) continue;

    issues.push({
      coworkerId: cw.Id,
      member: cw.FullName,
      email: cw.Email,
      tariff: paidContracts[0].TariffName,
      price: paidContracts[0].TariffPrice,
      fix: `nexudus coworkers get --id ${safeId(cw.Id)}`,
    });
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkMembersNoPaymentMethod;
