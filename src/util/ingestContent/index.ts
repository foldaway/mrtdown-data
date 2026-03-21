import { resolve } from 'node:path';
import { DateTime } from 'luxon';
import { ulid } from 'ulid';
import { computeImpactFromEvidenceClaims } from '../../helpers/computeImpactFromEvidenceClaims.js';
import { extractClaimsFromNewEvidence } from '../../llm/functions/extractClaimsFromNewEvidence/index.js';
import { generateIssueTitleAndSlug } from '../../llm/functions/generateIssueTitleAndSlug/index.js';
import { translate } from '../../llm/functions/translate/index.js';
import { triageNewEvidence } from '../../llm/functions/triageNewEvidence/index.js';
import { FileStore } from '../../repo/common/FileStore.js';
import { MRTDownRepository } from '../../repo/MRTDownRepository.js';
import type { IssueBundle } from '../../schema/issue/bundle.js';
import type { Evidence } from '../../schema/issue/evidence.js';
import type { Issue } from '../../schema/issue/issue.js';
import { FileWriteStore } from '../../write/common/FileWriteStore.js';
import { MRTDownWriter } from '../../write/MRTDownWriter.js';
import { assert } from '../assert.js';
import { getSlugDateTimeFromClaims } from './helpers/getSlugDateTimeFromClaims.js';
import type { IngestContent } from './types.js';

const DATA_DIR = resolve(import.meta.dirname, '../../../data');

const store = new FileStore(DATA_DIR);
const writeStore = new FileWriteStore(DATA_DIR);
const repo = new MRTDownRepository({ store });
const writer = new MRTDownWriter({ store: writeStore });

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
export async function ingestContent(content: IngestContent) {
  // --- Normalise input ---
  // HACK: Force `createdAt` to be Asia/Singapore timezone
  const createdAt = DateTime.fromISO(content.createdAt)
    .setZone('Asia/Singapore')
    .toISO();
  assert(createdAt != null, 'Expected valid createdAt');

  content.createdAt = createdAt;
  console.log('[ingestContent]', content);

  // --- Triage: existing issue, new issue, or irrelevant ---
  const triageResult = await triageNewEvidence({
    newEvidence: {
      ts: content.createdAt,
      text: getText(content),
    },
    repo,
  });
  console.log('[ingestContent.triageNewEvidence]', triageResult);

  if (triageResult.result.kind === 'irrelevant-content') {
    console.log('[ingestContent] Nothing to do.');
    return null;
  }

  // --- Extract structured claims (lines, stations, periods, effects) ---
  const { claims } = await extractClaimsFromNewEvidence({
    newEvidence: {
      ts: content.createdAt,
      text: getText(content),
    },
    repo,
  });
  console.log('[ingestContent.extractClaimsFromNewEvidence]', claims);

  // --- Resolve issue bundle: fetch existing or create new ---
  let issueBundle: IssueBundle;

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
        getSlugDateTimeFromClaims(claims) ?? content.createdAt,
      );
      assert(slugDateTime.isValid, `Invalid date: ${content.createdAt}`);

      const { title, slug } = await generateIssueTitleAndSlug({
        text: getText(content),
      });
      console.log('[ingestContent.generateSlug]', slug);

      const translatedTitles = await translate(title);

      const issueId = `${slugDateTime.toFormat('yyyy-MM-dd')}-${slug}`;

      const issue: Issue = {
        id: issueId,
        type: triageResult.result.issueType,
        title: translatedTitles,
        titleMeta: {
          source: '@openai/gpt-5-nano',
        },
      };
      writer.issues.create(issue);

      issueBundle = {
        issue,
        evidence: [],
        impactEvents: [],
        path: DATA_DIR,
      };
      break;
    }
  }

  // --- Build evidence record ---
  const contentDateTime = DateTime.fromISO(content.createdAt);
  assert(contentDateTime.isValid, `Invalid date: ${content.createdAt}`);

  const evidence: Evidence = {
    id: `ev_${ulid(contentDateTime.toMillis())}`,
    ts: contentDateTime.toISO({ includeOffset: true }),
    type: getEvidenceType(content),
    text: getText(content),
    sourceUrl: content.url,
    render: {
      text: await translate(getText(content)),
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
  writer.issues.appendEvidence(issueBundle.issue.id, evidence);
  for (const impact of newImpactEvents) {
    writer.issues.appendImpact(issueBundle.issue.id, impact);
  }

  return null;
}

/**
 * Extracts the primary text content from an IngestContent item based on its source type.
 *
 * @param content - The content to extract text from.
 * @returns The text body (selftext for Reddit, summary for news, text for social).
 */
function getText(content: IngestContent) {
  switch (content.source) {
    case 'reddit': {
      return content.selftext;
    }
    case 'news-website': {
      return content.summary;
    }
    case 'twitter':
    case 'mastodon': {
      return content.text;
    }
  }
}

/**
 * Maps IngestContent source type to the corresponding Evidence type for provenance tracking.
 *
 * @param content - The content to classify.
 * @returns The evidence type: official-statement (Reddit), media.report (news), or public.report (social).
 */
function getEvidenceType(content: IngestContent) {
  switch (content.source) {
    case 'reddit': {
      return 'official-statement';
    }
    case 'news-website': {
      return 'media.report';
    }
    case 'twitter':
    case 'mastodon': {
      return 'public.report';
    }
  }
}
