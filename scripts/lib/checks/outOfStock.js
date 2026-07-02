const { safeId } = require('../util');
const { getProducts } = require('../data');

// #7. Products with depleted stock that could block invoicing
function checkProductsOutOfStock() {
  const products = getProducts();
  const issues = [];

  for (const p of products) {
    if (p.TrackStock && !p.Archived && !p.AllowNegativeStock && (p.CurrentStock ?? 0) <= 0) {
      issues.push({
        id: p.Id,
        name: p.Name,
        business: p.BusinessName,
        stock: p.CurrentStock ?? 0,
        fix: `nexudus products get --id ${safeId(p.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkProductsOutOfStock;
