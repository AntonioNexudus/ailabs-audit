const { getBusinesses, getPaymentGateways } = require('../data');
const { table } = require('./_helpers');

// #14. At least one payment gateway configured per business — without one,
// automated invoice collection cannot run. The CLI does not expose a
// live-vs-test-mode field, so that half of the check stays a manual hint.
function checkPaymentGateway() {
  const businesses = getBusinesses();
  if (businesses.length === 0) {
    return { status: 'skip', detail: 'No businesses in scope.' };
  }

  const gateways = getPaymentGateways();
  const countByBusiness = new Map();
  for (const g of gateways) {
    if (g && g.BusinessId != null) {
      countByBusiness.set(String(g.BusinessId), (countByBusiness.get(String(g.BusinessId)) || 0) + 1);
    }
  }

  const missing = businesses.filter(b => !countByBusiness.get(String(b.Id)));
  if (missing.length === 0) {
    return {
      status: 'pass',
      detail: `All ${businesses.length} business${businesses.length !== 1 ? 'es have' : ' has'} at least one payment gateway configured.`,
      hint: null,
    };
  }
  return {
    status: missing.length === businesses.length ? 'fail' : 'warn',
    detail: table(['Business', 'Payment gateway'], missing.map(b => [b.Name || `#${b.Id}`, 'None configured'])),
    hint: 'Open Settings > Payments and connect a payment gateway. Also confirm live (not sandbox/test) mode manually — the CLI does not expose that setting.',
  };
}

module.exports = checkPaymentGateway;
