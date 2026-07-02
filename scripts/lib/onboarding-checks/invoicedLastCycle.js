const { getContracts } = require('../data');
const { daysBetween } = require('../util');
const { TODAY } = require('../config');
const { table } = require('./_helpers');

// #18. Members are actually being invoiced. A global "was any invoice raised
// account-wide in the last N days" window (the original approach here) false-
// fails constantly on real accounts: contracts bill on their own staggered
// per-contract cycle (InvoicedPeriod), so an arbitrary trailing window can
// easily contain zero invoices even when billing is healthy. Instead reuse
// the exact per-contract signal the account-health audit's #4 billingBehind
// check already validated: InvoicedPeriod in the past means that specific
// contract's billing has stalled, independent of any other contract's cycle.
function checkInvoicedLastCycle() {
  const activeContracts = getContracts().filter(c => c && !c.Cancelled);
  if (activeContracts.length === 0) {
    return { status: 'skip', detail: 'No active contracts in scope — nothing to invoice yet.' };
  }

  const behind = activeContracts.filter(c => c.InvoicedPeriod && new Date(c.InvoicedPeriod) < TODAY);

  if (behind.length === 0) {
    return {
      status: 'pass',
      detail: `All ${activeContracts.length} active contract${activeContracts.length !== 1 ? 's are' : ' is'} invoiced through their current period.`,
    };
  }
  behind.sort((a, b) => daysBetween(b.InvoicedPeriod, TODAY) - daysBetween(a.InvoicedPeriod, TODAY));
  return {
    status: 'fail',
    detail: table(
      ['Member', 'Plan', 'Invoiced period', 'Days behind'],
      behind.map(c => [c.CoworkerFullName || `#${c.CoworkerId}`, c.TariffName || '—', c.InvoicedPeriod.slice(0, 10), String(daysBetween(c.InvoicedPeriod, TODAY))]),
    ),
    hint: 'Open Finance > Contracts and check each contract\'s Next Invoice Date — billing has stalled for these contracts. See also the "contracts with billing behind" check in the account-health audit.',
  };
}

module.exports = checkInvoicedLastCycle;
