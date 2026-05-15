This directory provides shared fixture data for evaluation, testing, demos, and static export experiments.

The fixture `data` tree is intentionally partial, not a complete standalone mrtdown-data repository. It contains only the files needed for current fixture cases, and may reference identifiers from the root `data` tree without including those entity files.

Line references are an exception: fixture services and station codes must point to line files in this fixture tree, not implicit lines from the root `data` tree.

Static fixture exports should publish this fixture tree only. They should not copy every entity from the root `data` tree into the fixture archive.

All included MRT lines and stations are possibly fictional.
