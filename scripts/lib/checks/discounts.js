const { TODAY } = require('../config');
const { daysBetween, safeId } = require('../util');
const { getDiscountCodes } = require('../data');

// #13. Expired discount codes still marked as active
function checkExpiredActiveDiscountCodes() {
  const codes = getDiscountCodes();
  const issues = [];

  for (const code of codes) {
    if (code.Active && code.ValidTo && new Date(code.ValidTo) < TODAY) {
      issues.push({
        id: code.Id,
        code: code.Code,
        description: code.Description || '',
        validTo: code.ValidTo.slice(0, 10),
        daysExpired: daysBetween(code.ValidTo, TODAY),
        fix: `nexudus discountcodes update --id ${safeId(code.Id)} --active false`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkExpiredActiveDiscountCodes;
