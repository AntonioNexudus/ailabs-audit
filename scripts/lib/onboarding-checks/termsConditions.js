const { getBusinesses } = require('../data');
const { table } = require('./_helpers');

// #16. Business-level Terms field set — the general terms/house rules text
// shown to members (distinct from per-plan contract terms).
function checkTermsConditions() {
  const businesses = getBusinesses();
  if (businesses.length === 0) {
    return { status: 'skip', detail: 'No businesses in scope.' };
  }

  const missing = businesses.filter(b => !String(b.Terms || '').trim());
  if (missing.length === 0) {
    return {
      status: 'pass',
      detail: `All ${businesses.length} business${businesses.length !== 1 ? 'es have' : ' has'} terms & conditions set.`,
    };
  }
  return {
    status: missing.length === businesses.length ? 'fail' : 'warn',
    detail: table(['Business', 'Terms & conditions'], missing.map(b => [b.Name || `#${b.Id}`, 'Not set'])),
    hint: 'Set the Terms field on the business profile (Settings > Locations) so members see your house rules/terms during sign-up.',
  };
}

module.exports = checkTermsConditions;
