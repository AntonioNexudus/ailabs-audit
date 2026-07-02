const { safeId } = require('../util');
const { getInvoices } = require('../data');

// #29. Invoices with partial payment — PaidAmount > 0 but not fully paid
function checkPartialPayments() {
  const invoices = getInvoices();
  const issues = [];

  for (const inv of invoices) {
    if (!inv.Paid && !inv.Void && !inv.Draft && inv.PaidAmount > 0) {
      issues.push({
        id: inv.Id,
        invoiceNumber: inv.InvoiceNumber,
        member: inv.CoworkerFullName,
        total: `${inv.TotalAmount?.toFixed(2)} ${inv.CurrencyCode || ''}`,
        paid: `${inv.PaidAmount?.toFixed(2)} ${inv.CurrencyCode || ''}`,
        remaining: `${((inv.TotalAmount || 0) - (inv.PaidAmount || 0)).toFixed(2)} ${inv.CurrencyCode || ''}`,
        fix: `nexudus coworkerinvoices get --id ${safeId(inv.Id)}`,
      });
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkPartialPayments;
