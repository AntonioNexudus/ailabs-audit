const { getResources } = require('../data');
const { names } = require('./_helpers');

// #8. Visible resources with no amenity flags set at all — makes it
// impossible to answer "does it have a projector / whiteboard / AV?"
// Same flag list as samaudittoollocal's rooms_and_resources.py.
const AMENITY_FLAGS = [
  'Projector', 'Internet', 'ConferencePhone', 'StandardPhone', 'WhiteBoard',
  'LargeDisplay', 'Catering', 'TeaAndCoffee', 'AirConditioning', 'Heating',
  'NaturalLight', 'StandingDesk', 'QuietZone', 'Soundproof', 'VideoConferencing',
  'WirelessPresentation', 'PaSystem', 'FlipChart', 'SecurityLock', 'PrivacyScreen',
];

function amenityCount(r) {
  return AMENITY_FLAGS.reduce((n, f) => n + (r[f] ? 1 : 0), 0);
}

function checkResourcesAmenities() {
  const resources = getResources().filter(r => r && r.Visible && !r.Archived);
  if (resources.length === 0) {
    return { status: 'skip', detail: 'No visible, active resources to check.', hint: 'Create and publish bookable resources first.' };
  }

  const noAmenities = resources.filter(r => amenityCount(r) === 0);
  if (noAmenities.length === 0) {
    return {
      status: 'pass',
      detail: `All ${resources.length} visible resources have at least one amenity flag set.`,
    };
  }
  return {
    status: 'warn',
    detail: `${noAmenities.length} of ${resources.length} resources have no amenity flags set: ${names(noAmenities)}.`,
    hint: 'Set amenity flags (projector, whiteboard, Wi-Fi, etc.) on each resource so members and the portal can answer "what does this room have?"',
  };
}

module.exports = checkResourcesAmenities;
