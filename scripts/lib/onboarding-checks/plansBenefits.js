const { getTariffs, getTariffCredits } = require('../data');
const { names } = require('./_helpers');

// #4. Active, visible plans should have at least one non-zero booking/printing
// credit benefit attached (TariffBookingCredits) — plans with a benefits
// promise but nothing configured leave members with an empty allowance.
function checkPlansBenefits() {
  const active = getTariffs().filter(t => t && !t.Archived && t.Visible);
  if (active.length === 0) {
    return { status: 'skip', detail: 'No active, visible membership plans to check.', hint: 'Publish a membership plan first.' };
  }

  const tariffIdsWithBenefit = new Set();
  for (const c of getTariffCredits()) {
    if (c && c.Credit > 0 && c.TariffId != null) tariffIdsWithBenefit.add(c.TariffId);
  }

  const withoutBenefit = active.filter(t => !tariffIdsWithBenefit.has(t.Id));
  if (withoutBenefit.length === 0) {
    return {
      status: 'pass',
      detail: `All ${active.length} active plans have at least one non-zero benefit credit attached.`,
    };
  }
  if (withoutBenefit.length === active.length) {
    return {
      status: 'warn',
      detail: `None of the ${active.length} active plans have a booking/printing credit benefit attached.`,
      hint: 'If any plan is meant to include booking credits, printing credits, or day allowances, add them under the plan\'s Benefits/Credits section.',
    };
  }
  return {
    status: 'warn',
    detail: `${withoutBenefit.length} of ${active.length} active plans have no benefit credits attached: ${names(withoutBenefit)}.`,
    hint: 'Check whether these plans are meant to include booking/printing credits — if so, add them under the plan\'s Benefits/Credits section.',
  };
}

module.exports = checkPlansBenefits;
