const { getBusinesses } = require('../data');
const { table } = require('./_helpers');

// #11. Core location profile fields — address, city, postcode, country,
// phone, email — the same fields samaudittoollocal's location check reads.
// A «PII:...» token (redacted run) still counts as "present".
function isPresent(val) {
  const v = String(val || '').trim();
  return v.length > 0;
}

function checkLocationProfile() {
  const businesses = getBusinesses();
  if (businesses.length === 0) {
    return { status: 'skip', detail: 'No businesses in scope.' };
  }

  const FIELD_MAP = [
    ['Address', b => b.Address],
    ['City', b => b.TownCity],
    ['Postcode', b => b.PostalCode],
    ['Country', b => b.CountryName],
    ['Phone', b => b.Phone],
    ['Email', b => b.EmailContact || b.ContactEmail],
  ];

  const rows = [];
  let incompleteCount = 0;
  for (const biz of businesses) {
    const missing = FIELD_MAP.filter(([, get]) => !isPresent(get(biz))).map(([label]) => label);
    if (missing.length > 0) {
      incompleteCount++;
      rows.push([biz.Name || `#${biz.Id}`, missing.join(', ')]);
    }
  }

  if (rows.length === 0) {
    return {
      status: 'pass',
      detail: `All ${businesses.length} business${businesses.length !== 1 ? 'es have' : ' has'} a complete location profile (address, city, postcode, country, phone, email).`,
    };
  }
  return {
    status: incompleteCount === businesses.length ? 'fail' : 'warn',
    detail: table(['Business', 'Missing fields'], rows),
    hint: 'Fill in the missing fields on the business profile (Settings > Locations) — the portal and any AI-facing surfaces read them directly.',
  };
}

module.exports = checkLocationProfile;
