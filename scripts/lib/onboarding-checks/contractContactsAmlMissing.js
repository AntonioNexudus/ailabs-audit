const { getContracts, getContractContacts, getCoworkerIdentityChecks } = require('../data');
const { table } = require('./_helpers');

// #24. Contract signatories missing AML/KYC verification. Compliance-
// sensitive — read this comment before changing the flagging logic.
//
// Fields confirmed via `nexudus contractcontacts list --help`: --aml-check-
// status, --aml-check-date, --aml-open-sanctions-score, --aml-open-sanctions-
// response, --aml-pappers-response/-status, --aml-notes, --aml-cleared-by/-on.
// `nexudus coworkeridentitychecks list --help` confirmed: --identity-check-
// provider, --identity-document-type/-number/-issued-by/-expiration-date,
// --stripe-verification-session-id.
//
// DECISION (per the implementation plan's explicit guidance for this check):
// this check flags ONLY the clear, objective case — a contract signatory with
// no AmlCheckStatus recorded at all (null/blank). It deliberately does NOT:
//   - interpret AmlOpenSanctionsScore against a threshold. The CLI/API give no
//     documented scale for this field (a "sanctions score" could be a 0-100
//     risk score, a boolean-ish 0/1, or provider-specific units), and getting
//     that wrong would produce a false compliance signal — worse than not
//     checking it at all. Flagging "any non-null score" was considered and
//     rejected: a cleared/reviewed contact legitimately has a non-null score
//     once AML has run (that's the whole point of the field), so that
//     approach would flag the *good* case, not the bad one.
//   - interpret coworkeridentitychecks' provider-specific fields (e.g.
//     verification-type, description) as pass/fail signals, for the same
//     reason — their semantics depend on which identity-check provider the
//     operator uses and are not documented by --help alone.
// It DOES use coworkeridentitychecks in one narrow, objective way: whether a
// record exists at all for the signatory's CoworkerId (presence/absence, not
// interpreting any field inside it) — shown as an extra informational column
// so operators can see whether identity verification was attempted at all,
// without the check claiming to know if it passed.
//
// contractcontacts has no --business-id filter (confirmed absent from
// `list --help`), so it is fetched account-wide (via data.js's
// getContractContacts()) and scoped here via the same join getContracts()
// already uses internally: only contacts whose CoworkerContractId matches an
// active, in-scope contract are considered.
//
// SEVERITY (also intentional, not an oversight): this check only ever
// returns 'warn', never 'fail', regardless of what fraction of signatories
// are missing an AML status — unlike its sibling checks in this batch, which
// escalate to 'fail' at 100%. This is deliberate for a compliance-flagging
// check: 'fail' in this audit's vocabulary reads as "definitely broken, fix
// it," which is a stronger claim than this check can responsibly make when
// its entire signal is "a status field is blank" with no visibility into
// whether AML review happens through a channel this CLI doesn't expose (e.g.
// a separate compliance workflow). A blanket 'warn' asks for human review
// without implying the audit has verified an actual violation.
function checkContractContactsAmlMissing() {
  const activeContracts = getContracts().filter(c => c && !c.Cancelled);
  if (activeContracts.length === 0) {
    return { status: 'skip', detail: 'No active contracts in scope.' };
  }
  const activeContractIds = new Set(activeContracts.map(c => c.Id));

  const allContacts = getContractContacts();
  const signatories = allContacts.filter(cc => cc && activeContractIds.has(cc.CoworkerContractId));
  if (signatories.length === 0) {
    return { status: 'skip', detail: 'No contract signatories found for active contracts in scope.' };
  }

  const idCheckedCoworkerIds = new Set(
    getCoworkerIdentityChecks().filter(ic => ic && ic.CoworkerId != null).map(ic => ic.CoworkerId),
  );

  const missing = signatories.filter(cc => !cc.AmlCheckStatus || !String(cc.AmlCheckStatus).trim());
  if (missing.length === 0) {
    return {
      status: 'pass',
      detail: `All ${signatories.length} contract signator${signatories.length !== 1 ? 'ies have' : 'y has'} an AML check status recorded.`,
    };
  }
  return {
    status: 'warn',
    detail: table(
      ['Contract', 'Signatory', 'AML check status', 'Identity check on file?'],
      missing.map(cc => [
        `#${cc.CoworkerContractId ?? '—'}`,
        cc.FullName || cc.Email || `#${cc.Id}`,
        'Not set',
        cc.CoworkerId != null && idCheckedCoworkerIds.has(cc.CoworkerId) ? 'Yes' : 'No',
      ]),
    ),
    hint: 'Open Finance > Contracts and complete an AML/KYC check for these signatories. This check only flags a completely missing status — review AmlOpenSanctionsScore and any coworkeridentitychecks records manually, since their pass/fail thresholds are provider-specific and not something this audit can safely infer.',
  };
}

module.exports = checkContractContactsAmlMissing;
