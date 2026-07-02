---
name: nexudus-audit
description: Run a health audit of one or more Nexudus locations. Detects data integrity issues across 34 checks (desks on cancelled contracts, expired discount codes, overdue invoices, inactive Members with active contracts, stale drafts, etc.) at a chosen audit depth (Quick / Medium / Thorough / Custom). Distinguishes Members (Coworkers with an active contract) from Contacts (no active contract). Outputs a dated dual-format report.
allowed-tools:
  - nexudus: list, get (read-only)
  - bash: node (read-only)
  - file: write (reports only)
---

# Nexudus Account Health Audit

## Trigger Conditions

Invoke when the user says any of:
- "run a nexudus audit"
- "audit my nexudus account"
- "quick nexudus audit" / "medium audit" / "thorough audit"
- "audit business <id>" / "audit location <name>"
- "check nexudus health"
- "find nexudus issues"

## Prerequisites

- Nexudus CLI authenticated (`nexudus whoami` succeeds) and in PATH
- Node.js in PATH

## Terminology

The audit reflects Nexudus's distinction:
- **Member** — a Coworker with at least one active (non-cancelled) contract.
- **Contact** — a Coworker with no active contract.

Reports include a `Coworkers: <total> — <Members>, <Contacts>` line in the header whenever Coworker data was fetched (Medium/Thorough or any Custom selection that includes a Coworker-touching check).

## Execution Protocol (AI-driven)

**IMPORTANT: Fresh Instance Behavior.** Each time the user invokes the audit (e.g. "run audit", "run nexudus audit"), treat it as a completely fresh instance with no memory of previous Business IDs, depth choices, or selections from earlier in the conversation. Always ask for Business IDs and depth again, even if they were provided earlier.

The script must work both standalone (operator runs `node audit.js` directly) and AI-driven (this protocol). Both produce the same selection table.

1. **Ask for Business IDs.** Prompt the operator in chat:
   > Enter the Business IDs to audit, comma-separated (or `all`):

   The operator looks them up themselves (Nexudus admin UI). Do not run `nexudus businesses list` for them — keeps the business list out of the conversation.

2. **Show the depth/check menu.** Run `node skills/nexudus-audit/scripts/audit.js --show-checks` and paste the resulting consolidated table verbatim. Each row is tagged with `Q` (Quick), `M` (Medium), `T` (Thorough). The footer lists tier counts and rough runtimes.

3. **Ask for the choice.** Prompt:
   > Choice — type `q`, `m`, `t`, or `c <numbers>` (e.g. `c 2,4,9,20`):

4. **Run the audit.** Translate the choice into flags:

   ```bash
   node skills/nexudus-audit/scripts/audit.js \
     --business-ids <ids|all> \
     --level <quick|medium|thorough>
   ```
   or for custom:
   ```bash
   node skills/nexudus-audit/scripts/audit.js \
     --business-ids <ids|all> \
     --checks 2,4,9,20
   ```

5. **Two files, two audiences.** Since your stdout is piped (not a TTY), the script logs plainly — sequential lines, no ANSI escapes or in-place progress redraw — and the final lines always contain the issue count and both file paths (`.md`, `.html`), so they're reliably parseable from the captured output.

   - **`.md`** — the AI's working input. It contains the **CLI's redaction tokens** (`«PII:…»`), not real customer data, so you may read it directly: present findings grouped by severity (HIGH first) and run fix commands one at a time with confirmation. *Exception:* if the run printed a `pii-mode is UNLOCKED` warning, the `.md` contains REAL PII for that run — treat it as sensitive and confirm with the operator before reading.
   - **`.html`** — the operator's deliverable, containing **REAL customer data** (names, emails — de-tokenized from the CLI's local token store for the operator's eyes only). **Never read this file.** The AI has no reason to: the same findings (tokenized) are in the `.md`, and the `.html` exists only for the operator to open in a browser / Ctrl+P → Save as PDF. Reading it would pull real customer PII into the AI context for no functional benefit. If the operator asks you to "look at the report", read the `.md`, not the `.html`.

6. **Re-run after fixes.** Use the same flags to verify.

## Standalone usage (operator runs `node audit.js` themselves)

When invoked directly with no flags, the script drops into interactive prompts on stdin: it asks for Business IDs, prints the same checklist as `--show-checks`, and accepts a tier letter or `c <numbers>`. It writes the same `.md` and `.html` files and exits — no AI consent step in standalone mode (the operator opens the files themselves).

```bash
# Interactive
node skills/nexudus-audit/scripts/audit.js

# Non-interactive (matches the AI flow)
node skills/nexudus-audit/scripts/audit.js --business-ids 12345,67890 --level medium
node skills/nexudus-audit/scripts/audit.js --business-ids all --checks 2,4,9,20

# Full audit, no prompts
node skills/nexudus-audit/scripts/audit.js --all
```

## What it Checks (34 checks)

| # | Check | Severity | Tiers |
|---|-------|----------|-------|
| 1 | Floorplan desks assigned to cancelled contracts | HIGH | M T |
| 2 | Unpaid invoices past their due date | HIGH | T |
| 3 | Inactive Members with active (non-cancelled) contracts | HIGH | M T |
| 4 | Active contracts with billing behind (invoiced period in past) | HIGH | M T |
| 5 | Contracts with past cancellation date but not cancelled | HIGH | M T |
| 6 | Invoices overdue 12+ months (write-off candidates) | HIGH | T |
| 7 | Products out of stock blocking invoicing | HIGH | Q M T |
| 8 | Suspended (archived) Members with active contracts | HIGH | M T |
| 9 | Suspended contracts past their cancellation date | HIGH | M T |
| 10 | Refundable deposits on cancelled contracts not refunded | HIGH | M T |
| 11 | Team merged billing — paying Member has no payment method | HIGH | M T |
| 12 | Future bookings on archived resources | HIGH | T |
| 13 | Expired discount codes still marked active | MEDIUM | Q M T |
| 14 | Draft invoices older than 7 days | MEDIUM | T |
| 15 | Plans/products missing tax rate or financial account | MEDIUM | Q M T |
| 16 | Frozen/paused contracts past their end date | MEDIUM | Q M T |
| 17 | Past bookings not yet invoiced (>7 days) | MEDIUM | T |
| 18 | Active Members on paid plans with no payment method | MEDIUM | M T |
| 19 | Members approaching 25-contract limit (20+) | MEDIUM | M T |
| 20 | Products at or below low-stock alert threshold | MEDIUM | Q M T |
| 21 | Archived plans with active contracts | MEDIUM | M T |
| 22 | Unclosed check-ins older than 24 hours | MEDIUM | T |
| 23 | Uninvoiced charges older than 30 days | MEDIUM | T |
| 24 | Overpaid invoices (credit available) | MEDIUM | T |
| 25 | Stale operator accounts (no login 90+ days) | MEDIUM | M T |
| 26 | Active help-desk departments with no managers | MEDIUM | M T |
| 27 | Open help-desk tickets unassigned 7+ days | MEDIUM | T |
| 28 | Misconfigured plan/product booking credits (unspendable or zero) | MEDIUM | M T |
| 29 | Invoices with partial payment (stuck) | LOW | T |
| 30 | Discount codes with impossible date range | LOW | Q M T |
| 31 | Resources with no booking rate configured | LOW | Q M T |
| 32 | Duplicate Coworker emails | INSIGHT | M T |
| 33 | Contract price is different from plan price | INSIGHT | M T |
| 34 | Duplicate contracts (same Member, same plan) | INSIGHT | M T |

`Q` = Quick (~10s, 7 checks · light data only — products, tariffs, discount codes, resources, paused contracts).
`M` = Medium (~45s, 24 checks · adds Coworkers + contracts).
`T` = Thorough (~90s, all 34 · adds invoices, bookings, charges, checkins, operators, help-desk).

Tier membership is keyed off **which entities each check has to fetch**, so a Quick run never pulls Coworker/contract/invoice data — that's why it stays fast at 5,000+ Coworkers.

## PII Redaction (why the report shows `«PII:NAME:…»` tokens)

Reports render coworker names, emails, phones, and addresses as redaction tokens
(e.g. `«PII:NAME:914859b9»`) rather than real values. **This is expected — not a
bug in the audit.** The redaction is applied by the **Nexudus CLI itself**
(5.0.16+), server-side, before the audit ever sees a record.

The trigger is **how the CLI's output is consumed**, not any flag:

- Run interactively in a terminal (`nexudus coworkers list` typed by a human) →
  output goes to a live TTY → **real values**.
- Run by a program that captures stdout → output is a pipe, not a terminal →
  **redacted tokens**.

`audit.js` captures the CLI's stdout via `spawnSync` (it has to, in order to
parse the JSON), so the spawned `nexudus` process never has an interactive
terminal and **always** receives redacted data. This holds even when the
operator runs `node audit.js` themselves — the operator's own terminal is
interactive, but the child `nexudus` process audit.js spawns is not. There is
**no CLI flag to disable redaction** (`--no-redact` etc. do not exist), and it is
not affected by `--json` / `--agent` / `--md` or by Claude/agent env vars.

This is privacy-by-design: the AI works only on the redacted `.md`, so customer
PII never enters an AI context. Every non-PII field (notably `Contract ID`) is
intact, so a flagged contract/coworker ID can be looked up in the Nexudus admin
UI to act on a finding. Don't attempt to "fix" the redaction; it cannot be
bypassed from within the audit and isn't meant to be.

**The `.html` operator deliverable shows real values.** It is generated by
reversing the CLI's tokens back to the real names/emails using the CLI's own
local token store (`~/.nexudus/pii-tokens.json`, which the CLI writes as it
redacts). The audit never generates tokens itself and never unlocks `pii-mode` —
it only reverses what the CLI already produced. The `.html` is for the operator
only and is **never read by the AI** (see the two-files policy above). If a token
ever appears in the `.html` (e.g. a record fetched before the token map existed),
that's the only sign the reverse-lookup missed an entry.

## Output

Two files (same timestamp), with different audiences:
- **`.md`** — AI input. Full technical report with markdown tables, CLI fix commands, and raw JSON inside a collapsible `<details>`. Holds the CLI's redaction tokens (`«PII:…»`), not real data, so the AI reads it directly to drive automated fixes.
- **`.html`** — Operator deliverable, showing **real customer data** (de-tokenized via the CLI's local token store). Self-contained (inline CSS, no external assets, zero dependencies). Each flagged check shows a plain-English **Recommended action** card sourced from `help.nexudus.com`, with a "Learn more" link to the relevant article. Opens in any browser; Ctrl+P → Save as PDF gives a printable artifact. **Never read by the AI** — it's the operator's artifact and contains real PII.

Multi-business runs include `BusinessName` on every relevant row. Only checks that actually ran appear in the report — no misleading "0 issues" rows for skipped checks. The HTML report's scope card and footer also display `BusinessID (BusinessName)` for each location, pulled live from `nexudus businesses list` at audit time.

Both files are written to `<Desktop>\Nexudus Audit Reports\` (created automatically, including OneDrive-redirected Desktops), unless `--output <path>` overrides the location.

## Resilience

- Retries transient CLI failures (timeouts, ECONNRESET, 5xx) up to 3 times with 1s/2s/4s exponential backoff.
- Each pagination loop has a `MAX_PAGES=1000` (500k records) safety guard against runaway loops.
- Per-CLI-call timeout is 180s (raised from an original 60s because PII tokenization makes large list pages take up to ~66s each).
- Failed checks appear in the report with `ERROR` status; the audit continues.
- If auth expires: `nexudus login` then re-run.

## Related: Onboarding Check-in Audit

`scripts/onboarding-audit.js` is a separate, simpler companion audit for checking that a newly onboarded client's account is set up correctly (plans have benefits attached, resources have rates, location profile is complete, etc.) — pass/warn/fail/skip per check, no depth tiers, HTML-only output (no `.md`, no privacy gate — there's no PII in this report). See `README.md` → "Onboarding Check-in Audit" for the full check list and usage. Trigger phrases like "run an onboarding check" or "check-in audit for business &lt;id&gt;" should invoke this script instead, following the same Business-ID-prompt pattern as steps 1–2 above but skipping the depth-tier step (there isn't one).
