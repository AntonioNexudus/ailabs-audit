---
name: Nexudus Audit Skill
description: 34-check health audit of Nexudus locations with selectable depth tiers (Quick/Medium/Thorough/Custom), multi-business scoping, Member vs Contact distinction, and dual output (.md for AI-assisted fixes, .html as the Nexudus-branded operator deliverable)
---

# Nexudus Account Health Audit Skill

## Repository Contents

```
.
├── README.md          this file — overview and reference
├── SKILL.md           Claude Code skill manifest (trigger conditions + AI execution protocol)
├── .gitignore         excludes runtime output (.audit-cache/, reports/)
└── scripts/
    └── audit.js       the audit tool — single self-contained Node script, zero dependencies
```

To use the skill, drop the folder into a Claude Code `skills/nexudus-audit/`
directory; to run the tool directly, see **Invocation Modes** below. At runtime
`audit.js` creates `scripts/reports/` (the generated reports) and, with `--cache`,
`.audit-cache/` — both are gitignored and never committed.

## What It Does

Runs up to 34 checks across Coworker accounts, contracts, invoices, products, resources, and bookings. Operator picks **which businesses** and **how deep** before running. Each check returns structured data (status + items array). Outputs two reports:

- **`.md`** — Full technical report with markdown tables + embedded fix commands + raw JSON. Keeps the CLI's automatic PII **tokens** (`«PII:…»`) so it is AI-safe in a normal locked run, but still gated: read ONLY after user consent via the privacy gate.
- **`.html`** — Nexudus-branded operator deliverable. Self-contained (inline CSS, zero dependencies, no `npm install` required), severity-grouped findings, and a plain-English **Recommended action** card per flagged check sourced from `help.nexudus.com`. PII tokens are reversed back to real names/emails using the CLI's own local token store (`~/.nexudus/pii-tokens.json`), so the operator sees real values. Scrollable tables (400px height) to minimize page scrolling on large datasets. Ctrl+Click the file URL in the terminal to open in browser, then Ctrl+P to save as PDF for a printable artifact. Read ONLY after user consent (contains customer PII).

### Branding the HTML report

Branding constants live in `scripts/audit.js` (search for `BRAND_PRIMARY`, just above `buildHtmlReport`). They were sampled from `help.nexudus.com`; if Nexudus rebrands, edit the block — `BRAND_PRIMARY` (currently `#FF5100`), `BRAND_PRIMARY_TEXT`, `BRAND_INK`, `BRAND_INK_MUTED`, `BRAND_SURFACE`, `BRAND_SURFACE_ALT`, `BRAND_BORDER`, `BRAND_RADIUS`, `BRAND_FONT_BODY` (Nunito), `BRAND_FONT_HEAD` (Red Hat Display). A separate `SEVERITY_COLORS` palette (HIGH/MEDIUM/LOW/INSIGHT) is kept deliberately distinct from the brand orange so the brand colour is never read as a severity signal.

The remediation copy that appears in each finding's "Recommended action" card lives in the `REMEDIATIONS` lookup map (also in `scripts/audit.js`, just above `CHECK_DEFS`). Each entry is `{ steps, helpUrl }` keyed by the check's `key` field. To revise a step, edit that entry — no other code changes needed.

## Invocation Modes

The script works two ways with the same selection logic:

**Standalone (operator runs `node audit.js` directly):**
- Interactive stdin prompts: asks for Business IDs, prints the 34-check tier-tagged table, accepts a tier letter or `c <numbers>`. Writes both reports and exits — no AI consent step in this mode.

**AI-driven (skill invocation):**
- AI prompts user in chat for Business IDs, runs `node audit.js --show-checks` and pastes the table, asks for the choice, then runs with flags. Privacy gate (`.md` only after YES) still applies.

CLI flags:
```
--business-ids <ids|all>   comma-separated numeric IDs, or "all"
--level <quick|medium|thorough>
--checks 2,4,9,20          custom subset (overrides --level)
--show-checks              print the tier-tagged checklist and exit
--all                      shorthand for --business-ids all --level thorough
--cache                    persist fetched lists to .audit-cache/ for 1 hour
--serial                   disable parallel prefetch (debug aid; ~1.5–2x slower)
--output <path>            override default report path
```

If `--business-ids` and (`--level` or `--checks`) are both present → non-interactive. If either missing AND stdin is a TTY → prompt. If either missing AND non-TTY → exit 2 with usage hint.

## Tier Model (data-fetch-driven)

Tiers are sized by **which entities each check needs to fetch**, not just severity. At 5,000+ Coworkers the heavy fetches dominate runtime, so a Quick run can complete fast by avoiding Coworker / contract / invoice / booking pulls entirely.

| Tier | Light only | + Coworkers + contracts | + invoices, bookings, charges, checkins |
|------|---|---|---|
| Quick | ✓ | | |
| Medium | ✓ | ✓ | |
| Thorough | ✓ | ✓ | ✓ |

**Quick (7):** #7, #13, #15, #16, #20, #30, #31

**Medium (24):** Quick + #1, #3, #4, #5, #8, #9, #10, #11, #18, #19, #21, #25, #26, #28, #32, #33, #34

**Thorough (34):** all

Tier membership lives in `CHECK_TIERS` (top of audit.js). Runtime is dominated by the Coworker / contract / invoice pulls and is highly tenant-size dependent: **Quick stays fast** (no heavy fetches), but on a large (~5k-coworker) tenant **PII tokenization** makes each `coworkers list` page ~66s and forces serial fetching (`MAX_CONCURRENT_CLI_REDACTED = 1`), so Medium/Thorough can run on the order of tens of minutes. Server-side business scoping (`--business-ids`) is the main lever to cut that — it fetches only the selected location's rows instead of the whole account. Clear runs (pii-mode unlocked) skip tokenization and fetch with up to `MAX_CONCURRENT_CLI_CLEAR = 4` parallel CLI calls.

## Check Structure (34 total)

**HIGH (12):** Desks on cancelled contracts, overdue invoices, inactive Members with active contracts, billing behind, stuck cancellations, 12-month writeoffs, out-of-stock, suspended Members with active contracts, suspended contracts past cancellation, deposits on cancelled contracts, team merged-billing payer with no payment method, future bookings on archived resources

**MEDIUM (16):** Expired discount codes, stale drafts, missing tax/financial account, frozen contracts past end date, uninvoiced bookings, no payment method, contract limit approaching, low stock, archived plans with active contracts, unclosed checkins, uninvoiced charges, overpaid invoices, stale operators, help-desk departments with no managers, unassigned help-desk tickets, misconfigured plan/product booking credits

**LOW (3):** Partial payments, impossible discount date range, resources with no booking rate

**INSIGHT (3):** Duplicate Coworker emails, contract price differs from plan price, duplicate contracts (same Member + plan)

## Multi-Business Filtering

`--business-ids` is parsed into `SELECTED_BUSINESS_IDS` (a `Set<string>`). Scoping is applied two ways:

**1. Server-side (preferred).** Several list commands accept a *typed* business filter the API honours server-side — using it returns only the selected location's rows AND far less data (e.g. 28 coworkers vs 5547 account-wide). The mapping lives in `BUSINESS_FLAG`:

| Entity | Flag |
|---|---|
| invoices, products, tariffs, discountCodes, teamsList | `--business-id` |
| coworkersAll | `--invoicing-business-id` |

> Note: the shared `--business` flag is silently ignored by every list command — only these typed per-entity flags work. `scopedPlan(entityKey, baseArgs)` builds one CLI arg-set per selected business; `unionById()` concatenates and de-dupes the results by record `Id`.

**2. In-memory (fallback).** Entities with no server-side filter are fetched account-wide and dropped by `filterByBusiness(items)`, which matches against `BusinessId` / `InvoicingBusinessId` / `DefaultBusinessId` / `FloorPlanBusinessId` / `Businesses[].Id`. Entities with no business field at all (paymentmethods, contractdeposits, contractpausedperiods, booking credits) are kept and constrained indirectly via joins against already-filtered Coworker / contract / tariff / product sets. Contracts specifically have no business field and no server-side filter, so they are scoped by joining each contract's `CoworkerId` to the selected businesses' coworker IDs (`filterContractsByScope` → `getScopedCoworkerIdSet`). `getBusinesses()` is a special case — filters on `Id`, not `BusinessId`. Charges (#23, uninvoiced charges) iterates only the selected `getBusinesses()` results, so per-business charge fetches scale with selection.

### Business-ID validation (fail-fast)

At startup `audit.js` calls `nexudus businesses list` once and stashes the IDs in `cache.accessibleBusinessIds`. Every supplied `--business-ids` value is then checked against that set:

- Unknown ID → `Business ID "X" is not in your accessible businesses…` and exit 1. The error message **never lists the operator's actual IDs**, so AI-driven invocations don't leak the business list into the conversation.
- Non-numeric ID → `Invalid Business ID: "X" (must be numeric)` and exit 1.
- Empty value (`--business-ids ""`) → rejected with the same message — does NOT silently audit-all.

Interactive mode applies a **two-strike** rule: empty input or a bad ID prints the error and re-prompts once. A second bad/empty answer exits non-zero. Empty input prompt:

```
Enter Business IDs to audit, comma-separated (or "all"):
Must enter business ID to continue
Enter Business IDs to audit, comma-separated (or "all"):
No valid Business ID entered after 2 attempts. Exiting.
```

## PII Redaction (CLI 5.0.16+)

The Nexudus CLI tokenizes every name / email / phone / address field server-side, replacing them with `«PII:TYPE:hash»` tokens and writing a local reverse map to `~/.nexudus/pii-tokens.json`. The audit leans on this rather than rolling its own tokenizer:

- **`.md`** keeps the CLI tokens verbatim → AI-safe to read once the operator consents.
- **`.html`** is the operator-only deliverable, so `loadCliTokenMap()` + `detokenizeResults()` reverse the tokens back to real values using that same local store. If the store is missing, the `.html` keeps tokens and a console note is printed.
- **`detectPiiMode()`** probes the CLI envelope's `piiRedaction` flag once at startup (`businesses list --page-size 1`). If the operator has run `pii-mode unlocked`, the flag is `off`, fetches return **clear** data at full speed, `FETCH_CLEAR` is set, and the script **warns** that the `.md` will contain real PII (the audit does not tokenize on its own). Run with pii-mode locked for a redacted `.md`.

`FETCH_CLEAR` is also folded into the disk-cache key (`__clear` suffix) so clear and tokenized fetches never share a cache file.

**Performance impact:** tokenizing 500 records × dozens of PII fields per page makes large `coworkers list` pages slow (~61–66s each) and the .NET CLI crashes (exit `-1` / `4294967295`, empty stderr) when these heavy pages run concurrently. So redacted runs are pinned to `MAX_CONCURRENT_CLI_REDACTED = 1` (sequential is 100% reliable and actually faster under redaction) and `CLI_TIMEOUT` is 180s to clear a single slow page. Clear runs (pii-mode unlocked) have no tokenization step, so the gate widens to `MAX_CONCURRENT_CLI_CLEAR = 4` — the effective limit is picked at startup from the envelope's `piiRedaction` flag.

## Member vs Contact

- **Member** — Coworker with at least one active (non-cancelled) contract.
- **Contact** — Coworker with no active contract.

Reports include `Coworkers: <total> — <Members>, <Contacts>` in the header whenever Coworker data was fetched (see `computeCoworkerStats()`). Checks whose subject may be a Member or a Contact use a `Coworker` column header: #1, #2, #6, #10, #12, #14, #17, #22, #23, #24, #27, #29 (and #32's `Coworkers`). Of these, the six finance/desk checks that also render a per-row Member/Contact **Type** column via `classifyCoworkerById()` are #1, #2, #6, #10, #23, #24. Member-only checks use capitalized `Member` / `Members` (#3, #4, #5, #8, #9, #11, #16, #18, #19, #33, #34).

## Resilience

- **Auth verified upfront.** `main()` runs `nexudus doctor` before any work; if not logged in it exits 1 with a `nexudus login` hint.
- `runCLI()` / `runCLIAsync()` retry transient failures up to `CLI_RETRIES=3` times with `RETRY_BACKOFF_MS=[1000, 2000, 4000]`. `isTransientCliError()` treats as transient: timeout, ECONNRESET, ECONNREFUSED, ENETUNREACH, socket hang up, 5xx, "Non-JSON output", and the CLI's silent-crash signature (`exited with code 4294967295` / `-1` with no stderr — anchored so a crash carrying a real auth/validation error is *not* blanket-retried). Auth/4xx errors fail fast.
- `classifyError()` buckets failures into `auth | timeout | network | unexpected-schema | cli-bug | unknown`, each with an operator hint (`ERROR_HINTS`) rendered in both reports.
- `MAX_PAGES = 1000` (500k records) safety guard against runaway pagination.
- `CLI_TIMEOUT = 180_000` (180s) — raised from 60s because PII tokenization made large list pages take ~66s.
- `MAX_CONCURRENT_CLI_REDACTED = 1` — concurrent redacted fetches crash the .NET CLI, so async/prefetch CLI calls are serialized through a slot gate. Clear runs widen the gate to `MAX_CONCURRENT_CLI_CLEAR = 4`.
- Single-instance lock (`.audit-cache/audit.lock`, live PID; stale locks reclaimed) prevents concurrent runs racing on cache/output.
- Per-check try/catch — failed checks marked `ERROR` and audit continues.

## Data Caching

All checks share a single in-memory `cache` object. Common helpers:
- `getCoworkersAll/Active/Inactive/Archived()`, `getContracts()`, `getInvoices()`, `getProducts()`, `getTariffs()`, `getPaymentMethods()`, `getDiscountCodes()`, `getBusinesses()`, `getTeamsList()`, `getTariffCredits()`, `getProductCredits()`
- **Single coworker fetch.** A no-flag `coworkers list` returns every coworker (archived included), each carrying boolean `Active` / `Archived`. `getCoworkersAll()` fetches once; the Active/Inactive/Archived getters derive their buckets in-memory — collapsing the old 3 paginated fetches (the dominant cost) into 1.
- Each helper applies `filterByBusiness` (or the server-side scoped fetch) once when populating cache. Lazy — entities not needed by selected checks are never fetched (this is what makes Quick fast).
- **Opt-in disk cache** (`--cache`): list fetches persist to `.audit-cache/<operator-hash>/<entity>.json` (1h TTL, sha256-keyed by accessible business IDs, atomic tmp+rename). Cache keys are scope- and `FETCH_CLEAR`-suffixed so a scoped/clear run never reuses an account-wide/tokenized file.

## Key Config Constants

- `PAGE_SIZE = 500`, `MAX_PAGES = 1000`
- `CLI_TIMEOUT = 180_000`, `MAX_CONCURRENT_CLI_REDACTED = 1`, `MAX_CONCURRENT_CLI_CLEAR = 4`, `CLI_RETRIES = 3`, `RETRY_BACKOFF_MS = [1000, 2000, 4000]`
- `DRAFT_STALE_DAYS = 7`, `BOOKING_STALE_DAYS = 7`, `CHARGE_STALE_DAYS = 30`, `CHECKIN_STALE_HOURS = 24`, `OVERDUE_WRITEOFF_DAYS = 365`
- `CONTRACT_LIMIT_WARNING = 20`, `CONTRACT_LIMIT_MAX = 25`
- `STALE_OPERATOR_DAYS = 90`, `UNASSIGNED_TICKET_DAYS = 7`
- Cache: `CACHE_TTL_MS = 1h`

## Known Quirks

1. **Charges require per-business filter**: Already handled by check #23 (uninvoiced charges) iterating `getBusinesses()`.
2. **`contractdeposits` / `contractpausedperiods` / `paymentmethods` / booking credits**: no `BusinessId` field. Filtered indirectly via joins (commented in code).
3. **`--business` flag is a decoy**: silently ignored by every list command. Server-side scoping only works via the typed per-entity flags in `BUSINESS_FLAG`.
4. **pii-mode unlocked → real PII in `.md`**: the audit relies on the CLI's tokenization; an unlocked session yields clear data and a console warning.

## Report Building

**Markdown** (`buildReport(results, ranDefs, scopeMeta)`):
- Header includes scope (Business IDs, depth, checks ran) and Coworker breakdown
- Executive summary table over checks that ran
- Detail sections per check (severity grouped, HIGH first)
- Insights section
- Raw JSON in collapsible `<details>` block

**HTML** (`buildHtmlReport(results, ranDefs, scopeMeta)`):
- Header with scope, depth, Coworker breakdown, total issue count
- Executive summary table (clickable links to issues below)
- Detail sections per check with severity badges, severity-grouped, HIGH first
- Each finding includes a **Recommended action** card (plain-English steps sourced from `help.nexudus.com`)
- Scrollable tables (max-height 400px with sticky headers) to minimize page scrolling on large datasets
- Self-contained (inline CSS, no external dependencies)

Only checks that actually ran appear in either report — no misleading "0 issues" rows for skipped checks.

## Privacy Protocol (AI flow)

1. Operator provides Business IDs themselves (do NOT run `nexudus businesses list` for them).
2. Run `node audit.js --show-checks`, paste the table, ask for choice.
3. Run audit with flags. Show user the file paths (HTML is clickable) + console issue count.
4. **DO NOT read `.md` yet.** In a normal locked run it holds CLI PII tokens (AI-safe), but the gate still applies.
5. Wait for explicit YES.
6. Only then: read `.md`, present findings, execute fixes one at a time with confirmation.
7. **Never read the `.html`** — it contains de-tokenized real PII and is an operator-only deliverable, off-limits to the AI even after consent.

## Output Filenames & Location

- **Default location:** `skills/nexudus-audit/scripts/reports/` (i.e. a `reports/` folder next to `audit.js`, via `path.join(__dirname, 'reports')`)
- **Files:** 
  - `account-audit-YYYY-MM-DD-HH-MM-SS.md` (full technical report with fix commands + raw JSON)
  - `account-audit-YYYY-MM-DD-HH-MM-SS.html` (operator-friendly report, derived from `.md` path)
- **Override with `--output <path>`:** Both files are written to the directory of your specified path (`.html` derived from `.md`)
- **Cleanup:** Simply delete the `reports/` folder when you're done accumulating audit runs

(HTML file path is output as a clickable `file:///` URL in the terminal for easy access.)

## Entry Points

- Main: `async main()` — parses args, runs interactive prompts if needed, sets `SELECTED_BUSINESS_IDS`, selects checks via `selectChecks(level, customNums)`, runs them, writes both reports.
- Individual checks: `checkDuplicateEmails()`, `checkDesksOnCancelledContracts()`, etc.
- Registry: `CHECK_DEFS` array — defines name, severity, columns, row renderer, check function for each of 34 checks. Tier membership in `CHECK_TIERS` map (by check number).
