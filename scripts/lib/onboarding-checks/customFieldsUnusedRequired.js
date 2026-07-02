const { getCustomFields } = require('../data');
const { table } = require('./_helpers');

// #28. Required custom fields not surfaced on any form/surface — a field
// nothing can ever populate through the UI.
//
// DEVIATION FROM PLAN: the brainstorm assumed 9 `--display-in-*-form` flags
// (sign-up, profile, tour, event/product/team/course/tariff/booking sign-up).
// Confirmed via `nexudus customfields list --help`, there are actually 13
// display/visibility surfaces, including two the plan didn't account for
// (`--display-in-public-profile`, `--display-in-directory-search`,
// `--display-in-resource-search`) and one naming inconsistency
// (`--show-in-booking-form`, not `--display-in-booking-form` — a *separate*
// flag from `--display-in-booking-sign-up-form`). All 13 confirmed flags are
// used here; using only the plan's assumed 9 would have false-flagged a
// required field that's shown only via directory/resource search or the
// public profile, none of which are "sign-up forms" but are all legitimate
// ways a value could be populated/seen.
const DISPLAY_FIELDS = [
  'DisplayInPublicProfile',
  'DisplayInDirectorySearch',
  'DisplayInSignUpForm',
  'DisplayInProfileForm',
  'DisplayInTourForm',
  'DisplayInEventSignUpForm',
  'ShowInBookingForm',
  'DisplayInProductSignUpForm',
  'DisplayInTeamSignUpForm',
  'DisplayInCourseSignUpForm',
  'DisplayInTariffSignUpForm',
  'DisplayInBookingSignUpForm',
  'DisplayInResourceSearch',
];

function checkCustomFieldsUnusedRequired() {
  const fields = getCustomFields();
  const required = fields.filter(f => f && f.Required);
  if (required.length === 0) {
    return { status: 'skip', detail: 'No required custom fields configured for this scope.' };
  }

  const unused = required.filter(f => !DISPLAY_FIELDS.some(flag => f[flag]));
  if (unused.length === 0) {
    return {
      status: 'pass',
      detail: `All ${required.length} required custom field${required.length !== 1 ? 's are' : ' is'} shown on at least one form or surface.`,
    };
  }
  return {
    status: unused.length === required.length ? 'fail' : 'warn',
    detail: table(
      ['Field', 'Record type', 'Group'],
      unused.map(f => [f.Name || `#${f.Id}`, f.RecordType || '—', f.GroupName || '—']),
    ),
    hint: 'Open Settings > Custom Fields and enable at least one display surface (sign-up form, profile form, directory search, etc.) for these required fields, or uncheck Required if the field is intentionally hidden — as configured, nobody can ever populate them.',
  };
}

module.exports = checkCustomFieldsUnusedRequired;
