const { safeId } = require('../util');
const { getProducts, getTariffs } = require('../data');

// #15. Plans/products missing tax rate or financial account — breaks accounting integrations
function checkMissingTaxOrFinancialAccount() {
  const products = getProducts();
  const tariffs = getTariffs();
  const issues = [];

  for (const p of products) {
    if (p.Archived) continue;
    const missing = [];
    if (!p.TaxRateId) missing.push('tax rate');
    if (!p.FinancialAccountId) missing.push('financial account');
    if (missing.length > 0) {
      issues.push({
        type: 'Product',
        id: p.Id,
        name: p.Name,
        business: p.BusinessName,
        missing: missing.join(', '),
        fix: `nexudus products get --id ${safeId(p.Id)}`,
      });
    }
  }

  for (const t of tariffs) {
    if (t.Archived) continue;
    const missing = [];
    if (!t.TaxRateId) missing.push('tax rate');
    if (!t.FinancialAccountId) missing.push('financial account');
    if (missing.length > 0) {
      issues.push({
        type: 'Plan',
        id: t.Id,
        name: t.Name,
        business: t.BusinessName,
        missing: missing.join(', '),
        fix: `nexudus tariffs get --id ${safeId(t.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkMissingTaxOrFinancialAccount;
