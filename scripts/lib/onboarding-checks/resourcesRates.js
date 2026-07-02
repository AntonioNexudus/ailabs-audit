const { getResources, getExtraServices } = require('../data');
const { names } = require('./_helpers');

// #6. Every visible, bookable resource should have at least one booking rate
// (ExtraService) covering its resource type — without one the AI/portal can't
// quote a price. Extends account-health check #31 (resourcesNoPricing) with
// pass/warn/fail semantics for the onboarding flow.
function checkResourcesRates() {
  const resources = getResources().filter(r => r && r.Visible && !r.Archived);
  if (resources.length === 0) {
    return { status: 'skip', detail: 'No visible, active resources to check.', hint: 'Create and publish bookable resources first.' };
  }

  const typesWithRates = new Set();
  for (const es of getExtraServices()) {
    if (es && es.ResourceTypeNames) {
      for (const name of String(es.ResourceTypeNames).split(',')) {
        const trimmed = name.trim();
        if (trimmed) typesWithRates.add(trimmed);
      }
    }
  }

  const noRate = resources.filter(r => !r.ResourceTypeName || !typesWithRates.has(String(r.ResourceTypeName).trim()));
  if (noRate.length === 0) {
    return {
      status: 'pass',
      detail: `All ${resources.length} visible resources have at least one booking rate configured.`,
    };
  }
  return {
    status: noRate.length === resources.length ? 'fail' : 'warn',
    detail: `${noRate.length} of ${resources.length} resources have no booking rate: ${names(noRate)}.`,
    hint: 'Open Inventory > Resources, select the resource\'s Rates tab, and add a rate for its resource type — without pricing nothing can quote a cost.',
  };
}

module.exports = checkResourcesRates;
