const { getCoworkersAll } = require('../data');

// #32. Duplicate member emails — same email shared across multiple accounts
function checkDuplicateEmails() {
  const byEmail = new Map();

  for (const m of getCoworkersAll()) {
    if (!m.Email) continue;
    const key = m.Email.trim().toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, []);
    const label = (m.FullName || `ID ${m.Id}`) + (m.Archived ? ' (archived)' : '');
    byEmail.get(key).push(label);
  }

  const issues = [];
  for (const [email, names] of byEmail) {
    if (names.length >= 2) {
      issues.push({
        email,
        count: names.length,
        names: names.join(', '),
      });
    }
  }

  issues.sort((a, b) => b.count - a.count);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkDuplicateEmails;
