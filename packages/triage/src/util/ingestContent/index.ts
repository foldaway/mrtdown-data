import { resolve } from 'node:path';
import type { Evidence, Issue, IssueBundle } from '@mrtdown/core';
import {
  FileStore,
  FileWriteStore,
  IdGenerator,
  MRTDownRepository,
  MRTDownWriter,
} from '@mrtdown/fs';
import { DateTime } from 'luxon';
import { computeImpactFromEvidenceClaims } from '../../helpers/computeImpactFromEvidenceClaims.js';
import { extractClaimsFromNewEvidence } from '../../llm/functions/extractClaimsFromNewEvidence/index.js';
import { generateIssueTitleAndSlug } from '../../llm/functions/generateIssueTitleAndSlug/index.js';
import { translate } from '../../llm/functions/translate/index.js';
import { triageNewEvidence } from '../../llm/functions/triageNewEvidence/index.js';
import { assert } from '../assert.js';
import { formatContentTextForIngest } from './helpers/formatContentTextForIngest.js';
import { getEvidenceProvenanceForIngestContent } from './helpers/getEvidenceProvenanceForIngestContent.js';
import { getSlugDateTimeFromClaims } from './helpers/getSlugDateTimeFromClaims.js';
import type { IngestContent } from './types.js';

const DEFAULT_DATA_DIR = resolve(import.meta.dirname, '../../../../../data');

export interface IngestContentOptions {
  dataDir?: string;
}

function createRepository(dataDir: string): MRTDownRepository {
  return new MRTDownRepository({ store: new FileStore(dataDir) });
}

function createWriter(dataDir: string): MRTDownWriter {
  return new MRTDownWriter({ store: new FileWriteStore(dataDir) });
}

async function runLlmStep<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[ingestContent] ${label} failed:`, error);
    return null;
  }
}

/**
 * Ingests content from social media, news, or other sources into the MRTDown issue system.
 *
 * Triages the content to determine if it belongs to an existing issue or a new one, extracts
 * claims, computes impact (affected lines, stations, periods), and persists evidence and impact
 * events. Irrelevant content is ignored.
 *
 * @param content - The content to ingest (Reddit post, news article, or Twitter/Mastodon post).
 * @returns `null` when content is irrelevant or after successful ingestion.
 */
export async function ingestContent(
  content: IngestContent,
  { dataDir = DEFAULT_DATA_DIR }: IngestContentOptions = {},
) {
  // --- Normalise input ---
  // HACK: Force `createdAt` to be Asia/Singapore timezone
  const createdAt = DateTime.fromISO(content.createdAt)
    .setZone('Asia/Singapore')
    .toISO();
  assert(createdAt != null, 'Expected valid createdAt');

  const normalizedContent: IngestContent = {
    ...content,
    createdAt,
  };
  const text = formatContentTextForIngest(normalizedContent);
  console.log('[ingestContent]', normalizedContent);

  const repo = createRepository(dataDir);
  const writer = createWriter(dataDir);

  // --- Triage: existing issue, new issue, or irrelevant ---
  const triageResult = await runLlmStep('triageNewEvidence', () =>
    triageNewEvidence({
      newEvidence: {
        ts: normalizedContent.createdAt,
        text,
      },
      repo,
    }),
  );
  if (triageResult == null) {
    return null;
  }
  console.log('[ingestContent.triageNewEvidence]', triageResult);

  if (triageResult.result.kind === 'irrelevant-content') {
    console.log('[ingestContent] Nothing to do.');
    return null;
  }

  // --- Extract structured claims (lines, stations, periods, effects) ---
  const extractResult = await runLlmStep('extractClaimsFromNewEvidence', () =>
    extractClaimsFromNewEvidence({
      newEvidence: {
        ts: normalizedContent.createdAt,
        text,
      },
      repo,
    }),
  );
  if (extractResult == null) {
    return null;
  }
  const { claims } = extractResult;
  console.log('[ingestContent.extractClaimsFromNewEvidence]', claims);

  if (triageResult.result.kind === 'part-of-new-issue' && claims.length === 0) {
    console.log(
      '[ingestContent] No impact claims extracted for new issue; skipping persistence.',
    );
    return null;
  }

  // --- Resolve issue bundle: fetch existing or create new ---
  let issueBundle: IssueBundle;
  let shouldCreateIssue = false;

  switch (triageResult.result.kind) {
    case 'part-of-existing-issue': {
      // Load full bundle (issue + evidence + impact) for impact computation
      const { issueId } = triageResult.result;
      const existingBundle = repo.issues.get(issueId);
      assert(existingBundle != null, `Expected issue for id=${issueId}`);
      issueBundle = existingBundle;
      break;
    }
    case 'part-of-new-issue': {
      // Create issue: derive date from claims, generate title/slug, translate, persist
      const slugDateTime = DateTime.fromISO(
        getSlugDateTimeFromClaims(claims) ?? normalizedContent.createdAt,
      );
      assert(
        slugDateTime.isValid,
        `Invalid date: ${normalizedContent.createdAt}`,
      );

      const titleAndSlug = await runLlmStep('generateIssueTitleAndSlug', () =>
        generateIssueTitleAndSlug({
          text,
        }),
      );
      if (titleAndSlug == null) {
        return null;
      }
      const { title, slug } = titleAndSlug;
      console.log('[ingestContent.generateSlug]', slug);

      const translatedTitles = await runLlmStep('translateIssueTitle', () =>
        translate(title),
      );
      if (translatedTitles == null) {
        return null;
      }

      const issueId = `${slugDateTime.toFormat('yyyy-MM-dd')}-${slug}`;

      const issue: Issue = {
        id: issueId,
        type: triageResult.result.issueType,
        title: translatedTitles,
        titleMeta: {
          source: '@openai/gpt-5-nano',
        },
      };

      issueBundle = {
        issue,
        evidence: [],
        impactEvents: [],
        path: dataDir,
      };
      shouldCreateIssue = true;
      break;
    }
  }

  // --- Build evidence record ---
  const contentDateTime = DateTime.fromISO(normalizedContent.createdAt);
  assert(
    contentDateTime.isValid,
    `Invalid date: ${normalizedContent.createdAt}`,
  );

  const translatedEvidenceText = await runLlmStep('translateEvidenceText', () =>
    translate(text),
  );
  if (translatedEvidenceText == null) {
    return null;
  }
  const evidenceProvenance =
    getEvidenceProvenanceForIngestContent(normalizedContent);

  const evidence: Evidence = {
    id: IdGenerator.evidenceId(contentDateTime),
    ts: contentDateTime.toISO({ includeOffset: true }),
    type: evidenceProvenance.type,
    text,
    sourceUrl: evidenceProvenance.sourceUrl,
    render: {
      text: translatedEvidenceText,
      source: '@openai/gpt-5-nano',
    },
  };

  // --- Compute impact events from claims (effects, scopes, periods) ---
  const { newImpactEvents } = computeImpactFromEvidenceClaims({
    issueBundle: {
      ...issueBundle,
      evidence: [...issueBundle.evidence, evidence],
    },
    evidenceId: evidence.id,
    evidenceTs: evidence.ts,
    claims,
  });

  // --- Persist to disk ---
  try {
    if (shouldCreateIssue) {
      writer.issues.create(issueBundle.issue);
    }
    writer.issues.appendEvidenceAndImpacts(
      issueBundle.issue.id,
      evidence,
      newImpactEvents,
    );
  } catch (error) {
    if (shouldCreateIssue) {
      try {
        writer.issues.delete(issueBundle.issue.id);
      } catch (cleanupError) {
        console.error(
          `[ingestContent] Failed to roll back issue ${issueBundle.issue.id}:`,
          cleanupError,
        );
      }
    }
    console.error(
      `[ingestContent] Failed to persist evidence for issue ${issueBundle.issue.id}:`,
      error,
    );
    throw error;
  }

  return null;
}
