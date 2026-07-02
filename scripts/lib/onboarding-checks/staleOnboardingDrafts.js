const { getInvoices } = require('../data');
const { TODAY } = require('../config');
const { names } = require('./_helpers');

const STALE_DAYS = 7;

// #21. Stale draft invoices — often leftover imports/drafts from the
// onboarding/data-migration process that never got finished or discarded.
function checkStaleOnboardingDrafts() {
  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - STALE_DAYS);

  const drafts = getInvoices().filter(inv => inv && inv.Draft && inv.CreatedOn && new Date(inv.CreatedOn) < cutoff);

  if (drafts.length === 0) {
    return { status: 'pass', detail: 'No stale draft invoices found.' };
  }
  return {
    status: 'warn',
    detail: `${drafts.length} draft invoice${drafts.length !== 1 ? 's' : ''} older than ${STALE_DAYS} days: ${names(drafts.map(d => ({ Name: d.CoworkerFullName || d.InvoiceNumber || `#${d.Id}` })))}.`,
    hint: 'Open Finance > Invoices > Draft Invoices and either convert or delete these — drafts left over from onboarding can\'t collect payment or appear on the portal.',
  };
}

module.exports = checkStaleOnboardingDrafts;
