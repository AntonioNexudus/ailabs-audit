const { getValidationRules } = require('../data');
const { table } = require('./_helpers');

// #27. Inactive validation rules — informational/low-severity by design. An
// inactive rule isn't inherently wrong (it could be deliberately disabled
// while a workflow change rolls out), so this reports as `warn` framed as
// "worth reviewing," not as a hard failure implying something is broken.
// Fields confirmed via `nexudus validationrules list --help`: --active,
// --record-type, --error-message.
function checkValidationRulesInactive() {
  const rules = getValidationRules();
  if (rules.length === 0) {
    return { status: 'skip', detail: 'No validation rules configured for this scope.' };
  }

  const inactive = rules.filter(r => r && r.Active === false);
  if (inactive.length === 0) {
    return {
      status: 'pass',
      detail: `All ${rules.length} validation rule${rules.length !== 1 ? 's are' : ' is'} active.`,
    };
  }
  return {
    status: 'warn',
    detail: table(
      ['Rule', 'Record type', 'Error message'],
      inactive.map(r => [r.Name || `#${r.Id}`, r.RecordType || '—', r.ErrorMessage || '—']),
    ),
    hint: 'Informational: these validation rules are disabled and not evaluated. Confirm each is intentionally turned off — an accidentally-disabled rule silently stops enforcing the data quality it was built for.',
  };
}

module.exports = checkValidationRulesInactive;
