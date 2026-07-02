const { TODAY } = require('../config');
const { daysBetween, safeId } = require('../util');
const { getInvoices } = require('../data');

// #2. Unpaid invoices past their due date
function checkOverdueUnpaidInvoices() {
  const invoices = getInvoices();
  const issues = [];

  for (const inv of invoices) {
    if (!inv.Paid && !inv.Void && !inv.Draft && inv.DueDate && new Date(inv.DueDate) < TODAY) {
      issues.push({
        id: inv.Id,
        invoiceNumber: inv.InvoiceNumber,
        member: inv.CoworkerFullName,
        coworkerId: inv.CoworkerId,
        amount: `${inv.TotalAmount?.toFixed(2)} ${inv.CurrencyCode || ''}`,
        dueDate: inv.DueDate.slice(0, 10),
        daysOverdue: daysBetween(inv.DueDate, TODAY),
        fix: `nexudus coworkerinvoices get --id ${safeId(inv.Id)}`,
      });
    }
  }

  issues.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkOverdueUnpaidInvoices;
