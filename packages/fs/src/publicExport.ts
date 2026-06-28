import { resolve } from 'node:path';
import { EvidenceSchema, SourceRegistrySchema } from '@mrtdown/core';
import {
  evidenceFileName,
  rightsDirectory,
  sourceRegistryFileName,
} from './constants.js';
import { listIssueBundles } from './issues.js';
import { readJsonFile, writeNdjsonFile } from './json.js';
import { resolveSourceRegistryRule } from './rights.js';

export type PublicExportEvidenceFilterResult = {
  redactedEvidenceCount: number;
};

export const nonPublicEvidenceRedactedText =
  'Non-public evidence text redacted from generated public export.';

export async function redactNonPublicEvidenceForExport(
  dataDir: string,
): Promise<PublicExportEvidenceFilterResult> {
  const sourceRegistry = await readJsonFile(
    resolve(dataDir, rightsDirectory, sourceRegistryFileName),
    SourceRegistrySchema,
  );
  let redactedEvidenceCount = 0;

  for (const bundle of await listIssueBundles(dataDir)) {
    let bundleRedactedEvidenceCount = 0;
    const publicEvidence = bundle.evidence.map((evidence) => {
      const result = resolveSourceRegistryRule(sourceRegistry, evidence);
      if (!result.ok || result.rule.publicExportAllowed) {
        return evidence;
      }

      bundleRedactedEvidenceCount += 1;
      return EvidenceSchema.parse({
        ...evidence,
        text: nonPublicEvidenceRedactedText,
        render: null,
      });
    });

    if (bundleRedactedEvidenceCount === 0) {
      continue;
    }

    redactedEvidenceCount += bundleRedactedEvidenceCount;
    await writeNdjsonFile(
      resolve(dataDir, bundle.path, evidenceFileName),
      publicEvidence,
    );
  }

  return { redactedEvidenceCount };
}
