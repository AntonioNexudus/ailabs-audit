// The onboarding check-in audit's check registry — mirrors check-defs.js's
// shape (num, key, name, fn) adapted for pass/warn/fail/skip semantics, with
// a `section` grouping title instead of a severity/tier. All checks always
// run (this audit has no depth tiers); onboarding-audit.js runs every entry
// in ONBOARDING_CHECK_DEFS in order.

const checkPlansPublished = require('./onboarding-checks/plansPublished');
const checkPlansPricingDescriptions = require('./onboarding-checks/plansPricingDescriptions');
const checkPlansFinancialSetup = require('./onboarding-checks/plansFinancialSetup');
const checkPlansBenefits = require('./onboarding-checks/plansBenefits');
const checkPlansMiscategorized = require('./onboarding-checks/plansMiscategorized');

const checkResourcesRates = require('./onboarding-checks/resourcesRates');
const checkResourcesDescCapacity = require('./onboarding-checks/resourcesDescCapacity');
const checkResourcesAmenities = require('./onboarding-checks/resourcesAmenities');
const checkResourcesBookingLimits = require('./onboarding-checks/resourcesBookingLimits');
const checkResourcesAccessHours = require('./onboarding-checks/resourcesAccessHours');

const checkLocationProfile = require('./onboarding-checks/locationProfile');
const checkLocationOpeningHours = require('./onboarding-checks/locationOpeningHours');
const checkLocationCoordinates = require('./onboarding-checks/locationCoordinates');
const checkPaymentGateway = require('./onboarding-checks/paymentGateway');
const checkTaxRatesConfigured = require('./onboarding-checks/taxRatesConfigured');
const checkTermsConditions = require('./onboarding-checks/termsConditions');

const checkHelpDeskManagers = require('./onboarding-checks/helpDeskManagers');

const checkInvoicedLastCycle = require('./onboarding-checks/invoicedLastCycle');
const checkUsageActivity = require('./onboarding-checks/usageActivity');
const checkHeavyDiscountContracts = require('./onboarding-checks/heavyDiscountContracts');
const checkStaleOnboardingDrafts = require('./onboarding-checks/staleOnboardingDrafts');
const checkOperatorsActive = require('./onboarding-checks/operatorsActive');

const SECTIONS = {
  PLANS: 'Plans & pricing',
  RESOURCES: 'Resources & rates',
  LOCATION: 'Location & portal basics',
  MEMBER_EXPERIENCE: 'Member experience readiness',
  HYGIENE: 'First-year hygiene',
};

const ONBOARDING_CHECK_DEFS = [
  { num: 1, key: 'plansPublished', name: 'Membership plans published & visible', section: SECTIONS.PLANS, fn: checkPlansPublished },
  { num: 2, key: 'plansPricingDescriptions', name: 'Plan pricing & descriptions complete', section: SECTIONS.PLANS, fn: checkPlansPricingDescriptions },
  { num: 3, key: 'plansFinancialSetup', name: 'Plans have tax rate & financial account assigned', section: SECTIONS.PLANS, fn: checkPlansFinancialSetup },
  { num: 4, key: 'plansBenefits', name: 'Plans have booking/printing credit benefits attached', section: SECTIONS.PLANS, fn: checkPlansBenefits },
  { num: 5, key: 'plansMiscategorized', name: 'Plan naming matches plan type', section: SECTIONS.PLANS, fn: checkPlansMiscategorized },

  { num: 6, key: 'resourcesRates', name: 'Bookable resources have a rate assigned', section: SECTIONS.RESOURCES, fn: checkResourcesRates },
  { num: 7, key: 'resourcesDescCapacity', name: 'Resource descriptions & capacity set', section: SECTIONS.RESOURCES, fn: checkResourcesDescCapacity },
  { num: 8, key: 'resourcesAmenities', name: 'Resource amenity flags set', section: SECTIONS.RESOURCES, fn: checkResourcesAmenities },
  { num: 9, key: 'resourcesBookingLimits', name: 'Resource booking limits configured', section: SECTIONS.RESOURCES, fn: checkResourcesBookingLimits },
  { num: 10, key: 'resourcesAccessHours', name: 'Resource access hours match opening hours', section: SECTIONS.RESOURCES, fn: checkResourcesAccessHours },

  { num: 11, key: 'locationProfile', name: 'Location profile complete', section: SECTIONS.LOCATION, fn: checkLocationProfile },
  { num: 12, key: 'locationOpeningHours', name: 'Opening hours configured', section: SECTIONS.LOCATION, fn: checkLocationOpeningHours },
  { num: 13, key: 'locationCoordinates', name: 'Location coordinates set', section: SECTIONS.LOCATION, fn: checkLocationCoordinates },
  { num: 14, key: 'paymentGateway', name: 'Payment gateway connected', section: SECTIONS.LOCATION, fn: checkPaymentGateway },
  { num: 15, key: 'taxRatesConfigured', name: 'Tax rates configured', section: SECTIONS.LOCATION, fn: checkTaxRatesConfigured },
  { num: 16, key: 'termsConditions', name: 'Terms & conditions / house rules set', section: SECTIONS.LOCATION, fn: checkTermsConditions },

  { num: 17, key: 'helpDeskManagers', name: 'Help-desk departments have managers assigned', section: SECTIONS.MEMBER_EXPERIENCE, fn: checkHelpDeskManagers },

  { num: 18, key: 'invoicedLastCycle', name: 'Active contracts billed on schedule', section: SECTIONS.HYGIENE, fn: checkInvoicedLastCycle },
  { num: 19, key: 'usageActivity', name: 'Space usage activity present', section: SECTIONS.HYGIENE, fn: checkUsageActivity },
  { num: 20, key: 'heavyDiscountContracts', name: 'No long-standing £0 contracts past go-live', section: SECTIONS.HYGIENE, fn: checkHeavyDiscountContracts },
  { num: 21, key: 'staleOnboardingDrafts', name: 'No stale draft invoices left over from onboarding', section: SECTIONS.HYGIENE, fn: checkStaleOnboardingDrafts },
  { num: 22, key: 'operatorsActive', name: 'Operators active in the last 30 days', section: SECTIONS.HYGIENE, fn: checkOperatorsActive },
];

module.exports = { ONBOARDING_CHECK_DEFS, SECTIONS };
