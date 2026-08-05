const { TODAY, PROPOSAL_STALE_DAYS } = require('../config');
const { daysBetween, safeId } = require('../util');
const { fetchAllPages } = require('../nexudus-cli');
const { getBusinesses } = require('../data');
const log = require('../log');

// #35. Proposals that were sent to a customer and then went quiet — either
// past their own expiry date, or sat unanswered for PROPOSAL_STALE_DAYS+ days
// with no expiry set. A sales pipeline full of these overstates the space's
// real prospects. Fetched inline (no prefetch dependency), the same way #27
// pulls help-desk messages.
//
// ProposalStatus enum (Nexudus REST docs): 1 = Draft, 2 = Sent, 3 = Accepted,
// 4 = Rejected. Only Sent (2) is considered here: a Draft was never shown to
// anyone, so "chase the customer or close it" simply doesn't apply to it, and
// Accepted/Rejected proposals are already resolved.
const PROPOSAL_STATUS_SENT = 2;

// "250.00000 GBP" -> "250.00 GBP". Two decimals, matching how every other
// money column in the audit renders (see checks/drafts.js). Returns '—' when
// the proposal carries no usable price — note Number('') is 0, so the blank
// case has to be excluded before the numeric test.
function formatValue(p) {
  if (p.TariffPrice == null || p.TariffPrice === '') return '—';
  const n = Number(p.TariffPrice);
  if (!Number.isFinite(n)) return '—';
  const amount = n.toFixed(2);
  return p.TariffBusinessCurrencyCode ? `${amount} ${p.TariffBusinessCurrencyCode}` : amount;
}

function checkStaleProposals() {
  const proposals = fetchAllPages(['proposals', 'list']);

  // Proposals carry no BusinessId / InvoicingBusinessId, so filterByBusiness()
  // would pass every one of them straight through regardless of --business.
  // IssuedById *is* the business id (IssuedByName matches `businesses list`),
  // so the scoping is done manually here instead.
  const scopedBusinessIds = new Set(getBusinesses().map(b => String(b.Id)));
  const issues = [];
  let inScope = 0;

  for (const p of proposals) {
    if (!p) continue;
    // Counted before the status filter, so the tell-tale below measures only
    // whether the IssuedById join works — not whether this tenant happens to
    // have any Sent proposals. An account of nothing but Drafts is normal and
    // must not raise the alarm.
    if (p.IssuedById == null || !scopedBusinessIds.has(String(p.IssuedById))) continue;
    inScope++;

    // Number() rather than a strict === against the literal: the CLI returns
    // ProposalStatus as a number today, but a string "2" would otherwise make
    // this check silently report PASS forever with no signal to the operator.
    if (Number(p.ProposalStatus) !== PROPOSAL_STATUS_SENT) continue;

    // SentOn is the clock a sent proposal runs on; CreatedOn is a safe fallback
    // so a record with a blank SentOn still reports a real number of days.
    // With neither, there is no usable date at all — skip rather than emit NaN.
    const openedFrom = p.SentOn || p.CreatedOn;
    if (!openedFrom) continue;
    const daysOpen = daysBetween(openedFrom, TODAY);
    if (!Number.isFinite(daysOpen)) continue;

    // A parseable expiry date is the authoritative deadline: past it, flag
    // regardless of age; before it, the proposal is still legitimately open.
    // Anything else (absent, blank, or unparseable) falls through to the
    // age-of-send rule rather than being dropped. That fallback is what does
    // the real work: ExpirationDate is omitted from the JSON entirely when
    // unset, and is unset on every proposal in the tenants seen so far, so an
    // expiry-only rule would be dead code in practice.
    const expiresAt = p.ExpirationDate ? new Date(p.ExpirationDate) : null;
    const hasExpiry = expiresAt != null && Number.isFinite(expiresAt.getTime());

    let why;
    if (hasExpiry) {
      if (expiresAt >= TODAY) continue;
      why = `Expired ${String(p.ExpirationDate).slice(0, 10)}`;
    } else {
      if (daysOpen < PROPOSAL_STALE_DAYS) continue;
      why = 'No expiry set';
    }

    issues.push({
      id: p.Id,
      reference: p.Reference || `#${p.Id}`,
      coworker: p.CoworkerFullName || 'Unknown',
      plan: p.TariffName || '—',
      value: formatValue(p),
      sentOn: String(openedFrom).slice(0, 10),
      daysOpen,
      why,
      fix: `nexudus proposals update ${safeId(p.Id)} --proposal-status 4`,
    });
  }

  // Tell-tale for a wrong scoping assumption: proposals exist, but not one of
  // them joined to a business in scope. IssuedById being the business id was
  // confirmed against `businesses list`, so this should never fire — if it
  // does, the field changed meaning and the PASS below is not trustworthy.
  if (proposals.length > 0 && inScope === 0) {
    log.warn(`  [warn] ${proposals.length} proposal(s) fetched but none matched a business in scope — IssuedById may no longer be the business id. Treat this check's result as unverified.`);
  }

  issues.sort((a, b) => b.daysOpen - a.daysOpen);
  return { status: issues.length > 0 ? 'ISSUES' : 'PASS', items: issues };
}

module.exports = checkStaleProposals;
