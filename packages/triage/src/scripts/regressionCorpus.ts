import {
  filterRegressionCases,
  formatRegressionCaseSummary,
  loadRegressionCorpus,
} from '../regression/corpus.js';
import { replayRegressionCase } from '../regression/replay.js';
import { withConsoleLogRedirectedToStderr } from './consoleOutput.js';
import { parseRegressionCorpusArgs } from './regressionCorpusArgs.js';

const usage = `
Usage:
  npm run triage:regressions -- --list
  npm run triage:regressions -- --case <case-id>
  npm run triage:regressions -- --label <failure-label>
  npm run triage:regressions -- --case <case-id> --replay

Options:
  --case <case-id>  Inspect one historical case.
  --label <label>   Filter by failure taxonomy label.
  --json            Print matching cases as JSON.
  --list            List matching cases (the default).
  --replay          Run paid semantic replay against the recorded base revision.
  --help, -h        Show this help.
`.trim();

let args: ReturnType<typeof parseRegressionCorpusArgs>;
try {
  args = parseRegressionCorpusArgs(process.argv.slice(2));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Could not parse arguments.',
  );
  console.error(usage);
  process.exit(1);
}

if (args.help) {
  console.log(usage);
  process.exit(0);
}

const cases = filterRegressionCases(loadRegressionCorpus(), {
  caseId: args.caseId,
  label: args.label,
});

if (cases.length === 0) {
  console.error('No regression cases matched the requested filters.');
  process.exit(1);
}

if (args.replay) {
  if (process.env.OPENAI_API_KEY == null) {
    console.error('--replay requires OPENAI_API_KEY for paid model calls.');
    process.exit(1);
  }

  console.error(
    `[triage:regressions] Replaying ${cases.length} case(s) with paid model calls.`,
  );
  const runReplays = async () => {
    const reports = [];
    for (const regressionCase of cases) {
      reports.push(await replayRegressionCase(regressionCase));
    }
    return reports;
  };
  const reports = args.json
    ? await withConsoleLogRedirectedToStderr(runReplays)
    : await runReplays();

  if (args.json) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    for (const report of reports) {
      console.log(
        `${report.passed ? 'PASS' : 'FAIL'} ${report.caseId}: ${report.actual.outcome.kind}`,
      );
      for (const mismatch of report.mismatches) {
        console.log(`  - ${mismatch}`);
      }
    }
    console.log(
      `\n${reports.filter((report) => report.passed).length}/${reports.length} case(s) passed.`,
    );
  }

  if (reports.some((report) => !report.passed)) {
    process.exitCode = 1;
  }
} else if (args.json || args.caseId != null) {
  console.log(JSON.stringify(args.caseId != null ? cases[0] : cases, null, 2));
} else {
  for (const regressionCase of cases) {
    console.log(formatRegressionCaseSummary(regressionCase));
  }
  console.log(`\n${cases.length} case(s).`);
}
