const { TODAY } = require('../config');
const { daysBetween, safeId } = require('../util');
const { getContracts } = require('../data');

// #4. Active contracts where InvoicedPeriod is in the past — billing has stalled
function checkContractsBillingBehind() {
  const contracts = getContracts();
  const issues = [];

  for (const c of contracts) {
    if (!c.Cancelled && c.InvoicedPeriod && new Date(c.InvoicedPeriod) < TODAY) {
      issues.push({
        contractId: c.Id,
        member: c.CoworkerFullName,
        tariff: c.TariffName,
        invoicedPeriod: c.InvoicedPeriod.slice(0, 10),
        daysBehind: daysBetween(c.InvoicedPeriod, TODAY),
        fix: `nexudus coworkercontracts get --id ${safeId(c.Id)}`,
      });
    }
  }

  issues.sort((a, b) => b.daysBehind - a.daysBehind);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkContractsBillingBehind;
