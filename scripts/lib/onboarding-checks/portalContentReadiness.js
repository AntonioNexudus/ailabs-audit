const { TODAY, ARTICLE_RECENT_DAYS } = require('../config');
const {
  getCalendarEvents, getFaqArticles, getBlogPosts, getCommunityGroups,
} = require('../data');
const { table } = require('./_helpers');
const log = require('../log');

// #31. Member-portal content readiness. A brand-new space can have every plan,
// rate and gateway configured and still hand members an empty portal — no
// events to sign up for, no FAQs, no news, no groups. This probes the four
// content areas members actually land on and reports which ones are bare.
//
// Each probe is fetched and evaluated independently: an entity whose fetch
// fails is reported as "could not be checked", never as a content gap, so a
// transient CLI/API failure can't be mistaken for an empty portal.

// Published = no publish date at all, or a publish date that has already passed.
function isPublished(publishDate, now) {
  if (!publishDate) return true;
  const d = new Date(publishDate);
  // An unparseable date is treated as published rather than silently hiding
  // the record from the count.
  return !(d.getTime() > now.getTime());
}

function isFuture(dateStr, now) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return Number.isFinite(d.getTime()) && d.getTime() > now.getTime();
}

function checkPortalContentReadiness() {
  const now = TODAY;
  const articleCutoff = new Date(now);
  articleCutoff.setDate(articleCutoff.getDate() - ARTICLE_RECENT_DAYS);

  const probes = [
    {
      area: 'Upcoming events',
      empty: 'None published',
      label: (n) => `${n} upcoming event${n !== 1 ? 's' : ''}`,
      count: () => getCalendarEvents()
        .filter(e => e && isFuture(e.StartDate, now) && isPublished(e.PublishDate, now)).length,
    },
    {
      area: 'FAQs',
      empty: 'None published',
      label: (n) => `${n} published FAQ${n !== 1 ? 's' : ''}`,
      count: () => getFaqArticles().filter(f => f && f.Active === true).length,
    },
    {
      area: 'News / articles',
      empty: `None in the last ${ARTICLE_RECENT_DAYS} days`,
      label: (n) => `${n} article${n !== 1 ? 's' : ''} in the last ${ARTICLE_RECENT_DAYS} days`,
      // `||` not `??`: a blank PublishDate string must fall back to CreatedOn
      // rather than being used and parsed as NaN. The upper bound matters too —
      // a post scheduled for next month isn't something a member can read now,
      // so it can't count as content the portal already has.
      count: () => getBlogPosts().filter(p => {
        const stamp = p && (p.PublishDate || p.CreatedOn);
        if (!stamp) return false;
        const d = new Date(stamp);
        if (!Number.isFinite(d.getTime())) return false;
        return d.getTime() >= articleCutoff.getTime() && d.getTime() <= now.getTime();
      }).length,
    },
    {
      area: 'Community groups',
      empty: 'None created',
      label: (n) => `${n} group${n !== 1 ? 's' : ''}`,
      count: () => getCommunityGroups().length,
    },
  ];

  // One try/catch per probe — a probe whose entity fetch throws is recorded as
  // unavailable and excluded from the gap tally entirely.
  const results = probes.map((probe) => {
    try {
      return { area: probe.area, n: probe.count(), probe };
    } catch (err) {
      log.warn(`  [warn] member-portal content probe "${probe.area}" could not be fetched: ${err.message}`);
      return { area: probe.area, unavailable: true, probe };
    }
  });

  const available = results.filter(r => !r.unavailable);
  if (available.length === 0) {
    return {
      status: 'skip',
      detail: `Could not check member-portal content: all ${results.length} entity fetches (events, FAQs, blog posts, community groups) failed. Re-run the audit; if it persists the CLI may not support these entities on this tenant.`,
    };
  }

  const unavailableCount = results.length - available.length;
  const caveat = unavailableCount > 0
    ? ` (${unavailableCount} area${unavailableCount !== 1 ? 's' : ''} could not be checked.)`
    : '';

  const gaps = available.filter(r => r.n === 0);
  if (gaps.length === 0) {
    return {
      status: 'pass',
      detail: `Member portal has content in every area checked: ${available.map(r => r.probe.label(r.n)).join(', ')}.${caveat}`,
    };
  }

  return {
    status: 'warn',
    detail: table(
      ['Area', 'Status'],
      results.map(r => [
        r.area,
        r.unavailable ? 'Could not be checked' : (r.n === 0 ? r.probe.empty : r.probe.label(r.n)),
      ]),
    ),
    hint: 'Populate the empty areas from the admin panel — Community > Events, Community > FAQ, Community > Blog and Community > Groups. A member who logs into the portal in their first week and finds nothing to read, book or join has no reason to come back, so an empty portal quietly costs a new space its early engagement.',
  };
}

module.exports = checkPortalContentReadiness;
