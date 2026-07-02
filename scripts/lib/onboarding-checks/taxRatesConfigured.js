const { getBusinesses, getTaxRates } = require('../data');
const { table } = require('./_helpers');

// #15. At least one tax rate configured per business — plans/products/rates
// all need one assigned (see checkPlansFinancialSetup), so if the account has
// none defined at all, that's the root cause.
function checkTaxRatesConfigured() {
  const businesses = getBusinesses();
  if (businesses.length === 0) {
    return { status: 'skip', detail: 'No businesses in scope.' };
  }

  const rates = getTaxRates();
  const countByBusiness = new Map();
  for (const r of rates) {
    if (r && r.BusinessId != null) {
      countByBusiness.set(String(r.BusinessId), (countByBusiness.get(String(r.BusinessId)) || 0) + 1);
    }
  }

  const missing = businesses.filter(b => !countByBusiness.get(String(b.Id)));
  if (missing.length === 0) {
    return {
      status: 'pass',
      detail: `All ${businesses.length} business${businesses.length !== 1 ? 'es have' : ' has'} at least one tax rate configured (${rates.length} total).`,
    };
  }
  return {
    status: missing.length === businesses.length ? 'fail' : 'warn',
    detail: table(['Business', 'Tax rates'], missing.map(b => [b.Name || `#${b.Id}`, 'None configured'])),
    hint: 'Open Finance > Invoices & tax > Tax Rates and add at least one rate — plans, products, and rates all need one assigned.',
  };
}

module.exports = checkTaxRatesConfigured;
