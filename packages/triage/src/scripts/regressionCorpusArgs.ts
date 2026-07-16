import {
  type RegressionFailureLabel,
  RegressionFailureLabelSchema,
} from '../regression/case.js';

export interface RegressionCorpusArgs {
  caseId?: string;
  help: boolean;
  json: boolean;
  label?: RegressionFailureLabel;
  replay: boolean;
}

export function parseRegressionCorpusArgs(
  argv: string[],
): RegressionCorpusArgs {
  let caseId: string | undefined;
  let help = false;
  let json = false;
  let label: RegressionFailureLabel | undefined;
  let replay = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--list') {
      continue;
    }
    if (arg === '--replay') {
      replay = true;
      continue;
    }
    if (arg === '--case') {
      const value = argv[index + 1];
      if (value == null || value.startsWith('-')) {
        throw new Error('Missing value for --case');
      }
      caseId = value;
      index++;
      continue;
    }
    if (arg === '--label') {
      const value = argv[index + 1];
      if (value == null || value.startsWith('-')) {
        throw new Error('Missing value for --label');
      }
      label = RegressionFailureLabelSchema.parse(value);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { caseId, help, json, label, replay };
}
