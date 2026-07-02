const { runCLI, fetchAllPages } = require('../nexudus-cli');
const { getBusinesses } = require('../data');
const { safeId, table } = require('./_helpers');
const log = require('../log');

// #17. Active help-desk departments with no managers assigned — incoming
// tickets to these departments fall through with no operator notified. Same
// list -> get-per-department pattern as the account-health audit's #26
// (helpDeskDeptsNoManagers.js), reused here rather than duplicated logic —
// only the pass/warn/fail framing differs.
function checkHelpDeskManagers() {
  const businesses = getBusinesses();
  if (businesses.length === 0) {
    return { status: 'skip', detail: 'No businesses in scope.' };
  }

  const rows = [];
  let totalDepts = 0;
  for (const biz of businesses) {
    let depts;
    try {
      depts = fetchAllPages(['helpdeskdepartments', 'list', '--business-id', safeId(biz.Id), '--active', 'true']);
    } catch (err) {
      log.warn(`  [warn] skipping help-desk departments for business ${biz.Id} (${biz.Name}): ${err.message}`);
      continue;
    }
    totalDepts += depts.length;
    for (const d of depts) {
      let managers = [];
      let fetchFailed = false;
      try {
        const result = runCLI(['helpdeskdepartments', 'get', safeId(d.Id)]);
        managers = Array.isArray(result?.data?.Managers) ? result.data.Managers : [];
      } catch (err) {
        // Surfaced distinctly from "confirmed no manager" so the report
        // doesn't imply a gap was verified when the check couldn't actually see it.
        fetchFailed = true;
        log.warn(`  [warn] could not fetch managers for department ${d.Id} (${d.Name}): ${err.message}`);
      }
      if (fetchFailed) {
        rows.push([biz.Name || `#${biz.Id}`, `${d.Name || '(no name)'} — could not verify (fetch failed)`]);
      } else if (managers.length === 0) {
        rows.push([biz.Name || `#${biz.Id}`, d.Name || '(no name)']);
      }
    }
  }

  if (totalDepts === 0) {
    return { status: 'skip', detail: 'No active help-desk departments found for this scope.', hint: 'Create at least one help-desk department (Operations > Help-desk > Departments) so member requests have somewhere to land.' };
  }
  if (rows.length === 0) {
    return { status: 'pass', detail: `All ${totalDepts} active help-desk department${totalDepts !== 1 ? 's have' : ' has'} at least one manager assigned.` };
  }
  return {
    status: 'warn',
    detail: table(['Business', 'Department (no manager)'], rows),
    hint: 'Open Operations > Help-desk > Departments and assign at least one manager to each — managers get notified of every new ticket.',
  };
}

module.exports = checkHelpDeskManagers;
