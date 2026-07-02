const { getTimepasses } = require('../data');
const { names } = require('./_helpers');

// #25. Time-pass catalog readiness — a day/hour-pass parallel to
// plansPublished.js/plansPricingDescriptions.js, applied to `timepasses`, an
// entity never audited before this check.
//
// DEVIATION FROM PLAN: the brainstorm assumed this entity would mirror plans'
// published/visible + description + price shape exactly. Confirmed via
// `nexudus timepasses list --help`, it does not: there is no --visible and no
// --description filter for timepasses (unlike tariffs, which have both). The
// confirmed completeness fields are --price and --minutes-included instead
// (plus --archived for the active/inactive state) — so this check uses those
// two signals rather than description/visibility, which don't exist on this
// entity.
function checkTimepassesReadiness() {
  const active = getTimepasses().filter(t => t && !t.Archived);
  if (active.length === 0) {
    return {
      status: 'skip',
      detail: 'No active time-passes found for this scope.',
      hint: 'Create a time-pass (Inventory > Time-passes) if you want to sell short-term day/hour access.',
    };
  }

  const noPrice = active.filter(t => !(t.Price > 0));
  const noMinutes = active.filter(t => !(t.MinutesIncluded > 0));

  if (noPrice.length === 0 && noMinutes.length === 0) {
    return {
      status: 'pass',
      detail: `All ${active.length} active time-pass${active.length !== 1 ? 'es have' : ' has'} a price and included minutes set.`,
    };
  }

  const parts = [];
  if (noPrice.length > 0) parts.push(`${noPrice.length} of ${active.length} time-passes have no price (blank or £0): ${names(noPrice)}`);
  if (noMinutes.length > 0) parts.push(`${noMinutes.length} of ${active.length} time-passes have no included minutes set: ${names(noMinutes)}`);

  // OR, not AND: if either signal is 100% missing (e.g. every active
  // time-pass has no price, even if minutes-included is fine), that one
  // signal being completely broken already warrants 'fail' — it doesn't take
  // both being 100% broken at once.
  const allBlank = noPrice.length === active.length || noMinutes.length === active.length;
  return {
    status: allBlank ? 'fail' : 'warn',
    detail: parts.join('\n'),
    hint: 'Set Price and Minutes Included on every active time-pass (Inventory > Time-passes) — both are required for the portal to sell and redeem it correctly.',
  };
}

module.exports = checkTimepassesReadiness;
