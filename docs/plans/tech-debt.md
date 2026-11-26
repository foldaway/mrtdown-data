# Tech Debt

Track durable follow-up items here when they span multiple PRs or need
agent-visible context. Prefer GitHub issues for single, actionable tasks.

## Station timing coverage

The [first/last train implementation](completed/station-first-last-train-data.md)
is shipped. Investigate a coverage report or Pages discovery index only when a
consumer needs one. Before comparing these recurring timings with exact GTFS,
define the source evidence, holiday categories, stopping patterns, and service-date
rules so an intentional difference is not reported as an error. No coverage
feature or GTFS validation role has been selected.
