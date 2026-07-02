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

// Checks #23-30 (added after the original 22 — see onboarding-check-defs.js
// header comment and README's "Onboarding Check-in Audit" section for the
// grouping-by-Map guarantee that lets these append at the end of the array
// while still rendering under their thematic section).
const checkEventAttendeesUnbilled = require('./onboarding-checks/eventAttendeesUnbilled');
const checkContractContactsAmlMissing = require('./onboarding-checks/contractContactsAmlMissing');
const checkTimepassesReadiness = require('./onboarding-checks/timepassesReadiness');
const checkWebhooksInactive = require('./onboarding-checks/webhooksInactive');
const checkValidationRulesInactive = require('./onboarding-checks/validationRulesInactive');
const checkCustomFieldsUnusedRequired = require('./onboarding-checks/customFieldsUnusedRequired');
const checkResourcesNoBookingPolicy = require('./onboarding-checks/resourcesNoBookingPolicy');
const checkResourcesBookingPolicyIncomplete = require('./onboarding-checks/resourcesBookingPolicyIncomplete');

const SECTIONS = {
  PLANS: 'Plans & pricing',
  RESOURCES: 'Resources & rates',
  LOCATION: 'Location & portal basics',
  MEMBER_EXPERIENCE: 'Member experience readiness',
  HYGIENE: 'First-year hygiene',
  FINANCIAL_COMPLIANCE: 'Financial & compliance hygiene',
  INTEGRATIONS: 'Integrations & system config',
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

  { num: 23, key: 'eventAttendeesUnbilled', name: 'Event attendees checked-in but not billed', section: SECTIONS.FINANCIAL_COMPLIANCE, fn: checkEventAttendeesUnbilled },
  { num: 24, key: 'contractContactsAmlMissing', name: 'Contract signatories missing AML/KYC verification', section: SECTIONS.FINANCIAL_COMPLIANCE, fn: checkContractContactsAmlMissing },
  { num: 25, key: 'timepassesReadiness', name: 'Time-pass catalog readiness', section: SECTIONS.FINANCIAL_COMPLIANCE, fn: checkTimepassesReadiness },

  { num: 26, key: 'webhooksInactive', name: 'Inactive or broken webhooks', section: SECTIONS.INTEGRATIONS, fn: checkWebhooksInactive },
  { num: 27, key: 'validationRulesInactive', name: 'Inactive validation rules', section: SECTIONS.INTEGRATIONS, fn: checkValidationRulesInactive },
  { num: 28, key: 'customFieldsUnusedRequired', name: 'Required custom fields not shown on any form', section: SECTIONS.INTEGRATIONS, fn: checkCustomFieldsUnusedRequired },

  { num: 29, key: 'resourcesNoBookingPolicy', name: 'Bookable resources with no booking-policy rule', section: SECTIONS.RESOURCES, fn: checkResourcesNoBookingPolicy },
  { num: 30, key: 'resourcesBookingPolicyIncomplete', name: 'Booking-policy rules missing key limits', section: SECTIONS.RESOURCES, fn: checkResourcesBookingPolicyIncomplete },
];

module.exports = { ONBOARDING_CHECK_DEFS, SECTIONS };
