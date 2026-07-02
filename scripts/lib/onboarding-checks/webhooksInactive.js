const { getWebhooks } = require('../data');
const { table } = require('./_helpers');

// #26. Active webhooks with an empty or malformed URL — a static shape check
// only (http(s):// prefix present, non-empty), no live ping, matching this
// audit's read-only scope.
//
// Field-name note: `nexudus webhooks list --help` confirms the filter flag is
// `--u-r-l` (each letter hyphen-separated, not `--url`) — the CLI's flag
// generator only does that when the source property has multiple consecutive
// capitals, i.e. the underlying field is almost certainly `URL` (all-caps),
// not `Url`. Both castings are checked defensively since --help documents
// filter flags, not response field names, and the actual JSON casing cannot
// be confirmed without a live fetch (out of scope for this read-only
// verification pass).
function readUrl(w) {
  return w.URL ?? w.Url ?? w.Uri ?? '';
}

function isValidHttpUrl(value) {
  const s = String(value || '').trim();
  return /^https?:\/\/.+/i.test(s);
}

function checkWebhooksInactive() {
  const webhooks = getWebhooks();
  if (webhooks.length === 0) {
    return { status: 'skip', detail: 'No webhooks configured for this scope.' };
  }

  const active = webhooks.filter(w => w && w.Active);
  const inactiveCount = webhooks.length - active.length;
  if (active.length === 0) {
    return {
      status: 'pass',
      detail: `No active webhooks configured (${inactiveCount} inactive, not evaluated).`,
    };
  }

  const broken = active.filter(w => !isValidHttpUrl(readUrl(w)));
  if (broken.length === 0) {
    return {
      status: 'pass',
      detail: `All ${active.length} active webhook${active.length !== 1 ? 's have' : ' has'} a valid URL configured.${inactiveCount > 0 ? ` (${inactiveCount} inactive, not evaluated.)` : ''}`,
    };
  }
  const allBroken = broken.length === active.length;
  return {
    status: allBroken ? 'fail' : 'warn',
    detail: table(
      ['Webhook', 'Action', 'URL'],
      broken.map(w => [w.Name || `#${w.Id}`, w.Action || '—', readUrl(w) || '(empty)']),
    ),
    // The 100%-broken case gets a distinct hint: since readUrl()'s field-name
    // guess (URL/Url/Uri) isn't confirmed against a live payload (see the
    // header comment), *every* active webhook showing as broken is at least
    // as consistent with "this check is reading the wrong field" as with
    // "every webhook is genuinely misconfigured" — flag that alternative
    // explicitly so it isn't taken as a confirmed 100% outage.
    hint: allBroken
      ? 'All active webhooks show a missing/invalid URL — before treating this as confirmed, verify manually in Settings > Webhooks: this check\'s guess at the URL field name has not been validated against real API output, so a 100% flag rate can also mean the field name is wrong, not that every webhook is broken.'
      : 'Open Settings > Webhooks and fix the URL (must be a valid http(s):// endpoint) on these active webhooks, or deactivate them if no longer in use. This check only validates URL shape — it does not ping the endpoint.',
  };
}

module.exports = checkWebhooksInactive;
