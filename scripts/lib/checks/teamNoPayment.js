const { safeId } = require('../util');
const { runCLI } = require('../nexudus-cli');
const { getPaymentMethods, getTeamsList } = require('../data');

// #11. Teams with merged billing where the paying member has no payment method
function checkTeamPayingMemberNoPayment() {
  const teams = getTeamsList();
  if (teams.length === 0) return { status: 'PASS', items: [] };

  const paymentMethods = getPaymentMethods();
  const hasPayment = new Set(paymentMethods.map(pm => pm.CoworkerId));

  const issues = [];
  for (const team of teams) {
    let detail;
    try {
      const result = runCLI(['teams', 'get', safeId(team.Id)]);
      if (!result.ok) continue;
      detail = result.data;
    } catch {
      continue;
    }

    if (detail?.CreateSingleInvoiceForTeam && detail?.PayingMemberId) {
      if (!hasPayment.has(detail.PayingMemberId)) {
        issues.push({
          teamId: team.Id,
          teamName: team.Name,
          payingMemberId: detail.PayingMemberId,
          payingMember: detail.PayingMemberFullName || 'Unknown',
          fix: `nexudus coworkers get --id ${safeId(detail.PayingMemberId)}`,
        });
      }
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkTeamPayingMemberNoPayment;
