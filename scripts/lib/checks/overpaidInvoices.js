const { safeId } = require('../util');
const { getInvoices } = require('../data');

// #24. Overpaid invoices — PaidAmount > TotalAmount, credit sitting on account
function checkOverpaidInvoices() {
  const invoices = getInvoices();
  const issues = [];

  for (const inv of invoices) {
    if (!inv.Void && !inv.Draft && inv.PaidAmount > 0 && inv.PaidAmount > (inv.TotalAmount || 0)) {
      const overpayment = inv.PaidAmount - (inv.TotalAmount || 0);
      issues.push({
        id: inv.Id,
        invoiceNumber: inv.InvoiceNumber,
        member: inv.CoworkerFullName,
        coworkerId: inv.CoworkerId,
        total: `${inv.TotalAmount?.toFixed(2)} ${inv.CurrencyCode || ''}`,
        paid: `${inv.PaidAmount?.toFixed(2)} ${inv.CurrencyCode || ''}`,
        overpayment: `${overpayment.toFixed(2)} ${inv.CurrencyCode || ''}`,
        overpaymentRaw: overpayment,
        fix: `nexudus coworkerinvoices get --id ${safeId(inv.Id)}`,
      });
    }
  }

  issues.sort((a, b) => b.overpaymentRaw - a.overpaymentRaw);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkOverpaidInvoices;
