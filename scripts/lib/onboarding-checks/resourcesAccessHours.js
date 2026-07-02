// #10. "Resource access hours match the location's opening hours" — a good
// idea (samaudittoollocal candidate list), but not reachable from the CLI:
// resources expose booking-rule fields (min/max length, advance/cancellation
// limits) and business profiles expose weekly opening hours, but there is no
// field connecting an individual resource's *access* hours (e.g. an access
// control schedule) to the business's published opening hours. Comparing the
// two would require the access-control/floor-plan APIs, which the `nexudus`
// CLI does not expose read access to. Always skip with guidance.
function checkResourcesAccessHours() {
  return {
    status: 'skip',
    detail: 'Per-resource access-control hours are not exposed by the `nexudus` CLI, so they cannot be compared against the business\'s published opening hours automatically.',
    hint: 'If any resource uses an access-control schedule, manually confirm it matches the location\'s posted opening hours (Nexudus admin: Operations > Access Control).',
  };
}

module.exports = checkResourcesAccessHours;
