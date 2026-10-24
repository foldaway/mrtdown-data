# Querying retained scheduled departures

`queryRetainedScheduledDepartures` from `@mrtdown/fs` returns boarding departures
for a canonical station, service, destination and optional platform. It uses the
[retained import store and version selector](gtfs-timetable-import.md), without
changing canonical data or generating frequency estimates.

```ts
const result = await queryRetainedScheduledDepartures({
  storeDir,
  dataDir,
  scope: {
    stationId: "S",
    lineId: "NSL",
    serviceId: "SVC",
    destinationStationId: "D",
    platformId: "C",
  },
  startInstant: "2026-01-02T00:30:00+08:00",
  endInstant: "2026-01-02T01:30:00+08:00",
  limit: 3,
});
```

Supply offset-bearing instants with an end after the start and a window of at
most 24 hours. The optional limit must be a positive integer; omitting it returns
all matching timed departures. The interval includes its start and excludes its
end. Invalid bounds, scope or review history throw.

## Service days and selection

The query captures one validated history snapshot. An import committed during
the query is considered on the next call. Keep canonical data and committed
store files stable throughout the read; atomic appends are allowed.

It checks compatible retained timetable files to discover the largest source
departure offset, then derives candidate Singapore service dates using the core
GTFS service-day helper. The search includes the local dates intersecting the
window even when their calendars have no active trips. It supports offsets beyond
48 hours; it does not assume that all overnight trips belong to yesterday.

For each candidate date, the selector independently checks feed range, canonical
compatibility, scope and mapping coverage using that captured history. Calendar
exceptions and assignment ranges come from the version selected for that date.
A previous date's `25:00` trip can therefore come from an older eligible version,
while today's `00:45` trip uses its reviewed successor. The query builds absolute
UTC instants, merges all service days, sorts them and only then applies the limit.
A provider trip id reused on different service dates remains two distinct trips.

Pass the optional [reviewed rollback](gtfs-timetable-import.md#reviewed-rollback-for-a-date-and-scope)
as `rollback` to override selection only for its inclusive service-date range
and exact request scope. Each `serviceDays` entry includes its own `rollback`
assessment, so an overnight query can use an older reviewed version for the
previous service date and ordinary selection for today. An applicable rejected
rollback leaves that date unavailable and makes the query incomplete; departures
from other eligible service dates remain available. The review and trusted
selection clock are captured before reading retained history.

Only occurrences at the requested station and platform are returned. The shared
boarding rules exclude no-pickup stops and occurrences without a later alighting
opportunity. Conditional pickup rules remain in the result. Repeated station
visits retain their separate source stop sequences, and grouped platform
alternatives stay together rather than assigning an individual platform.

## Results and missing data

Each departure retains the canonical pattern identities, provider trip/route/
calendar ids, textual stop sequence, service date, original timing seconds,
access rules and `timepoint`. It adds:

- `basis: "scheduled"`;
- `precision: "exact"` for `timepoint=1` or the GTFS default, and
  `"approximate"` for `timepoint=0`;
- `manifestSha256`, source ZIP `snapshotSha256`, `retrievedAt` and
  `correctionRevision` for the selected artifact.

The result also contains `scope`, `window`, `serviceDays`, `unavailableArtifacts`,
`untimedDepartureCount` and `complete`. Each service day names its selected
manifest, or null, alongside the selector's eligibility and rejection reasons.
Unavailable timetable/notice files are reported separately. Invalid manifest or
review history fails the history check; the query does not invent source order.

A boardable occurrence without a source departure time is omitted from the timed
results and counted in `untimedDepartureCount`. This count covers matching
occurrences on candidate service days; their unknown times cannot establish
whether they fall inside the window. No interpolation or estimated replacement
is invented. `complete` is false when these untimed occurrences exist, a required
service date has no eligible version, or a compatible retained artifact could not
be read for offset discovery. Usable departures from other dates can still be
returned alongside that incomplete status.

An empty result with `complete: true` remains distinct from missing coverage.
Neither an empty result nor `complete` proves normal live service. Approximate
scheduled times are not frequency estimates, and missing data does not authorize
silently substituting an estimate or a crowd report.

This is a local file-backed query helper. It reads retained files and repeats
canonical validation; a consuming service still needs its import/read-model and
cache integration. Scoped completeness for partial artifacts remains conservative
as described in the selector documentation. Release permission, current terms,
real mapping approvals, rollback review authority, API/UI presentation and the crowd-report
overlay remain separate requirements. These helpers do not enable default GTFS
publication or mark a local proposal as an approved release.
