const { getTariffs } = require('../data');
const { names } = require('./_helpers');

// #3. Active plans missing a tax rate or financial account — invoices raised
// off these plans won't map cleanly into accounting/reporting.
function checkPlansFinancialSetup() {
  const active = getTariffs().filter(t => t && !t.Archived);
  if (active.length === 0) {
    return { status: 'skip', detail: 'No active membership plans to check.', hint: 'Create a membership plan first.' };
  }

  const missing = active.filter(t => !t.TaxRateId || !t.FinancialAccountId);
  if (missing.length === 0) {
    return {
      status: 'pass',
      detail: `All ${active.length} active plans have a tax rate and financial account assigned.`,
    };
  }
  return {
    status: missing.length === active.length ? 'fail' : 'warn',
    detail: `${missing.length} of ${active.length} plans are missing a tax rate and/or financial account: ${names(missing)}.`,
    hint: 'Open Finance > Invoices & tax > Chart of Accounts and assign a tax rate and financial account to every active plan so invoices post correctly.',
  };
}

module.exports = checkPlansFinancialSetup;
