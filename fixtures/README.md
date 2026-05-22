This directory provides shared fixture data for evaluation, testing, demos, and static export experiments.

The fixture `data` tree is intentionally small, but it should be internally
standalone. Fixture records must include local files for the static entities they
reference so validation can catch dangling IDs before static exports are built.

Static fixture exports should publish this fixture tree only. They should not copy every entity from the root `data` tree into the fixture archive.

The main fixture rail services use obsolete historical planning names mapped to
real corridors: the Bukit Timah Line follows the Downtown Line Stage 2 corridor,
and the Eastern Region Line follows the eastern / East Coast corridors that were
later absorbed into the Downtown and Thomson-East Coast lines. Fixture line codes
remain fixture-local and are not canonical LTA station codes.
