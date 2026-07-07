// The check registry: tier membership, prefetch dependencies, the per-check
// definitions (heading, columns, row renderer, fn) and the HTML remediation
// copy. Pulls each check function in from ./checks/<key>.js.

const { escPipe } = require('./util');
const { classifyCoworkerById } = require('./data');
const {
  DRAFT_STALE_DAYS, BOOKING_STALE_DAYS, CHECKIN_STALE_HOURS, CHARGE_STALE_DAYS,
  CONTRACT_LIMIT_WARNING, CONTRACT_LIMIT_MAX, STALE_OPERATOR_DAYS, UNASSIGNED_TICKET_DAYS,
} = require('./config');

const checkDesksOnCancelledContracts = require('./checks/desks');
const checkOverdueUnpaidInvoices = require('./checks/invoices');
const checkInactiveMembersWithActiveContracts = require('./checks/inactive');
const checkContractsBillingBehind = require('./checks/billingBehind');
const checkContractsStuckCancellation = require('./checks/stuckCancellation');
const checkInvoicesOverdue12Months = require('./checks/writeoff');
const checkProductsOutOfStock = require('./checks/outOfStock');
const checkArchivedMembersWithActiveContracts = require('./checks/archivedMembers');
const checkSuspendedContractsPastCancellation = require('./checks/suspendedStuckCancel');
const checkDepositsOnCancelledContracts = require('./checks/deposits');
const checkTeamPayingMemberNoPayment = require('./checks/teamNoPayment');
const checkFutureBookingsArchivedResources = require('./checks/futureBookingsArchived');
const checkExpiredActiveDiscountCodes = require('./checks/discounts');
const checkStaleDraftInvoices = require('./checks/drafts');
const checkMissingTaxOrFinancialAccount = require('./checks/missingTax');
const checkFrozenContractsPastEndDate = require('./checks/frozenPast');
const checkChargedUninvoicedBookings = require('./checks/uninvoicedBookings');
const checkMembersNoPaymentMethod = require('./checks/noPaymentMethod');
const checkContractLimitApproaching = require('./checks/contractLimit');
const checkProductsLowStock = require('./checks/lowStock');
const checkArchivedTariffsWithActiveContracts = require('./checks/archivedTariffs');
const checkUnclosedCheckins = require('./checks/unclosedCheckins');
const checkUninvoicedCharges = require('./checks/uninvoicedCharges');
const checkOverpaidInvoices = require('./checks/overpaidInvoices');
const checkStaleOperators = require('./checks/staleOperators');
const checkHelpDeskDeptsNoManagers = require('./checks/helpDeskDeptsNoManagers');
const checkUnassignedHelpDeskTickets = require('./checks/unassignedHelpDeskTickets');
const checkCreditsSetup = require('./checks/creditsSetup');
const checkPartialPayments = require('./checks/partialPayments');
const checkDiscountCodesInvalidDateRange = require('./checks/invalidDiscountDates');
const checkResourcesNoPricing = require('./checks/resourcesNoPricing');
const checkDuplicateEmails = require('./checks/duplicateEmails');
const checkContractPriceOverrides = require('./checks/priceOverrides');
const checkDuplicateContracts = require('./checks/duplicateContracts');

// ---------------------------------------------------------------------------
// Tier registry — which audit depth(s) include each check, by check number.
// Q = Quick (light data only), M = Medium (adds Coworker + contract pulls),
// T = Thorough (adds invoices, bookings, charges, checkins).
// ---------------------------------------------------------------------------

const CHECK_TIERS = {
  1: ['M', 'T'],          // desks
  2: ['T'],               // invoices
  3: ['M', 'T'],          // inactive
  4: ['M', 'T'],          // billingBehind
  5: ['M', 'T'],          // stuckCancellation
  6: ['T'],               // writeoff
  7: ['Q', 'M', 'T'],     // outOfStock
  8: ['M', 'T'],          // archivedMembers
  9: ['M', 'T'],          // suspendedStuckCancel
  10: ['M', 'T'],         // deposits
  11: ['M', 'T'],         // teamNoPayment
  12: ['T'],              // futureBookingsArchived
  13: ['Q', 'M', 'T'],    // discounts
  14: ['T'],              // drafts
  15: ['Q', 'M', 'T'],    // missingTax
  16: ['Q', 'M', 'T'],    // frozenPast
  17: ['T'],              // uninvoicedBookings
  18: ['M', 'T'],         // noPaymentMethod
  19: ['M', 'T'],         // contractLimit
  20: ['Q', 'M', 'T'],    // lowStock
  21: ['M', 'T'],         // archivedTariffs
  22: ['T'],              // unclosedCheckins
  23: ['T'],              // uninvoicedCharges
  24: ['T'],              // overpaidInvoices
  25: ['M', 'T'],         // staleOperators
  26: ['M', 'T'],         // helpDeskDeptsNoManagers
  27: ['T'],              // unassignedHelpDeskTickets
  28: ['M', 'T'],         // creditsSetup
  29: ['T'],              // partialPayments
  30: ['Q', 'M', 'T'],    // invalidDiscountDates
  31: ['Q', 'M', 'T'],    // resourcesNoPricing
  32: ['M', 'T'],         // duplicateEmails (INSIGHT)
  33: ['M', 'T'],         // priceOverrides (INSIGHT)
  34: ['M', 'T'],         // duplicateContracts (INSIGHT)
};

const TIER_LABEL = { Q: 'quick', M: 'medium', T: 'thorough' };
const LEVEL_TO_LETTER = { quick: 'Q', medium: 'M', thorough: 'T', q: 'Q', m: 'M', t: 'T' };

// Which prefetchable entities each check needs. Inline fetches inside checks
// (e.g. bookings, checkins, depts) are not prefetched — they run serially when
// the check executes, which is fine because they're each used by one check.
const CHECK_DEPS = {
  1: ['contracts'],
  2: ['invoices', 'contracts'],
  3: ['coworkersAll', 'contracts'],
  4: ['contracts'],
  5: ['contracts'],
  6: ['invoices', 'contracts'],
  7: ['products'],
  8: ['coworkersAll', 'contracts'],
  9: ['coworkersAll', 'contracts'],
  10: ['contracts'],
  11: ['teamsList', 'paymentMethods', 'coworkersAll'],
  12: [],
  13: ['discountCodes'],
  14: ['invoices'],
  15: ['products', 'tariffs'],
  16: ['contracts'],
  17: [],
  18: ['coworkersAll', 'paymentMethods', 'contracts'],
  19: ['contracts', 'coworkersAll'],
  20: ['products'],
  21: ['contracts', 'tariffs'],
  22: [],
  23: ['contracts'],
  24: ['invoices', 'contracts'],
  25: [],
  26: [],
  27: [],
  28: ['tariffCredits', 'productCredits', 'tariffs', 'products'],
  29: ['invoices'],
  30: ['discountCodes'],
  31: [],
  32: ['coworkersAll'],
  33: ['contracts', 'tariffs'],
  34: ['contracts'],
};

// ---------------------------------------------------------------------------
// Remediation copy for the branded HTML report: plain-English admin-UI
// guidance for each check, sourced from help.nexudus.com on 2026-05-07.
// Keyed off CHECK_DEFS[].key so the HTML builder can look up by check.
// `helpUrl: null` means no directly-relevant article was found; the steps are
// still grounded in adjacent docs.
// ---------------------------------------------------------------------------

const REMEDIATIONS = {
  desks: {
    steps: 'Open Finance > Contracts and locate each affected contract. In the contract\'s Price section, clear the desk under "Offices / desks" and click Save Changes. To assign the desk to a different active contract instead, open Inventory > Floor Plan Units, select the unit, go to its Contracts tab, and link the correct contract.',
    helpUrl: 'https://help.nexudus.com/docs/assigning-floor-plan-items-to-contracts',
  },
  invoices: {
    steps: 'Open Finance > Invoices and filter for "Due" status. For each overdue invoice, collect payment, adjust the Due on date via the quick-action menu to allow more time, or cancel the invoice if the debt should be written off. Cancellation raises a credit note that zeroes the coworker\'s ledger.',
    helpUrl: 'https://help.nexudus.com/docs/cancelling-invoices',
  },
  inactive: {
    steps: 'Open Operations > Members and contacts and locate each inactive member. Check their Sales > Contracts tab to identify the active contract(s). Cancel each active contract via the quick-action icon > Cancel contract. If the member should remain active, restore their status before cancelling or reassigning the contract.',
    helpUrl: 'https://help.nexudus.com/docs/suspending-customer-accounts',
  },
  billingBehind: {
    steps: 'Open Finance > Contracts and select the affected contract. In the Key Dates section, update Next Invoice Date to today (or the correct future date) and click Save Changes. This restarts automatic invoicing from that point forward.',
    helpUrl: 'https://help.nexudus.com/docs/understanding-contract-dates',
  },
  stuckCancellation: {
    steps: 'Open Finance > Contracts, locate the contract, click the three-dot icon, and select Cancel contract. Choose whether to issue a final invoice and confirm. If the member was suspended at the cancellation date, lift the suspension first via Operations > Members and contacts > Bulk actions > Suspend account, then cancel the contract.',
    helpUrl: 'https://help.nexudus.com/docs/canceling-contracts',
  },
  writeoff: {
    steps: 'Open Finance > Invoices and filter for Due invoices older than 12 months. In supported regions (Australia, UK, USA), select Void from the Bulk actions menu to remove the invoice and its ledger entry entirely. In other regions, use Cancel to issue an offsetting credit note instead.',
    helpUrl: 'https://help.nexudus.com/docs/voiding-invoices',
  },
  outOfStock: {
    steps: 'Open Inventory > Products, click the three-dot icon next to each out-of-stock product, and select Adjust stock. Enter a positive whole-number quantity and confirm. If physical stock is no longer being managed, open the product\'s Availability tab and disable stock tracking instead.',
    helpUrl: 'https://help.nexudus.com/docs/adjusting-products-stock',
  },
  archivedMembers: {
    steps: 'Open Operations > Members and contacts and locate each suspended member. Go to Sales > Contracts and cancel all active contracts via the quick-action Cancel contract option. If the member needs to be reactivated first, lift the suspension under Bulk actions > Suspend account, then cancel the contracts.',
    helpUrl: 'https://help.nexudus.com/docs/suspending-customer-accounts',
  },
  suspendedStuckCancel: {
    steps: 'Go to Operations > Members and contacts, select the member, and lift the suspension via Bulk actions > Suspend account. Then open Finance > Contracts, locate their contract, click Cancel contract, and set the cancellation to the intended date. Re-suspend the member afterwards if required.',
    helpUrl: 'https://help.nexudus.com/docs/suspending-customer-accounts',
  },
  deposits: {
    steps: 'Open Operations > Members and contacts, select the customer, and go to Sales > Products. In the Views menu choose Show all, locate the deposit product, click the invoice icon, check the deposit line, and click Refund item. Pick the refund method, then process the actual cash or card payout through your payment provider if needed.',
    helpUrl: 'https://help.nexudus.com/docs/refunding-deposits',
  },
  teamNoPayment: {
    steps: 'Open Operations > Teams, select the affected team, and on the Billing tab confirm which member is set as the paying customer. Open that member via Operations > Members and contacts, click Payments > Payment methods, and click Add payment method. Without one on file, the entire team\'s merged invoices will fail to collect.',
    helpUrl: 'https://help.nexudus.com/docs/merge-team-billing',
  },
  duplicateContracts: {
    steps: 'Open Finance > Contracts and filter by the affected member to see all their contracts. Confirm which contract is the duplicate (same plan, overlapping dates), open it, click the three-dot icon, and select Cancel contract. Cancel or credit any invoices linked to the duplicate contract under Finance > Invoices if charges need to be reversed.',
    helpUrl: 'https://help.nexudus.com/docs/editing-contracts',
  },
  futureBookingsArchived: {
    steps: 'Open Operations > Calendar and switch to the resource view (or filter by the archived resource) to see its future bookings. For each booking, either change the resource to an active equivalent or cancel the booking via the booking detail panel. Notify affected coworkers of the change.',
    helpUrl: 'https://help.nexudus.com/docs/editing-bookings',
  },
  discounts: {
    steps: 'Open Finance > Discounts > Discount Codes, click each expired but still-active code, and toggle off "This discount is active". Click Save Changes. If the code should keep running, switch to the Available dates tab and extend the end date instead.',
    helpUrl: 'https://help.nexudus.com/docs/adding-discount-codes',
  },
  drafts: {
    steps: 'Open Finance > Invoices and switch to the Draft Invoices view. Review each draft older than 7 days and either convert it to a proper invoice via the convert action, or delete it if no longer needed. Drafts cannot collect payment or appear on the member portal until converted.',
    helpUrl: 'https://help.nexudus.com/docs/creating-draft-invoices',
  },
  missingTax: {
    steps: 'Open Finance > Invoices & tax > Chart of Accounts. For each item missing a tax rate or financial account, click the icon in the Tax column to assign a rate, and the icon in the Accounts column to assign a financial account. Work through every tab (Products, Plans, Resources, Passes, Tickets) so accounting integrations stay accurate.',
    helpUrl: 'https://help.nexudus.com/docs/assigning-financial-accounts-to-inventory-items',
  },
  frozenPast: {
    steps: 'Open Finance > Contracts and locate contracts currently in a frozen/paused state with a freeze end date in the past. Open each one and use the unfreeze action in the contract detail view to resume normal billing. Invoicing restarts on the next billing cycle.',
    helpUrl: 'https://help.nexudus.com/docs/unfreezing-contracts-as-an-admin',
  },
  uninvoicedBookings: {
    steps: 'Open Operations > Members and contacts, select the affected coworker, and click the Bookings section under Sales. Click the quick-action icon next to each un-invoiced past booking and select Invoice booking. To prevent recurrence, toggle on "Invoice this booking when it is saved" when creating future bookings.',
    helpUrl: 'https://help.nexudus.com/docs/invoicing-bookings',
  },
  noPaymentMethod: {
    steps: 'Open Operations > Members and contacts, select the member, and click Payments > Payment methods. Click Add payment method, choose the provider (GoCardless, Stripe Direct Debit, or Stripe Legacy), enter the mandate or customer details, and Save. A valid method must be on file for automated invoice collection to run.',
    helpUrl: 'https://help.nexudus.com/docs/multiple-customer-payment-methods',
  },
  contractLimit: {
    steps: 'Open Finance > Contracts and filter by the affected member to list all their active contracts. Review whether any are redundant or can be consolidated, then cancel the unneeded ones via Cancel contract. Nexudus enforces a hard limit of 25 active contracts per member, so the count must drop below 25 to allow new contracts.',
    helpUrl: 'https://help.nexudus.com/docs/canceling-contracts',
  },
  lowStock: {
    steps: 'Open Inventory > Products, click the three-dot icon next to each low-stock product, and select Adjust stock. Enter a positive quantity to bring stock above the alert level. While there, open the Availability tab to confirm or adjust the alert threshold.',
    helpUrl: 'https://help.nexudus.com/docs/adjusting-products-stock',
  },
  archivedTariffs: {
    steps: 'Open Finance > Contracts and filter for the affected contracts. For each one on an archived plan, either cancel the contract or use the upgrade/downgrade option to move it onto an active plan. Archived plans can no longer be assigned to new contracts.',
    helpUrl: 'https://help.nexudus.com/docs/editing-contracts',
  },
  unclosedCheckins: {
    steps: 'Open Operations > Check-ins and filter or sort to find records with no checkout time older than 24 hours. Click each open record and manually enter a checkout time to close it, then save. Long-open check-ins distort utilisation reports and may affect time-pass deductions.',
    helpUrl: 'https://help.nexudus.com/docs/manually-checking-in-customers',
  },
  uninvoicedCharges: {
    steps: 'Open Finance > Invoices and click Add invoice. Select the affected member, pending charges on their account are pulled into the new invoice automatically. Review the line items, set any options needed, and click Save Changes to issue the invoice and clear the pending charges.',
    helpUrl: 'https://help.nexudus.com/docs/adding-invoices',
  },
  overpaidInvoices: {
    steps: 'Open Finance > Invoices and locate the overpaid invoice. Select the overpaid line item(s) and choose Credit line from the Bulk actions menu, the credit is applied automatically to the member\'s next invoice. If the member prefers a cash refund, use Refund item and process the payout through your payment provider.',
    helpUrl: 'https://help.nexudus.com/docs/crediting-invoices',
  },
  staleOperators: {
    steps: 'Open Settings > Users & Security > Users and locate admin accounts that haven\'t logged in for 90+ days. Click the user, open the Access tab, and either remove all roles to strip admin access or delete the account if it should be fully removed. Leaving dormant admin accounts active is a security risk.',
    helpUrl: 'https://help.nexudus.com/docs/editing-admin-access',
  },
  helpDeskDeptsNoManagers: {
    steps: 'Open Operations > Help-desk > Departments and click the department with no manager. Select one or more admins in the Department managers field and click Save Changes. Managers receive email notifications for every new ticket submitted to that department.',
    helpUrl: 'https://help.nexudus.com/docs/editing-help-desk-departments',
  },
  unassignedHelpDeskTickets: {
    steps: 'Open Operations > Help-desk to see all incoming tickets. Click each open ticket with no assignee, pick a staff member in the assignment field, set a priority, and save. Triaging unassigned tickets daily prevents coworker requests from going unanswered.',
    helpUrl: 'https://help.nexudus.com/docs/managing-help-desk-requests',
  },
  creditsSetup: {
    steps: 'Open Inventory > Plans (or Products) and edit the plan/product that releases the flagged credit, then open its Benefits / Credits section. For a credit that grants nothing, set a positive Credit amount. For a credit that can never be spent, enable at least one use — tick "Can be used for bookings" (and choose eligible resource types), "Can be used for events", or "Universal credit" (products, passes, and charges) — and Save. If the credit is obsolete, delete it so it stops releasing to members on renewal/purchase.',
    helpUrl: 'https://help.nexudus.com/docs/adding-benefits-to-plans',
  },
  partialPayments: {
    steps: 'Open Finance > Invoices and locate each invoice showing a partial payment balance. If the remainder should be collected, process a manual payment or wait for the next automated attempt. If the balance should be forgiven, credit or cancel the outstanding portion via the invoice\'s Bulk actions menu so the invoice resolves cleanly.',
    helpUrl: 'https://help.nexudus.com/docs/crediting-invoices',
  },
  invalidDiscountDates: {
    steps: 'Open Finance > Discounts > Discount Codes and click each code with the impossible date range. On the Available dates tab, correct the start and end dates so start precedes end, and click Save Changes. If the code is no longer needed, toggle off "This discount is active" instead.',
    helpUrl: 'https://help.nexudus.com/docs/adding-discount-codes',
  },
  resourcesNoPricing: {
    steps: 'Open Inventory > Resources and select the resource missing a booking rate. On the Rates tab click Add rate, give it a name, assign the correct resource type, enter the price, and Save Changes. Alternatively, add the rate from Inventory > Prices and associate it with the resource type.',
    helpUrl: 'https://help.nexudus.com/docs/defining-resource-prices',
  },
  duplicateEmails: {
    steps: 'Open Operations > Members and contacts and search for the shared email to identify all accounts using it. If the accounts belong to the same person, on the duplicate account choose More actions > Revoke online access, update the email under Accounts > Account details, then choose More actions > Grant online access to link them. If they belong to different people, change one of the email addresses to a unique value.',
    helpUrl: 'https://help.nexudus.com/docs/linking-customer-accounts',
  },
  priceOverrides: {
    steps: 'Open Finance > Contracts and review each flagged contract\'s Price schedule section against its plan\'s standard price. Confirm whether the difference is intentional (negotiated rate, $0 plan with per-contract pricing). If unintended, open the contract, edit the Price schedule section, and update or remove the custom schedule to align with the plan price.',
    helpUrl: 'https://help.nexudus.com/docs/adding-price-schedules',
  },
};

const CHECK_DEFS = [
  // --- HIGH ---
  {
    key: 'desks', num: 1, severity: 'HIGH',
    name: 'Desks still tied to cancelled contracts',
    heading: 'Desks still assigned to cancelled contracts',
    description: (n) => `${n} desk(s) still assigned to cancelled contracts.`,
    columns: ['Desk', 'Floor Plan', 'Coworker', 'Type', 'Contract ID', 'Cancelled On', 'Fix'],
    row: (i) => [escPipe(i.deskName), escPipe(i.floorPlan), escPipe(i.member), classifyCoworkerById(i.coworkerId), i.contractId, i.cancelledOn, `\`${i.fix}\``],
    fn: checkDesksOnCancelledContracts,
  },
  {
    key: 'invoices', num: 2, severity: 'HIGH',
    name: 'Overdue invoices still unpaid',
    heading: 'Overdue invoices that are still unpaid',
    description: (n) => `${n} invoice(s) overdue and unpaid (Coworker may be a Member or a Contact).`,
    columns: ['Invoice #', 'Coworker', 'Type', 'Amount', 'Due Date', 'Days Overdue', 'Fix'],
    row: (i) => [escPipe(i.invoiceNumber), escPipe(i.member), classifyCoworkerById(i.coworkerId), escPipe(i.amount), i.dueDate, i.daysOverdue, `\`${i.fix}\``],
    fn: checkOverdueUnpaidInvoices,
  },
  {
    key: 'inactive', num: 3, severity: 'HIGH',
    name: 'Inactive members who still have contracts',
    heading: 'Inactive members who still have active contracts',
    description: (n) => `${n} inactive Member(s) still have active contracts.`,
    columns: ['Member', 'Email', 'Tariff', 'Contract ID', 'Start Date', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.email), escPipe(i.tariff), i.contractId, i.startDate, `\`${i.fix}\``],
    fn: checkInactiveMembersWithActiveContracts,
  },
  {
    key: 'billingBehind', num: 4, severity: 'HIGH',
    name: 'Contracts that have fallen behind on billing',
    heading: 'Active contracts that have fallen behind on billing',
    description: (n) => `${n} active contract(s) have an invoiced period in the past, billing may have stalled.`,
    columns: ['Member', 'Tariff', 'Invoiced Up To', 'Days Behind', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.tariff), i.invoicedPeriod, i.daysBehind, `\`${i.fix}\``],
    fn: checkContractsBillingBehind,
  },
  {
    key: 'stuckCancellation', num: 5, severity: 'HIGH',
    name: "Contracts past their cancellation date that didn't cancel",
    heading: 'Contracts past their cancellation date that never cancelled',
    description: (n) => `${n} contract(s) have a cancellation date in the past but are not yet cancelled.`,
    columns: ['Member', 'Tariff', 'Cancellation Date', 'Days Past', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.tariff), i.cancellationDate, i.daysPast, `\`${i.fix}\``],
    fn: checkContractsStuckCancellation,
  },
  {
    key: 'writeoff', num: 6, severity: 'HIGH',
    name: 'Invoices over a year overdue',
    heading: 'Invoices over a year overdue — worth writing off',
    description: (n) => `${n} invoice(s) overdue for over a year. Consider voiding or writing off (Coworker may be a Member or a Contact).`,
    columns: ['Invoice #', 'Coworker', 'Type', 'Amount', 'Due Date', 'Days Overdue', 'Fix'],
    row: (i) => [escPipe(i.invoiceNumber), escPipe(i.member), classifyCoworkerById(i.coworkerId), escPipe(i.amount), i.dueDate, i.daysOverdue, `\`${i.fix}\``],
    fn: checkInvoicesOverdue12Months,
  },
  {
    key: 'outOfStock', num: 7, severity: 'HIGH',
    name: 'Products out of stock (can block invoicing)',
    heading: 'Products out of stock — this can block invoicing',
    description: (n) => `${n} product(s) with stock tracking enabled have zero or negative stock.`,
    columns: ['Product', 'Business', 'Stock', 'Fix'],
    row: (i) => [escPipe(i.name), escPipe(i.business), i.stock, `\`${i.fix}\``],
    fn: checkProductsOutOfStock,
  },
  {
    key: 'archivedMembers', num: 8, severity: 'HIGH',
    name: 'Suspended members who still have contracts',
    heading: 'Suspended members who still have active contracts',
    description: (n) => `${n} suspended Member(s) still have active contracts. Cancel contracts before or after unsuspending.`,
    columns: ['Member', 'Email', 'Tariff', 'Contract ID', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.email), escPipe(i.tariff), i.contractId, `\`${i.fix}\``],
    fn: checkArchivedMembersWithActiveContracts,
  },
  {
    key: 'suspendedStuckCancel', num: 9, severity: 'HIGH',
    name: "Contracts that couldn't cancel while the member was suspended",
    heading: "Contracts that couldn't cancel because the member was suspended",
    description: (n) => `${n} contract(s) couldn't auto-cancel because the member was suspended at cancellation time.`,
    columns: ['Member', 'Email', 'Tariff', 'Cancellation Date', 'Days Past', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.email), escPipe(i.tariff), i.cancellationDate, i.daysPast, `\`${i.fix}\``],
    fn: checkSuspendedContractsPastCancellation,
  },
  {
    key: 'deposits', num: 10, severity: 'HIGH',
    name: 'Deposits on cancelled contracts not yet refunded',
    heading: 'Refundable deposits still sitting on cancelled contracts',
    description: (n) => `${n} refundable deposit(s) on cancelled contracts may need refund processing (Coworker is typically a Contact now).`,
    columns: ['Product', 'Price', 'Coworker', 'Type', 'Tariff', 'Contract ID', 'Fix'],
    row: (i) => [escPipe(i.product), i.price, escPipe(i.member), classifyCoworkerById(i.coworkerId), escPipe(i.tariff), i.contractId, `\`${i.fix}\``],
    fn: checkDepositsOnCancelledContracts,
  },
  {
    key: 'teamNoPayment', num: 11, severity: 'HIGH',
    name: 'Team payer has no way to pay',
    heading: 'Team billing will fail — the paying member has no payment method',
    description: (n) => `${n} team(s) with merged billing have a paying member with no payment method. Entire team billing will fail.`,
    columns: ['Team', 'Paying Member', 'Fix'],
    row: (i) => [escPipe(i.teamName), escPipe(i.payingMember), `\`${i.fix}\``],
    fn: checkTeamPayingMemberNoPayment,
  },
  {
    key: 'futureBookingsArchived', num: 12, severity: 'HIGH',
    name: 'Upcoming bookings on archived resources',
    heading: 'Upcoming bookings on resources that have been archived',
    description: (n) => `${n} upcoming booking(s) reference archived resources. Coworkers (Members or Contacts) will be affected.`,
    columns: ['Booking #', 'Resource', 'Coworker', 'Date', 'Fix'],
    row: (i) => [i.bookingNumber, escPipe(i.resource), escPipe(i.member), i.date, `\`${i.fix}\``],
    fn: checkFutureBookingsArchivedResources,
  },
  // --- MEDIUM ---
  {
    key: 'discounts', num: 13, severity: 'MEDIUM',
    name: 'Expired discount codes still switched on',
    heading: 'Discount codes that have expired but are still active',
    description: (n) => `${n} discount code(s) expired but still active.`,
    columns: ['Code', 'Description', 'Expired On', 'Days Expired', 'Fix'],
    row: (i) => [escPipe(i.code), escPipe(i.description), i.validTo, i.daysExpired, `\`${i.fix}\``],
    fn: checkExpiredActiveDiscountCodes,
  },
  {
    key: 'drafts', num: 14, severity: 'MEDIUM',
    name: 'Draft invoices sitting unsent over a week',
    heading: 'Draft invoices left unsent for more than a week',
    description: (n) => `${n} draft invoice(s) older than ${DRAFT_STALE_DAYS} days.`,
    columns: ['Invoice #', 'Coworker', 'Amount', 'Created On', 'Days Old', 'Fix'],
    row: (i) => [escPipe(i.invoiceNumber), escPipe(i.member), escPipe(i.amount), i.createdOn, i.daysOld, `\`${i.fix}\``],
    fn: checkStaleDraftInvoices,
  },
  {
    key: 'missingTax', num: 15, severity: 'MEDIUM',
    name: 'Plans or products missing a tax rate or account',
    heading: 'Plans and products missing a tax rate or financial account',
    description: (n) => `${n} item(s) missing tax rate or financial account. May break accounting integrations.`,
    columns: ['Type', 'Name', 'Business', 'Missing', 'Fix'],
    row: (i) => [i.type, escPipe(i.name), escPipe(i.business), escPipe(i.missing), `\`${i.fix}\``],
    fn: checkMissingTaxOrFinancialAccount,
  },
  {
    key: 'frozenPast', num: 16, severity: 'MEDIUM',
    name: 'Paused contracts that should have resumed',
    heading: 'Paused contracts that are past their restart date',
    description: (n) => `${n} contract pause period(s) have ended but may not have resumed.`,
    columns: ['Member', 'Tariff', 'Pause From', 'Pause Until', 'Days Past', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.tariff), i.pauseFrom, i.pauseUntil, i.daysPast, `\`${i.fix}\``],
    fn: checkFrozenContractsPastEndDate,
  },
  {
    key: 'uninvoicedBookings', num: 17, severity: 'MEDIUM',
    name: 'Past bookings never invoiced',
    heading: 'Past bookings that were never invoiced',
    description: (n) => `${n} past booking(s) older than ${BOOKING_STALE_DAYS} days have not been invoiced.`,
    columns: ['Booking #', 'Resource', 'Coworker', 'Date', 'Days Old', 'Fix'],
    row: (i) => [i.bookingNumber, escPipe(i.resource), escPipe(i.member), i.date, i.daysOld, `\`${i.fix}\``],
    fn: checkChargedUninvoicedBookings,
  },
  {
    key: 'noPaymentMethod', num: 18, severity: 'MEDIUM',
    name: 'Paying members with no payment method',
    heading: 'Active members on paid plans with no payment method',
    description: (n) => `${n} active Member(s) on paid plans have no payment method on file.`,
    columns: ['Member', 'Email', 'Tariff', 'Price', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.email), escPipe(i.tariff), i.price, `\`${i.fix}\``],
    fn: checkMembersNoPaymentMethod,
  },
  {
    key: 'contractLimit', num: 19, severity: 'MEDIUM',
    name: 'Members close to the 25-contract limit',
    heading: `Members getting close to the ${CONTRACT_LIMIT_MAX}-contract limit`,
    description: (n) => `${n} Member(s) have ${CONTRACT_LIMIT_WARNING}+ active contracts (limit is ${CONTRACT_LIMIT_MAX}).`,
    columns: ['Member', 'Active Contracts', 'Limit', 'Fix'],
    row: (i) => [escPipe(i.member), i.activeContracts, i.limit, `\`${i.fix}\``],
    fn: checkContractLimitApproaching,
  },
  {
    key: 'lowStock', num: 20, severity: 'MEDIUM',
    name: 'Products running low on stock',
    heading: 'Products at or below their low-stock alert level',
    description: (n) => `${n} product(s) at or below their stock alert level.`,
    columns: ['Product', 'Business', 'Stock', 'Alert Level', 'Fix'],
    row: (i) => [escPipe(i.name), escPipe(i.business), i.stock, i.alertLevel, `\`${i.fix}\``],
    fn: checkProductsLowStock,
  },
  {
    key: 'archivedTariffs', num: 21, severity: 'MEDIUM',
    name: 'Archived plans still in use',
    heading: 'Archived plans still used by active contracts',
    description: (n) => `${n} archived plan(s) still have active contracts.`,
    columns: ['Plan', 'Active Contracts', 'Fix'],
    row: (i) => [escPipe(i.tariff), i.activeContracts, `\`${i.fix}\``],
    fn: checkArchivedTariffsWithActiveContracts,
  },
  {
    key: 'unclosedCheckins', num: 22, severity: 'MEDIUM',
    name: 'Check-ins left open over a day',
    heading: 'Check-ins still open after more than 24 hours',
    description: (n) => `${n} check-in(s) have no checkout time and are older than ${CHECKIN_STALE_HOURS} hours.`,
    columns: ['Coworker', 'Business', 'Checked In', 'Hours Open', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.business), i.from, i.hoursOpen, `\`${i.fix}\``],
    fn: checkUnclosedCheckins,
  },
  {
    key: 'uninvoicedCharges', num: 23, severity: 'MEDIUM',
    name: 'Charges over a month old, still not invoiced',
    heading: "Charges more than 30 days old that still aren't invoiced",
    description: (n) => `${n} charge(s) older than ${CHARGE_STALE_DAYS} days have not been invoiced.`,
    columns: ['Description', 'Amount', 'Coworker', 'Type', 'Business', 'Sale Date', 'Days Old', 'Fix'],
    row: (i) => [escPipe(i.description), i.amount, escPipe(i.member), classifyCoworkerById(i.coworkerId), escPipe(i.business), i.saleDate, i.daysOld, `\`${i.fix}\``],
    fn: checkUninvoicedCharges,
  },
  {
    key: 'overpaidInvoices', num: 24, severity: 'MEDIUM',
    name: 'Overpaid invoices with credit to give back',
    heading: "Overpaid invoices — there's credit to give back",
    description: (n) => `${n} invoice(s) have been overpaid. Credit may be available for the Coworker.`,
    columns: ['Invoice #', 'Coworker', 'Type', 'Total', 'Paid', 'Overpayment', 'Fix'],
    row: (i) => [escPipe(i.invoiceNumber), escPipe(i.member), classifyCoworkerById(i.coworkerId), escPipe(i.total), escPipe(i.paid), escPipe(i.overpayment), `\`${i.fix}\``],
    fn: checkOverpaidInvoices,
  },
  {
    key: 'staleOperators', num: 25, severity: 'MEDIUM',
    name: `Admin logins gone quiet for ${STALE_OPERATOR_DAYS}+ days`,
    heading: `Admin accounts with no login in ${STALE_OPERATOR_DAYS}+ days`,
    description: (n) => `${n} active admin account(s) haven't logged in for ${STALE_OPERATOR_DAYS}+ days. Review and deactivate.`,
    columns: ['Operator', 'Email', 'Last Access', 'Days Stale', 'Fix'],
    row: (i) => [escPipe(i.operator), escPipe(i.email), i.lastAccess, i.daysStale, `\`${i.fix}\``],
    fn: checkStaleOperators,
  },
  {
    key: 'helpDeskDeptsNoManagers', num: 26, severity: 'MEDIUM',
    name: 'Help-desk departments with no manager',
    heading: 'Active help-desk departments with nobody managing them',
    description: (n) => `${n} active help-desk department(s) have no managers. Incoming tickets fall through.`,
    columns: ['Business', 'Department', 'Created On', 'Fix'],
    row: (i) => [escPipe(i.business), escPipe(i.department), i.createdOn, `\`${i.fix}\``],
    fn: checkHelpDeskDeptsNoManagers,
  },
  {
    key: 'unassignedHelpDeskTickets', num: 27, severity: 'MEDIUM',
    name: `Help-desk tickets left unassigned (${UNASSIGNED_TICKET_DAYS}+ days)`,
    heading: `Open help-desk tickets with no owner for ${UNASSIGNED_TICKET_DAYS}+ days`,
    description: (n) => `${n} open help-desk ticket(s) have no owner and are older than ${UNASSIGNED_TICKET_DAYS} days.`,
    columns: ['Business', 'Subject', 'Coworker', 'Created On', 'Days Open', 'Fix'],
    row: (i) => [escPipe(i.business), escPipe(i.subject), escPipe(i.coworker), i.createdOn, i.daysOpen, `\`${i.fix}\``],
    fn: checkUnassignedHelpDeskTickets,
  },
  {
    key: 'creditsSetup', num: 28, severity: 'MEDIUM',
    name: "Plan or product credits that can't be used",
    heading: 'Plan and product credits members can never spend',
    description: (n) => `${n} booking credit(s) release to members but grant nothing or cannot be used for bookings, events, or products.`,
    columns: ['Credit', 'Type', 'Plan/Product', 'Business', 'Problem', 'Fix'],
    row: (i) => [escPipe(i.name), i.type, escPipe(i.owner), escPipe(i.business), escPipe(i.problem), `\`${i.fix}\``],
    fn: checkCreditsSetup,
  },
  // --- LOW ---
  {
    key: 'partialPayments', num: 29, severity: 'LOW',
    name: 'Invoices only partly paid',
    heading: 'Invoices that were only partly paid',
    description: (n) => `${n} invoice(s) have partial payment but are not marked as paid.`,
    columns: ['Invoice #', 'Coworker', 'Total', 'Paid', 'Remaining', 'Fix'],
    row: (i) => [escPipe(i.invoiceNumber), escPipe(i.member), escPipe(i.total), escPipe(i.paid), escPipe(i.remaining), `\`${i.fix}\``],
    fn: checkPartialPayments,
  },
  {
    key: 'invalidDiscountDates', num: 30, severity: 'LOW',
    name: 'Discount codes that start after they end',
    heading: 'Discount codes with a start date after their end date',
    description: (n) => `${n} discount code(s) have an impossible date range (start after end).`,
    columns: ['Code', 'Description', 'Valid From', 'Valid To', 'Fix'],
    row: (i) => [escPipe(i.code), escPipe(i.description), i.validFrom, i.validTo, `\`${i.fix}\``],
    fn: checkDiscountCodesInvalidDateRange,
  },
  {
    key: 'resourcesNoPricing', num: 31, severity: 'LOW',
    name: 'Bookable resources with no rate',
    heading: 'Bookable resources that have no booking rate set',
    description: (n) => `${n} non-archived resource(s) have no booking rate. They may be free for everyone.`,
    columns: ['Resource', 'Business', 'Type', 'Fix'],
    row: (i) => [escPipe(i.name), escPipe(i.business), escPipe(i.type), `\`${i.fix}\``],
    fn: checkResourcesNoPricing,
  },
  // --- INSIGHT ---
  {
    key: 'duplicateEmails', num: 32, severity: 'INSIGHT', section: 'insights',
    name: 'Same email on more than one account',
    heading: 'The same email address on more than one account',
    description: (n) => `${n} email address(es) are shared by multiple Coworker accounts (Members and/or Contacts).`,
    columns: ['Email', 'Count', 'Coworkers'],
    row: (i) => [escPipe(i.email), i.count, escPipe(i.names)],
    fn: checkDuplicateEmails,
  },
  {
    key: 'priceOverrides', num: 33, severity: 'INSIGHT', section: 'insights',
    name: "Contract price doesn't match the plan",
    heading: 'Contracts priced differently from their plan',
    description: (n) => `${n} contract(s) have a price that differs from their plan's current price (often legitimate, e.g. $0 plans where price is set per-contract).`,
    columns: ['Member', 'Tariff', 'Contract Price', 'Plan Price', 'Diff', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.tariff), i.contractPrice, i.tariffPrice, i.diff, `\`${i.fix}\``],
    fn: checkContractPriceOverrides,
  },
  {
    key: 'duplicateContracts', num: 34, severity: 'INSIGHT', section: 'insights',
    name: 'Same member on the same plan twice',
    heading: 'Possible duplicate contracts — same member, same plan',
    description: (n) => `${n} contract(s) are duplicates: same Member on the same plan more than once.`,
    columns: ['Member', 'Tariff', 'Start Date', 'Duplicates', 'Fix'],
    row: (i) => [escPipe(i.member), escPipe(i.tariff), i.startDate, i.count, `\`${i.fix}\``],
    fn: checkDuplicateContracts,
  }

];

module.exports = {
  CHECK_DEFS, CHECK_TIERS, LEVEL_TO_LETTER, CHECK_DEPS, REMEDIATIONS,
};
