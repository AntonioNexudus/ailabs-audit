const { getResources } = require('../data');
const { names } = require('./_helpers');

// #7. Visible resources should have a description and a capacity (Allocation)
// set — both are shown directly in room/desk cards on the portal.
function checkResourcesDescCapacity() {
  const resources = getResources().filter(r => r && r.Visible && !r.Archived);
  if (resources.length === 0) {
    return { status: 'skip', detail: 'No visible, active resources to check.', hint: 'Create and publish bookable resources first.' };
  }

  const noDesc = resources.filter(r => !(r.Description || '').trim());
  const noCap = resources.filter(r => !r.Allocation);

  if (noDesc.length === 0 && noCap.length === 0) {
    return {
      status: 'pass',
      detail: `All ${resources.length} visible resources have a description and capacity set.`,
    };
  }

  const parts = [];
  if (noDesc.length > 0) parts.push(`${noDesc.length} of ${resources.length} missing a description: ${names(noDesc)}`);
  if (noCap.length > 0) parts.push(`${noCap.length} of ${resources.length} missing capacity: ${names(noCap)}`);

  return {
    status: 'warn',
    detail: parts.join('\n'),
    hint: 'Add a description and set the Allocation field on every resource — both appear directly on the resource\'s portal card.',
  };
}

module.exports = checkResourcesDescCapacity;
