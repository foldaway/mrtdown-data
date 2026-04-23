import {
  reExtractAndReplay,
  replayImpactEvents,
  type ReExtractMode,
} from '@mrtdown/triage';

type IssueRepairOptions = {
  dataDir: string;
};

const REEXTRACT_MODES = new Set<ReExtractMode>([
  'period-violations',
  'degraded-future-no-service',
  'empty-impact',
]);

export function runIssueReplay(
  opts: IssueRepairOptions,
  args: {
    issueIds?: string[];
    dryRun?: boolean;
  },
): number {
  const summary = replayImpactEvents({
    dataDir: opts.dataDir,
    issueIds: args.issueIds,
    dryRun: args.dryRun,
  });

  console.log(
    `${args.dryRun ? 'Would replay' : 'Replayed'} impact events for ${summary.issuesProcessed} issue(s).`,
  );

  for (const result of summary.results) {
    console.log(
      `${result.issueId}: ${result.before} -> ${result.after} events (${result.diff >= 0 ? '+' : ''}${result.diff})`,
    );
  }

  console.log(
    `Total impact events: ${summary.totalBefore} -> ${summary.totalAfter} (${summary.totalAfter - summary.totalBefore >= 0 ? '+' : ''}${summary.totalAfter - summary.totalBefore})`,
  );
  return 0;
}

export async function runIssueReextract(
  opts: IssueRepairOptions,
  args: {
    mode?: string;
    issueIds?: string[];
    evidenceIds?: string[];
    dryRun?: boolean;
  },
): Promise<number> {
  const mode = args.mode ?? 'period-violations';
  if (!REEXTRACT_MODES.has(mode as ReExtractMode)) {
    console.error(
      `Unsupported mode "${mode}". Expected one of: ${[...REEXTRACT_MODES].join(', ')}`,
    );
    return 1;
  }

  const summary = await reExtractAndReplay({
    dataDir: opts.dataDir,
    mode: mode as ReExtractMode,
    issueIds: args.issueIds,
    evidenceIds: args.evidenceIds,
    dryRun: args.dryRun,
  });

  console.log(
    `Found ${summary.totalTargetIssues} issue(s) for mode "${summary.mode}" (${summary.totalTargetEvidenceItems} evidence item(s)).`,
  );

  if (summary.dryRun) {
    for (const result of summary.results) {
      console.log(
        `${result.issueId}: ${result.targetedEvidenceIds.join(', ')}`,
      );
    }
    return 0;
  }

  for (const result of summary.results) {
    console.log(
      `${result.issueId}: ${result.before} -> ${result.after} events (${(result.diff ?? 0) >= 0 ? '+' : ''}${result.diff})`,
    );
  }

  if (summary.extractErrors > 0) {
    console.error(
      `${summary.extractErrors} extraction error(s) occurred; some evidence items were replayed from original claims.`,
    );
    return 1;
  }

  console.log(
    `Total impact events: ${summary.totalBefore} -> ${summary.totalAfter} (${summary.totalAfter - summary.totalBefore >= 0 ? '+' : ''}${summary.totalAfter - summary.totalBefore})`,
  );
  return 0;
}
