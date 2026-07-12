---
"@mrtdown/core": major
"@mrtdown/fs": patch
---

Require station code period boundaries to use date-only values and interpret
them in the Singapore time zone during validation.

Make station service-reference validation deterministic by checking all service
revisions instead of selecting revisions based on the current time.
