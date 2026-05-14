# @mrtdown/triage

LLM-assisted evidence triage and replay utilities for MRTDown data.

Normal package builds and tests are deterministic. They must not call a model
provider.

## Commands

```bash
npm run build:triage
npm run test:triage
```

## Paid Eval

`test:eval` is reserved for model-dependent triage evaluation. It must not run
implicitly through `npm test`, `npm run test:packages`, or CI harness commands.

Required environment variables:

- `OPENAI_API_KEY`: OpenAI API key used by eval cases.

Model dependency:

- `extractClaimsFromNewEvidence` uses `gpt-5-mini`.
- `triageNewEvidence` uses `gpt-5-mini`.
- title/slug generation and translation use `gpt-5-nano`.

Expected cost before running the checked-in eval set: less than USD 1 with the
current short fixtures. Revisit this estimate in the same PR when adding or
expanding eval cases.
