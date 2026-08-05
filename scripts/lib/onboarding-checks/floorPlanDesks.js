const { getBusinesses, getFloorPlans, getFloorPlanDesks } = require('../data');
const { table } = require('./_helpers');

// #32. Floor plan & desk mapping. A location with no floor plan can't show
// members where anything is, can't assign desks to contracts, and can't let
// anyone book a room from the portal map. This reports, per business, how many
// floor plans exist, how many units sit on them, and how many of those units
// are wired to a bookable Resource.
//
// CALIBRATION — deliberately NOT a per-unit rule. On a real tenant most units
// are plain desks (ItemType 1) that legitimately have no Resource link: only
// meeting rooms and similar bookables need one. Measured on the reference
// tenant, 17 of 81 units carry a ResourceId, so a "this unit is unlinked" rule
// would fire on ~80% of rows and be pure noise. Only the all-zero case — a
// business whose floor plans contain no resource-linked unit at all — is a
// real signal that the bookable side of the map was never wired up. Please
// don't "fix" this into a per-unit check.
function checkFloorPlanDesks() {
  // All three fetches degrade to skip rather than an errored check — including
  // getBusinesses(), which is warm by the time any check runs but is guarded
  // here anyway so one unreachable entity can't be reported differently from
  // another purely by which line it sits on.
  let businesses;
  try {
    businesses = getBusinesses();
  } catch (err) {
    return { status: 'skip', detail: `Could not fetch the business list: ${err.message}` };
  }
  if (businesses.length === 0) {
    return { status: 'skip', detail: 'No businesses in scope.' };
  }

  let plans;
  try {
    plans = getFloorPlans();
  } catch (err) {
    return { status: 'skip', detail: `Could not fetch floor plans: ${err.message}` };
  }

  let units;
  try {
    units = getFloorPlanDesks();
  } catch (err) {
    return { status: 'skip', detail: `Could not fetch floor-plan units: ${err.message}` };
  }

  const unitsByPlan = new Map();
  for (const u of units) {
    if (!u || u.FloorPlanId == null) continue;
    const key = String(u.FloorPlanId);
    if (!unitsByPlan.has(key)) unitsByPlan.set(key, []);
    unitsByPlan.get(key).push(u);
  }

  const rows = [];
  const noPlans = [];
  const emptyPlans = [];
  const noLinkedUnits = [];

  for (const biz of businesses) {
    const bizLabel = biz.Name || `#${biz.Id}`;
    const bizPlans = plans.filter(p => p && String(p.BusinessId) === String(biz.Id));

    let unitCount = 0;
    let linkedCount = 0;
    for (const plan of bizPlans) {
      const planUnits = unitsByPlan.get(String(plan.Id)) || [];
      if (planUnits.length === 0) emptyPlans.push(`${bizLabel} / ${plan.Name || `#${plan.Id}`}`);
      unitCount += planUnits.length;
      linkedCount += planUnits.filter(u => u.ResourceId != null).length;
    }

    if (bizPlans.length === 0) noPlans.push(bizLabel);
    // Guarded on unitCount so a business whose only floor plan is empty is
    // reported once (as an empty plan) rather than twice.
    else if (unitCount > 0 && linkedCount === 0) noLinkedUnits.push(bizLabel);

    rows.push([bizLabel, String(bizPlans.length), String(unitCount), String(linkedCount)]);
  }

  const detail = table(['Business', 'Floor plans', 'Units', 'Linked to a resource'], rows);

  // Build every applicable hint fragment, then pick the status. A multi-site
  // audit can hit more than one of these at once (one site with no plan, another
  // with an empty one) — the harsher status must not swallow the other findings.
  const parts = [];
  if (noPlans.length > 0) parts.push(`No floor plan at all for: ${noPlans.join(', ')}. Upload or draw the floor plan under Inventory > Floor Plans, add each desk, office and meeting room as a unit on it, then link the bookable ones to their matching Resource so members can pick them from the portal map.`);
  if (emptyPlans.length > 0) parts.push(`These floor plans have no units on them yet: ${emptyPlans.join(', ')}. Open each one under Inventory > Floor Plans and add the desks, offices and meeting rooms as units.`);
  if (noLinkedUnits.length > 0) parts.push(`None of the units for ${noLinkedUnits.join(', ')} are linked to a Resource, so nothing on that map can be booked. Open the bookable units (meeting rooms, hot desks you sell by the hour) and set their Resource.`);

  if (noPlans.length > 0) return { status: 'fail', detail, hint: parts.join(' ') };
  if (parts.length > 0) return { status: 'warn', detail, hint: parts.join(' ') };

  return { status: 'pass', detail };
}

module.exports = checkFloorPlanDesks;
