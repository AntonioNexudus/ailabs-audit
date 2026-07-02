const { TODAY, OVERDUE_WRITEOFF_DAYS } = require('../config');
const { daysBetween, safeId } = require('../util');
const { getInvoices } = require('../data');

// #6. Invoices overdue 12+ months — likely unrecoverable, write-off candidates
function checkInvoicesOverdue12Months() {
  const invoices = getInvoices();
  const issues = [];

  for (const inv of invoices) {
    if (!inv.Paid && !inv.Void && !inv.Draft && inv.DueDate) {
      const overdue = daysBetween(inv.DueDate, TODAY);
      if (overdue >= OVERDUE_WRITEOFF_DAYS) {
        issues.push({
          id: inv.Id,
          invoiceNumber: inv.InvoiceNumber,
          member: inv.CoworkerFullName,
          coworkerId: inv.CoworkerId,
          amount: `${inv.TotalAmount?.toFixed(2)} ${inv.CurrencyCode || ''}`,
          dueDate: inv.DueDate.slice(0, 10),
          daysOverdue: overdue,
          fix: `nexudus coworkerinvoices get --id ${safeId(inv.Id)}`,
        });
      }
    }
  }

  issues.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkInvoicesOverdue12Months;
