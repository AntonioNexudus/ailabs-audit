const { safeId } = require('../util');
const { getDiscountCodes } = require('../data');

// #30. Discount codes with impossible date range (ValidFrom > ValidTo)
function checkDiscountCodesInvalidDateRange() {
  const codes = getDiscountCodes();
  const issues = [];

  for (const code of codes) {
    if (code.ValidFrom && code.ValidTo && new Date(code.ValidFrom) > new Date(code.ValidTo)) {
      issues.push({
        id: code.Id,
        code: code.Code,
        description: code.Description || '',
        validFrom: code.ValidFrom.slice(0, 10),
        validTo: code.ValidTo.slice(0, 10),
        fix: `nexudus discountcodes get --id ${safeId(code.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkDiscountCodesInvalidDateRange;
