// The in-memory entity cache and the getX accessors over it, plus business
// scoping and the parallel prefetch. Fetches go through nexudus-cli; the rest of
// the audit reads entities only through these accessors.

const {
  runCLI, fetchAllPages, fetchAllPagesCached, fetchAllPagesCachedAsync,
} = require('./nexudus-cli');
const { safeId } = require('./util');
const state = require('./state');
const log = require('./log');

function inSelectedBusiness(item) {
  if (!state.selectedBusinessIds) return true;
  if (item == null) return false;
  if (item.BusinessId != null) {
    return state.selectedBusinessIds.has(String(item.BusinessId));
  }
  // Coworkers carry InvoicingBusinessId (their home/billing business) instead
  // of BusinessId; it's the field --invoicing-business-id filters on.
  if (item.InvoicingBusinessId != null) {
    return state.selectedBusinessIds.has(String(item.InvoicingBusinessId));
  }
  if (item.DefaultBusinessId != null) {
    return state.selectedBusinessIds.has(String(item.DefaultBusinessId));
  }
  // Floor-plan desks carry their parent floor plan's business.
  if (item.FloorPlanBusinessId != null) {
    return state.selectedBusinessIds.has(String(item.FloorPlanBusinessId));
  }
  if (Array.isArray(item.Businesses)) {
    return item.Businesses.some(b => state.selectedBusinessIds.has(String(b?.Id ?? b)));
  }
  // No business field on this entity. Keep it; it gets constrained indirectly
  // by joins against already-filtered parents (Coworker, Contract).
  return true;
}

function filterByBusiness(items) {
  if (!state.selectedBusinessIds) return items;
  return items.filter(inSelectedBusiness);
}

// ---------------------------------------------------------------------------
// Shared data cache — fetched once, reused across checks
// ---------------------------------------------------------------------------

const cache = {};

// Union of the Ids of every coworker (active + inactive + archived) in the
// selected business(es). Used to scope entities that have no business field of
// their own but reference a coworker. Null when auditing all businesses.
function getScopedCoworkerIdSet() {
  if (!state.selectedBusinessIds) return null;
  if (!cache._scopedCoworkerIds) {
    const set = new Set();
    for (const c of getCoworkersAll()) if (c && c.Id != null) set.add(String(c.Id));
    cache._scopedCoworkerIds = set;
  }
  return cache._scopedCoworkerIds;
}

// Contracts have no business field and no server-side business filter, so they
// are fetched account-wide and scoped by joining each contract's CoworkerId to
// the set of coworkers that belong to the selected business(es).
function filterContractsByScope(contracts) {
  const ids = getScopedCoworkerIdSet();
  if (!ids) return contracts;
  return contracts.filter(c => c && c.CoworkerId != null && ids.has(String(c.CoworkerId)));
}

function getContracts() {
  if (!cache.contracts) {
    const raw = cache._rawContracts != null
      ? cache._rawContracts
      : fetchAllPagesCached('contracts', ['coworkercontracts', 'list']);
    cache.contracts = filterContractsByScope(raw);
  }
  return cache.contracts;
}

function getInvoices() {
  if (!cache.invoices) cache.invoices = filterByBusiness(fetchAllPagesCached('invoices', ['coworkerinvoices', 'list']));
  return cache.invoices;
}

// One coworker fetch backs all three buckets. A no-flag `coworkers list`
// returns every coworker, archived included, with boolean `Active` and
// `Archived` fields, so the buckets are derived in memory rather than paying
// for three paginated fetches. Note the buckets overlap, as they do via the
// CLI flags: an archived coworker may have Active either way.
function getCoworkersAll() {
  if (!cache.coworkersAll) cache.coworkersAll = filterByBusiness(fetchAllPagesCached('coworkersAll', ['coworkers', 'list']));
  return cache.coworkersAll;
}

function getCoworkersActive() {
  return getCoworkersAll().filter(c => c && c.Active === true);
}

function getCoworkersInactive() {
  return getCoworkersAll().filter(c => c && c.Active === false);
}

function getCoworkersArchived() {
  return getCoworkersAll().filter(c => c && c.Archived === true);
}

function getProducts() {
  if (!cache.products) cache.products = filterByBusiness(fetchAllPagesCached('products', ['products', 'list']));
  return cache.products;
}

function getTariffs() {
  if (!cache.tariffs) cache.tariffs = filterByBusiness(fetchAllPagesCached('tariffs', ['tariffs', 'list']));
  return cache.tariffs;
}

function getPaymentMethods() {
  // CoworkerPaymentMethods has no BusinessId; keep all and rely on Coworker
  // joins inside checks (the active/inactive Coworker lists are already
  // business-filtered, so cross-business payment methods get dropped naturally).
  if (!cache.paymentMethods) cache.paymentMethods = fetchAllPagesCached('paymentMethods', ['coworkerpaymentmethods', 'list']);
  return cache.paymentMethods;
}

function getDiscountCodes() {
  if (!cache.discountCodes) cache.discountCodes = filterByBusiness(fetchAllPagesCached('discountCodes', ['discountcodes', 'list']));
  return cache.discountCodes;
}

function getBusinessesAll() {
  // Never disk-cached: this list drives the operator-key hash, so it must be live.
  if (!cache.businessesAll) cache.businessesAll = fetchAllPages(['businesses', 'list']);
  return cache.businessesAll;
}

function fetchAccessibleBusinessIds() {
  if (!cache.accessibleBusinessIds) {
    cache.accessibleBusinessIds = new Set(getBusinessesAll().map(b => String(b.Id)));
  }
  return cache.accessibleBusinessIds;
}

function getBusinesses() {
  const all = getBusinessesAll();
  if (state.selectedBusinessIds) {
    return all.filter(b => state.selectedBusinessIds.has(String(b.Id)));
  }
  return all;
}

function getTeamsList() {
  if (!cache.teamsList) cache.teamsList = filterByBusiness(fetchAllPagesCached('teamsList', ['teams', 'list']));
  return cache.teamsList;
}

function getTariffCredits() {
  // No BusinessId on this entity; scoped via the tariff join inside the check.
  if (!cache.tariffCredits) cache.tariffCredits = fetchAllPagesCached('tariffCredits', ['tariffbookingcredits', 'list']);
  return cache.tariffCredits;
}

function getProductCredits() {
  // No BusinessId on this entity; scoped via the product join inside the check.
  if (!cache.productCredits) cache.productCredits = fetchAllPagesCached('productCredits', ['productbookingcredits', 'list']);
  return cache.productCredits;
}

// ---------------------------------------------------------------------------
// Additional getters — added for the onboarding check-in audit
// (scripts/onboarding-audit.js). Same shared-cache/business-scoping pattern
// as the getters above; none of the existing getters were changed.
// ---------------------------------------------------------------------------

function getResources() {
  if (!cache.resources) cache.resources = filterByBusiness(fetchAllPagesCached('resources', ['resources', 'list']));
  return cache.resources;
}

function getExtraServices() {
  // Booking rates. No server-side --business-id fast path registered in
  // nexudus-cli's scopedPlan, so this fetches account-wide and scopes in
  // memory via filterByBusiness (same fallback every other unregistered
  // entity already takes).
  if (!cache.extraServices) cache.extraServices = filterByBusiness(fetchAllPagesCached('extraServices', ['extraservices', 'list']));
  return cache.extraServices;
}

function getTaxRates() {
  if (!cache.taxRates) cache.taxRates = filterByBusiness(fetchAllPagesCached('taxRates', ['taxrates', 'list']));
  return cache.taxRates;
}

function getPaymentGateways() {
  if (!cache.paymentGateways) cache.paymentGateways = filterByBusiness(fetchAllPagesCached('paymentGateways', ['paymentgateways', 'list']));
  return cache.paymentGateways;
}

// ---------------------------------------------------------------------------
// Additional getters — added for onboarding checks #23-30 (financial/
// compliance hygiene, integrations & system config, resource booking-policy
// completeness). Same shared-cache/business-scoping pattern as above: none of
// these entities are registered in nexudus-cli's BUSINESS_FLAG map (confirmed
// via `nexudus <entity> list --help` at implementation time — several *do*
// expose a --business-id filter, but per the precedent set by getResources/
// getExtraServices/getTaxRates/getPaymentGateways above, new getters fetch
// account-wide and scope with filterByBusiness() in memory rather than
// modifying the shared BUSINESS_FLAG map).
// ---------------------------------------------------------------------------

function getEventAttendees() {
  if (!cache.eventAttendees) cache.eventAttendees = filterByBusiness(fetchAllPagesCached('eventAttendees', ['eventattendees', 'list']));
  return cache.eventAttendees;
}

function getTimepasses() {
  if (!cache.timepasses) cache.timepasses = filterByBusiness(fetchAllPagesCached('timepasses', ['timepasses', 'list']));
  return cache.timepasses;
}

function getWebhooks() {
  if (!cache.webhooks) cache.webhooks = filterByBusiness(fetchAllPagesCached('webhooks', ['webhooks', 'list']));
  return cache.webhooks;
}

function getValidationRules() {
  if (!cache.validationRules) cache.validationRules = filterByBusiness(fetchAllPagesCached('validationRules', ['validationrules', 'list']));
  return cache.validationRules;
}

function getCustomFields() {
  if (!cache.customFields) cache.customFields = filterByBusiness(fetchAllPagesCached('customFields', ['customfields', 'list']));
  return cache.customFields;
}

// contractcontacts — AML/KYC fields consumed by contractContactsAmlMissing.js
// (#24). Unlike the other new getters in this block, this entity has no
// --business-id filter at all (confirmed absent from `list --help`), so it
// cannot be scoped via filterByBusiness()'s BusinessId/InvoicingBusinessId/etc
// field checks either (contract contacts carry none of those). It is fetched
// account-wide here and left unscoped; the consuming check scopes it itself
// by joining CoworkerContractId against the already business-scoped
// getContracts() result, the same join pattern getContracts() itself uses for
// its own CoworkerId scoping.
function getContractContacts() {
  if (!cache.contractContacts) cache.contractContacts = fetchAllPagesCached('contractContacts', ['contractcontacts', 'list']);
  return cache.contractContacts;
}

// coworkeridentitychecks — used only as a secondary, presence/absence-only
// informational signal by contractContactsAmlMissing.js (#24). See that
// file's header comment for why its fields (provider/verification-type) are
// deliberately NOT interpreted for pass/fail purposes.
function getCoworkerIdentityChecks() {
  if (!cache.coworkerIdentityChecks) cache.coworkerIdentityChecks = filterByBusiness(fetchAllPagesCached('coworkerIdentityChecks', ['coworkeridentitychecks', 'list']));
  return cache.coworkerIdentityChecks;
}

// resourceaccessrules list rows (no linked-resource info — see
// getResourceAccessRuleMap() below for that). --business-id is a confirmed
// filter for this entity but, per the comment above, scoped in memory instead.
function getResourceAccessRules() {
  if (!cache.resourceAccessRules) cache.resourceAccessRules = filterByBusiness(fetchAllPagesCached('resourceAccessRules', ['resourceaccessrules', 'list']));
  return cache.resourceAccessRules;
}

// Derived, cached map from resource ID -> set of resourceaccessrule IDs that
// apply to it. `resourceaccessrules list` does not return the linked
// Resources array (confirmed via `list --help`: only --applied-resources-count
// is a list filter, not the resources themselves) — only `resourceaccessrules
// get <id>` returns the full `Resources` relation, mirroring the same
// list->get-per-record pattern helpDeskManagers.js uses for department
// managers. Computed once and cached (module-level `cache`) so both #29
// (resourcesNoBookingPolicy) and #30 (resourcesBookingPolicyIncomplete) share
// a single pass of `get` calls instead of doubling the CLI traffic.
function getResourceAccessRuleMap() {
  if (!cache.resourceAccessRuleMap) {
    const rules = getResourceAccessRules();
    const resourceIdToRuleIds = new Map();
    const fetchFailedRuleIds = new Set();
    for (const rule of rules) {
      if (!rule || rule.Id == null) continue;
      let linked = [];
      try {
        const result = runCLI(['resourceaccessrules', 'get', safeId(rule.Id)]);
        linked = Array.isArray(result?.data?.Resources) ? result.data.Resources : [];
      } catch (err) {
        fetchFailedRuleIds.add(rule.Id);
        log.warn(`  [warn] could not fetch linked resources for booking-policy rule ${rule.Id} (${rule.Name || 'unnamed'}): ${err.message}`);
        continue;
      }
      for (const r of linked) {
        const rid = r && r.Id != null ? String(r.Id) : (r != null ? String(r) : null);
        if (rid == null) continue;
        if (!resourceIdToRuleIds.has(rid)) resourceIdToRuleIds.set(rid, new Set());
        resourceIdToRuleIds.get(rid).add(rule.Id);
      }
    }
    cache.resourceAccessRuleMap = { resourceIdToRuleIds, fetchFailedRuleIds };
  }
  return cache.resourceAccessRuleMap;
}

// ---------------------------------------------------------------------------
// Parallel prefetch. Builds the list of entities the selected checks actually
// need, fetches them in one upfront pass, and populates the in-memory cache so
// each getX() returns immediately. The lazy getX path is still available
// behind --serial for debugging.
// ---------------------------------------------------------------------------

const ENTITY_SPECS = {
  // Contracts have no server-side business filter; prefetch stores them raw and
  // getContracts() applies the CoworkerId join (see filterContractsByScope).
  contracts: { args: ['coworkercontracts', 'list'], join: 'coworker' },
  invoices: { args: ['coworkerinvoices', 'list'], filtered: true },
  coworkersAll: { args: ['coworkers', 'list'], filtered: true },
  products: { args: ['products', 'list'], filtered: true },
  tariffs: { args: ['tariffs', 'list'], filtered: true },
  paymentMethods: { args: ['coworkerpaymentmethods', 'list'], filtered: false },
  discountCodes: { args: ['discountcodes', 'list'], filtered: true },
  teamsList: { args: ['teams', 'list'], filtered: true },
  // Booking credits carry no business field; scoped indirectly by joining to
  // the business-filtered tariffs/products they hang off (see checkCreditsSetup).
  tariffCredits: { args: ['tariffbookingcredits', 'list'], filtered: false },
  productCredits: { args: ['productbookingcredits', 'list'], filtered: false },
};

// onEntity(done, total, key) is an optional progress callback fired as each
// entity settles (fulfilled or rejected), letting audit.js drive a live
// "Fetching data… 3/7 entities" status line.
async function prefetchAll(neededKeys, onEntity) {
  if (neededKeys.length === 0) return;
  const start = Date.now();
  const total = neededKeys.length;
  let done = 0;
  // allSettled, not all: abandoning in-flight CLI children on the first
  // failure leaves them loading the API in the background, which was observed
  // to crash the next call. Each entity is all-or-nothing (a complete list or
  // a throw), so caching just the ones that resolved is safe; failed entities
  // stay uncached and are re-fetched lazily by their getX().
  const settled = await Promise.allSettled(neededKeys.map(async key => {
    try {
      const spec = ENTITY_SPECS[key];
      if (!spec) throw new Error(`Unknown entity for prefetch: ${key}`);
      const data = await fetchAllPagesCachedAsync(key, spec.args);
      if (spec.join) {
        // Stash raw; getContracts() finalizes the join once coworker scope exists.
        cache._rawContracts = data;
      } else {
        cache[key] = spec.filtered ? filterByBusiness(data) : data;
      }
      return key;
    } finally {
      done++;
      if (typeof onEntity === 'function') {
        try { onEntity(done, total, key); } catch { /* progress must never break the fetch */ }
      }
    }
  }));
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const failures = settled.filter(s => s.status === 'rejected');
  const okCount = settled.length - failures.length;
  if (failures.length === 0) {
    log.info(`Prefetched ${okCount} ${okCount === 1 ? 'entity' : 'entities'} in ${elapsed}s`);
  } else {
    const reasons = [...new Set(failures.map(f => (f.reason && f.reason.message) || String(f.reason)))];
    log.info(`Prefetched ${okCount}/${neededKeys.length} entities in ${elapsed}s — ${failures.length} will be fetched lazily (${reasons.join('; ')})`);
  }
}

// Cached lookup of active contracts grouped by CoworkerId. Built lazily on
// first call so the cost is paid at most once even if multiple checks ask.
function getContractsByCoworker() {
  if (!cache.contractsByCoworker) {
    // Trigger contracts fetch if it wasn't prefetched. Cheap if already cached.
    if (!cache.contracts) getContracts();
    const m = new Map();
    for (const c of cache.contracts || []) {
      if (!c.Cancelled) {
        if (!m.has(c.CoworkerId)) m.set(c.CoworkerId, []);
        m.get(c.CoworkerId).push(c);
      }
    }
    cache.contractsByCoworker = m;
  }
  return cache.contractsByCoworker;
}

// Classify a Coworker by ID: 'Member' if they hold any active contract,
// 'Contact' otherwise. Used by the per-row Type column on mixed-audience
// checks (#1, #2, #6, #10, #23, #24). Returns '—' when the row carries no
// coworker ID.
function classifyCoworkerById(coworkerId) {
  if (coworkerId == null) return '—';
  const map = getContractsByCoworker();
  return map.has(coworkerId) ? 'Member' : 'Contact';
}

// Distinguish Members (Coworkers with at least one active contract) from
// Contacts (Coworkers with no active contract). Returns null when no Coworker
// data was fetched (e.g. Quick tier), so the header can omit the breakdown.
function computeCoworkerStats() {
  if (!cache.coworkersAll) return null;
  const seen = new Map();
  for (const cw of cache.coworkersAll) seen.set(cw.Id, cw);
  const total = seen.size;
  let members = 0;
  if (cache.contracts) {
    const memberIds = new Set();
    for (const c of cache.contracts) {
      if (!c.Cancelled && seen.has(c.CoworkerId)) memberIds.add(c.CoworkerId);
    }
    members = memberIds.size;
  }
  return { total, members, contacts: total - members };
}

module.exports = {
  filterByBusiness,
  getContracts, getInvoices,
  getCoworkersAll, getCoworkersActive, getCoworkersInactive, getCoworkersArchived,
  getProducts, getTariffs, getPaymentMethods, getDiscountCodes,
  getBusinessesAll, fetchAccessibleBusinessIds, getBusinesses,
  getTeamsList, getTariffCredits, getProductCredits,
  ENTITY_SPECS, prefetchAll,
  getContractsByCoworker, classifyCoworkerById, computeCoworkerStats,
  // Onboarding check-in audit getters (scripts/onboarding-audit.js)
  getResources, getExtraServices, getTaxRates, getPaymentGateways,
  // Onboarding checks #23-30 getters
  getEventAttendees, getTimepasses, getWebhooks, getValidationRules,
  getCustomFields, getContractContacts, getCoworkerIdentityChecks,
  getResourceAccessRules, getResourceAccessRuleMap,
};
