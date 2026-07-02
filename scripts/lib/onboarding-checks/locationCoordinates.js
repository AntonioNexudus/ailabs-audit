const { getBusinesses } = require('../data');
const { table } = require('./_helpers');

// #13. Latitude/longitude set on the business profile — enables distance
// ordering/geosearch on the portal and any location-aware AI surfaces.
function checkLocationCoordinates() {
  const businesses = getBusinesses();
  if (businesses.length === 0) {
    return { status: 'skip', detail: 'No businesses in scope.' };
  }

  const missing = businesses.filter(b => {
    const lat = b.Latitude, lng = b.Longitude;
    // A genuine coordinate can legitimately be 0 (e.g. longitude 0 near the
    // Prime Meridian) — only flag when both are unset or both are exactly 0
    // (the "never configured" default), not whenever either happens to be 0.
    return !(lat != null && lng != null && !(lat === 0 && lng === 0));
  });

  if (missing.length === 0) {
    return {
      status: 'pass',
      detail: `All ${businesses.length} business${businesses.length !== 1 ? 'es have' : ' has'} coordinates set.`,
    };
  }
  return {
    status: 'warn',
    detail: table(['Business', 'Coordinates'], missing.map(b => [b.Name || `#${b.Id}`, 'Not set'])),
    hint: 'Set Latitude/Longitude on the business profile (Settings > Locations) so distance-based search/ordering works.',
  };
}

module.exports = checkLocationCoordinates;
