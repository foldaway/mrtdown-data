This directory provides shared fixture data for evaluation, testing, demos, and static export experiments.

The fixture `data` tree is intentionally small, but it should be internally
standalone. Fixture records must include local files for the static entities they
reference so validation can catch dangling IDs before static exports are built.

Static fixture exports should publish this fixture tree only. They should not copy every entity from the root `data` tree into the fixture archive.

All included MRT lines and stations are possibly fictional.
