# NEL public-holiday date review

The NEL holiday policy now has a usable date resolver and inspection draft.
It replaces weekday or Saturday service dates with the reviewed Sunday family
on Singapore public holidays. It implements the
[28 October review assumption](gtfs-nel-mapping-review-2026-10-28.md#actual-date-sets-and-all-14-cells)
for NEL only. This is a Foldaway assumption, not operator confirmation that every
full-day Sunday and public-holiday departure is identical.

## Pinned inputs

The [holiday calendar](gtfs-singapore-public-holidays-2026.json) records the
Ministry of Manpower's [2026 dataset](https://data.gov.sg/datasets/d_149b61ad0a22f61c09dc80f2df5bbec8/view),
updated 3 July 2026 and checked 3 November 2026. Its 14 dates include the
observed Mondays on 1 June, 10 August and 9 November. The
[original announcement](https://www.mom.gov.sg/newsroom/press-releases/2025/0616-public-holidays-for-2026)
also identifies those observed holidays. The dataset supplies the later date
list without the announcement's provisional markers for the two Hari Raya dates.
The recorded API response is 1,482 bytes with SHA-256
`ba447d97a42fab69a3c2592080df902138131952f9f3f09d4a1c56e36a59226c`.

The [policy](gtfs-nel-holiday-policy-2026.json) pins the complete original source
manifest and the normalized holiday-calendar digest. It explicitly binds the
three NEL route IDs and `SERVICE_WD`, `SERVICE_WE`, `SERVICE_PH` to NEL. Other
routes sharing those IDs retain their literal dates; CCL's separate families
remain deferred. The policy revision is
`foldaway-nel-sunday-public-holidays-2026-v1`.

## Resolve and inspect

`resolveScheduledHolidayDates(context, policy, holidays)` in `@mrtdown/fs`
returns each original pattern and trip ID, source dates, effective dates, and
added/removed dates. Omitting the policy returns literal dates. With a policy,
the resolver requires its exact source manifest and holiday-calendar digest.
It parses the original calendars through the shared GTFS calendar parser and
reuses the existing active-date expansion. It never rewrites source tables,
trip IDs, stop IDs, timings, capture bytes or manifests.

The supported rule is intentionally narrow: three distinct, ordinary
Monday–Friday/Saturday/Sunday calendars with equal bounds inside the known
holiday date range, and trips in each calendar for each bound route. Any explicit
`calendar_dates.txt` row in a bound calendar fails closed, including additions,
removals and dates outside the holiday list. No precedence over such exceptions
is inferred; they need a separately reviewed policy before substitution can run.
Exceptions in unrelated calendars keep their existing behavior. Unknown policy
rules, missing pinned dates, unsupported weekly patterns, and bounds extending
beyond the holiday calendar fail closed. Calendar names such as `PH` never
activate the policy by themselves.

The rule uses the original **service date**. For example, a Saturday trip at
`25:00` remains Saturday's trip even if its wall-clock arrival is on a Sunday
holiday. Existing Sundays occur once. Holiday-eve extensions, extra trains and
dated closures are separate evidence and are not inferred here.

`createScheduledHolidayReviewDraft(context, policy, holidays)` reuses the
existing grouped entity proposals and reconciliation date checks. Every
effective date, including newly added dates, must pass canonical revision,
station-code, operator-period, platform-service and boarding checks before a
candidate is marked `proposed`. Complete platform alternatives retain the
every-member check. Gaps, ambiguities and unresolved identities remain
unresolved. Current undated platform compatibility is not proof of historical
allocation.

The separate `gtfs-holiday-date-review-draft` document records the original
source/canonical identity, full policy, policy digest, derived date-population
digest, exact dates and candidate evidence. Its draft digest binds these claims.
`verifyScheduledHolidayReviewDraft` regenerates the whole draft and rejects stale
or changed policy, dates, canonical evidence or claims. It accepts no approvals.
Existing strict mapping/assignment schemas reject this document. Both mapping
review eligibility and generation eligibility remain false.

Use the existing verified-capture runner with a fresh output directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/amk-correction-input-20261029/schedule.zip \
  /tmp/amk-correction-input-20261029/capture.json \
  NEL /tmp/new-nel-holiday-review \
  --canonical-commit d778e6568b596dc0fd50487fe4a4942cd6d1ded1 \
  --holiday-policy docs/gtfs-nel-holiday-policy-2026.json \
  --holiday-calendar docs/gtfs-singapore-public-holidays-2026.json
```

Run comparisons under Node 24 with `TZ=UTC`. The runner checks the capture hash
and size, requires committed canonical data, and checks that the selected commit
has the same data tree. The pilot must match the policy's explicit lines.
Holiday mode writes `holiday-date-review.json` and `summary.json`; it cannot be
combined with mapping, blocker or assignment options. Ordinary invocation keeps
the literal-source behavior. Large generated reports stay outside Git.

## October capture result

The [public receipt and ZIP](gtfs-public-handoff.md) have capture SHA-256
`9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a`
and ZIP size 2,981,645 bytes. The run above uses merged canonical commit
`d778e6568b596dc0fd50487fe4a4942cd6d1ded1`, topology projection version 1,
digest `11c4859f99d75c66aebe93f05e7e4e140c9b8842df02d250a904d69311e0921f`.

All 14 NEL patterns pass the current effective-date candidate checks. Weekday
families have 251 effective dates instead of 261; Saturday families have 51
instead of 52; Sunday families have 63 instead of 52. The three holidays already
on Sundays add no duplicate dates.

| NEL trip/date population | Count |
| --- | ---: |
| Literal source | 238,205 |
| Added Sunday-family pairs | 5,247 |
| Removed weekday/Saturday pairs | 7,695 |
| Effective derived population | 235,757 |

These are date-review populations, not new assignments or a coverage gain. The
policy digest is
`170531b13d89a20a2018edc685dc33394483ac00b9bacd8d3c639221ebf80943`;
the date-population digest is
`5398b5e94594421cfebc7e3aa09cfa2106d5ddc507b7a316f75048cc1c0bff91`.

## Remaining consumers and gates

Policy-aware mapping approvals, exact-date assignments, assigned timetable
bundles and departure queries are deferred. Their current contracts deliberately
remain literal-source contracts; adding a holiday date to an existing assignment
does not become valid through this inspection feature. Other line activation,
source-platform corrections and dated engineering exceptions are separate work.

Source admission, digest-bound mapping/source reviews, release approval,
whole-feed assignment coverage and public publication still require their
existing gates. This PR supplies none of those approvals and does not relax the
whole-feed selector. The literal-source unresolved population after the CCK
correction remains a separate diagnostic baseline; NEL holiday checks do not
resolve other lines or publish a timetable.
