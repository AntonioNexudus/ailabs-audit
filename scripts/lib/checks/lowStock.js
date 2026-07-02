const { safeId } = require('../util');
const { getProducts } = require('../data');

// #20. Products at or below their low-stock alert threshold
function checkProductsLowStock() {
  const products = getProducts();
  const issues = [];

  for (const p of products) {
    if (p.TrackStock && !p.Archived && p.StockAlertLevel > 0 && p.CurrentStock > 0 && p.CurrentStock <= p.StockAlertLevel) {
      issues.push({
        id: p.Id,
        name: p.Name,
        business: p.BusinessName,
        stock: p.CurrentStock,
        alertLevel: p.StockAlertLevel,
        fix: `nexudus products get --id ${safeId(p.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkProductsLowStock;
