const { getTariffs } = require('../data');
const { names } = require('./_helpers');

// #2. Active plans should have a description (shown to prospects) and a
// non-zero price (a blank/£0 price on an active plan is usually a setup
// mistake, not an intentional free plan).
function checkPlansPricingDescriptions() {
  const active = getTariffs().filter(t => t && !t.Archived);
  if (active.length === 0) {
    return { status: 'skip', detail: 'No active membership plans to check.', hint: 'Create a membership plan first.' };
  }

  const noDesc = active.filter(t => !(t.Description || '').trim());
  const noPrice = active.filter(t => !(t.Price > 0));

  if (noDesc.length === 0 && noPrice.length === 0) {
    return {
      status: 'pass',
      detail: `All ${active.length} active plans have a description and a price set.`,
    };
  }

  const parts = [];
  if (noDesc.length > 0) parts.push(`${noDesc.length} of ${active.length} plans missing a description: ${names(noDesc)}`);
  if (noPrice.length > 0) parts.push(`${noPrice.length} of ${active.length} plans have no price (blank or £0): ${names(noPrice)}`);

  const allBlank = noDesc.length === active.length && noPrice.length === active.length;
  return {
    status: allBlank ? 'fail' : 'warn',
    detail: parts.join('\n'),
    hint: 'Add a description and a price to every active plan — prospects and the portal both need them to present the plan.',
  };
}

module.exports = checkPlansPricingDescriptions;
