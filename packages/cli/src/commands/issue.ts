import { readIssueBundle } from '@mrtdown/fs';
import { deriveCurrentState } from '@mrtdown/triage/helpers/deriveCurrentState';
import type { CliIO, GlobalOptions } from '../types.js';

export async function runIssue(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const action = args.shift();

  if (action === 'state' || action === 'current-state') {
    const id = args.shift();
    if (!id) {
      throw new Error('issue state requires an id');
    }

    const bundle = await readIssueBundle(globals.dataDir, id);
    io.stdout(JSON.stringify(deriveCurrentState(bundle), null, 2));
    return 0;
  }

  throw new Error('issue requires state');
}
