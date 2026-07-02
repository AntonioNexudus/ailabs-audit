const { safeId } = require('../util');
const { runCLI, fetchAllPages } = require('../nexudus-cli');
const { getBusinesses } = require('../data');
const log = require('../log');

// #26. Active help-desk departments with no managers assigned — incoming tickets
// to these departments fall through with no operator notified.
// Managers is a get-only list property, so list → get per active department.
function checkHelpDeskDeptsNoManagers() {
  const businesses = getBusinesses();
  const issues = [];

  for (const biz of businesses) {
    let depts;
    try {
      depts = fetchAllPages([
        'helpdeskdepartments', 'list',
        '--business-id', safeId(biz.Id),
        '--active', 'true',
      ]);
    } catch (err) {
      log.warn(`  [warn] skipping help-desk departments for business ${biz.Id} (${biz.Name}): ${err.message}`);
      continue;
    }

    for (const d of depts) {
      let full;
      try {
        const result = runCLI(['helpdeskdepartments', 'get', safeId(d.Id)]);
        if (!result?.ok) {
          issues.push({
            id: d.Id,
            business: biz.Name,
            department: `${d.Name || '(no name)'} — could not fetch managers (${result?.summary || 'unknown error'})`,
            createdOn: d.CreatedOn ? d.CreatedOn.slice(0, 10) : 'N/A',
            fix: `nexudus helpdeskdepartments get ${safeId(d.Id)}`,
          });
          continue;
        }
        full = result.data;
      } catch (err) {
        issues.push({
          id: d.Id,
          business: biz.Name,
          department: `${d.Name || '(no name)'} — could not fetch managers (${err?.message || 'CLI error'})`,
          createdOn: d.CreatedOn ? d.CreatedOn.slice(0, 10) : 'N/A',
          fix: `nexudus helpdeskdepartments get ${safeId(d.Id)}`,
        });
        continue;
      }
      const managers = Array.isArray(full?.Managers) ? full.Managers : [];
      if (managers.length === 0) {
        issues.push({
          id: d.Id,
          business: biz.Name,
          department: d.Name || '(no name)',
          createdOn: d.CreatedOn ? d.CreatedOn.slice(0, 10) : 'N/A',
          fix: `nexudus helpdeskdepartments update ${safeId(d.Id)} --added-managers <userId>`,
        });
      }
    }
  }

  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkHelpDeskDeptsNoManagers;
