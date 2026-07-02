const { TODAY, DRAFT_STALE_DAYS } = require('../config');
const { daysBetween, safeId } = require('../util');
const { getInvoices } = require('../data');

// #14. Draft invoices older than 7 days — forgotten or stuck
function checkStaleDraftInvoices() {
  const invoices = getInvoices();
  const issues = [];
  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - DRAFT_STALE_DAYS);

  for (const inv of invoices) {
    if (inv.Draft && inv.CreatedOn && new Date(inv.CreatedOn) < cutoff) {
      issues.push({
        id: inv.Id,
        invoiceNumber: inv.InvoiceNumber || 'Draft',
        member: inv.CoworkerFullName,
        amount: `${inv.TotalAmount?.toFixed(2)} ${inv.CurrencyCode || ''}`,
        createdOn: inv.CreatedOn.slice(0, 10),
        daysOld: daysBetween(inv.CreatedOn, TODAY),
        fix: `nexudus coworkerinvoices update --id ${safeId(inv.Id)} --draft false`,
      });
    }
  }

  issues.sort((a, b) => b.daysOld - a.daysOld);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkStaleDraftInvoices;
