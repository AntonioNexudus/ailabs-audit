const { safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { filterByBusiness } = require('../data');

// #31. Resources with no booking rate — potentially misconfigured as free for everyone
function checkResourcesNoPricing() {
  const resources = filterByBusiness(fetchAllPages(['resources', 'list']));
  const extraServices = filterByBusiness(fetchAllPages(['extraservices', 'list']));

  const typesWithRates = new Set();
  for (const es of extraServices) {
    if (es.ResourceTypeNames) {
      for (const name of es.ResourceTypeNames.split(',')) {
        typesWithRates.add(name.trim());
      }
    }
  }

  const issues = [];
  for (const r of resources) {
    if (r.Archived) continue;
    if (!r.ResourceTypeName || !typesWithRates.has(r.ResourceTypeName.trim())) {
      issues.push({
        id: r.Id,
        name: r.Name,
        business: r.BusinessName,
        type: r.ResourceTypeName || 'N/A',
        fix: `nexudus resources get --id ${safeId(r.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkResourcesNoPricing;
