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
  MEMBER_EXPERIENCE: 'Member experience',
  HYGIENE: 'Settling-in checks',
  FINANCIAL_COMPLIANCE: 'Money & compliance',
  INTEGRATIONS: 'Integrations & setup',
};

const ONBOARDING_CHECK_DEFS = [
  { num: 1, key: 'plansPublished', name: 'Membership plans published & visible', section: SECTIONS.PLANS, fn: checkPlansPublished },
  { num: 2, key: 'plansPricingDescriptions', name: 'Plan pricing & descriptions complete', section: SECTIONS.PLANS, fn: checkPlansPricingDescriptions },
  { num: 3, key: 'plansFinancialSetup', name: 'Plans have a tax rate and account assigned', section: SECTIONS.PLANS, fn: checkPlansFinancialSetup },
  { num: 4, key: 'plansBenefits', name: 'Plans include their booking and printing credits', section: SECTIONS.PLANS, fn: checkPlansBenefits },
  { num: 5, key: 'plansMiscategorized', name: 'Plan names match what the plan actually is', section: SECTIONS.PLANS, fn: checkPlansMiscategorized },

  { num: 6, key: 'resourcesRates', name: 'Bookable resources have a rate assigned', section: SECTIONS.RESOURCES, fn: checkResourcesRates },
  { num: 7, key: 'resourcesDescCapacity', name: 'Resources have a description and capacity', section: SECTIONS.RESOURCES, fn: checkResourcesDescCapacity },
  { num: 8, key: 'resourcesAmenities', name: 'Resource amenities are filled in', section: SECTIONS.RESOURCES, fn: checkResourcesAmenities },
  { num: 9, key: 'resourcesBookingLimits', name: 'Resource booking limits are set', section: SECTIONS.RESOURCES, fn: checkResourcesBookingLimits },
  { num: 10, key: 'resourcesAccessHours', name: 'Resource access hours line up with opening hours', section: SECTIONS.RESOURCES, fn: checkResourcesAccessHours },

  { num: 11, key: 'locationProfile', name: 'Location profile is complete', section: SECTIONS.LOCATION, fn: checkLocationProfile },
  { num: 12, key: 'locationOpeningHours', name: 'Opening hours are set', section: SECTIONS.LOCATION, fn: checkLocationOpeningHours },
  { num: 13, key: 'locationCoordinates', name: 'Location is pinned on the map', section: SECTIONS.LOCATION, fn: checkLocationCoordinates },
  { num: 14, key: 'paymentGateway', name: 'A payment gateway is connected', section: SECTIONS.LOCATION, fn: checkPaymentGateway },
  { num: 15, key: 'taxRatesConfigured', name: 'Tax rates are set up', section: SECTIONS.LOCATION, fn: checkTaxRatesConfigured },
  { num: 16, key: 'termsConditions', name: 'Terms and house rules are in place', section: SECTIONS.LOCATION, fn: checkTermsConditions },

  { num: 17, key: 'helpDeskManagers', name: 'Help-desk departments have a manager', section: SECTIONS.MEMBER_EXPERIENCE, fn: checkHelpDeskManagers },

  { num: 18, key: 'invoicedLastCycle', name: 'Active contracts billed on schedule', section: SECTIONS.HYGIENE, fn: checkInvoicedLastCycle },
  { num: 19, key: 'usageActivity', name: 'Members are actually using the space', section: SECTIONS.HYGIENE, fn: checkUsageActivity },
  { num: 20, key: 'heavyDiscountContracts', name: 'No long-running £0 contracts since opening', section: SECTIONS.HYGIENE, fn: checkHeavyDiscountContracts },
  { num: 21, key: 'staleOnboardingDrafts', name: 'No leftover draft invoices from onboarding', section: SECTIONS.HYGIENE, fn: checkStaleOnboardingDrafts },
  { num: 22, key: 'operatorsActive', name: 'Operators active in the last 30 days', section: SECTIONS.HYGIENE, fn: checkOperatorsActive },

  { num: 23, key: 'eventAttendeesUnbilled', name: 'Event attendees checked in but never billed', section: SECTIONS.FINANCIAL_COMPLIANCE, fn: checkEventAttendeesUnbilled },
  { num: 24, key: 'contractContactsAmlMissing', name: 'Contract signers missing AML/KYC checks', section: SECTIONS.FINANCIAL_COMPLIANCE, fn: checkContractContactsAmlMissing },
  { num: 25, key: 'timepassesReadiness', name: 'Time passes are ready to sell', section: SECTIONS.FINANCIAL_COMPLIANCE, fn: checkTimepassesReadiness },

  { num: 26, key: 'webhooksInactive', name: 'Webhooks that are switched off or broken', section: SECTIONS.INTEGRATIONS, fn: checkWebhooksInactive },
  { num: 27, key: 'validationRulesInactive', name: 'Validation rules that are switched off', section: SECTIONS.INTEGRATIONS, fn: checkValidationRulesInactive },
  { num: 28, key: 'customFieldsUnusedRequired', name: "Required custom fields that don't appear on any form", section: SECTIONS.INTEGRATIONS, fn: checkCustomFieldsUnusedRequired },

  { num: 29, key: 'resourcesNoBookingPolicy', name: 'Bookable resources with no booking policy', section: SECTIONS.RESOURCES, fn: checkResourcesNoBookingPolicy },
  { num: 30, key: 'resourcesBookingPolicyIncomplete', name: 'Booking policies missing key limits', section: SECTIONS.RESOURCES, fn: checkResourcesBookingPolicyIncomplete },
];

module.exports = { ONBOARDING_CHECK_DEFS, SECTIONS };
