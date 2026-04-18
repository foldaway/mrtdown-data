import type { Heading, Root } from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import type { IssueBundleState } from '#repo/issue/helpers/deriveCurrentState.js';
import type { Evidence } from '#schema/issue/evidence.js';
import type { Period } from '#schema/issue/period.js';
import type { ServiceScope } from '#schema/issue/serviceScope.js';

export type FormatCurrentStateOptions = {
  state: IssueBundleState | null;
  evidence?: Evidence[];
};

/**
 * Format the current state as markdown for better LLM readability
 */
export function formatCurrentState(
  stateOrOptions: IssueBundleState | null | FormatCurrentStateOptions,
): string {
  const options: FormatCurrentStateOptions =
    stateOrOptions != null &&
    typeof stateOrOptions === 'object' &&
    'state' in stateOrOptions
      ? stateOrOptions
      : { state: stateOrOptions };
  const state = options.state;
  const evidence = options.evidence ?? [];

  if (state == null && evidence.length === 0) {
    return 'No state';
  }

  const services = state?.services ?? {};
  const facilities = state?.facilities ?? {};
  const impactEventIds = state?.impactEventIds ?? [];
  const relevantEvidenceIds = state != null ? collectEvidenceIds(state) : [];

  const root: Root = {
    type: 'root',
    children: [],
  };

  // Evidence Section
  root.children.push({
    type: 'heading',
    depth: 2,
    children: [{ type: 'text', value: 'Evidence' }],
  });

  if (evidence.length === 0) {
    root.children.push({
      type: 'paragraph',
      children: [{ type: 'text', value: 'None' }],
    });
  } else {
    for (const ev of evidence) {
      root.children.push(...formatEvidenceItem(ev));
    }
  }

  // Services Section
  root.children.push({
    type: 'heading',
    depth: 2,
    children: [{ type: 'text', value: 'Services' }],
  });

  const serviceKeys = Object.keys(services);
  if (serviceKeys.length === 0) {
    root.children.push({
      type: 'paragraph',
      children: [{ type: 'text', value: 'None' }],
    });
  } else {
    for (const key of serviceKeys) {
      const svc = services[key];
      root.children.push(
        ...formatServiceSection(
          key,
          svc.serviceId,
          svc.effect,
          svc.scopes,
          svc.periods,
          svc.causes,
        ),
      );
    }
  }

  // Facilities Section
  const facilitiesHeading: Heading = {
    type: 'heading',
    depth: 2,
    children: [{ type: 'text', value: 'Facilities' }],
  };
  root.children.push(facilitiesHeading);

  const facilityKeys = Object.keys(facilities);
  if (facilityKeys.length === 0) {
    root.children.push({
      type: 'paragraph',
      children: [{ type: 'text', value: 'None' }],
    });
  } else {
    for (const key of facilityKeys) {
      const fac = facilities[key];
      root.children.push(
        ...formatFacilitySection(
          key,
          fac.stationId,
          fac.kind,
          fac.effect,
          fac.periods,
        ),
      );
    }
  }

  // Impact Event IDs Section
  root.children.push({
    type: 'heading',
    depth: 2,
    children: [{ type: 'text', value: 'Impact Event IDs' }],
  });

  if (impactEventIds.length === 0) {
    root.children.push({
      type: 'paragraph',
      children: [{ type: 'text', value: 'None' }],
    });
  } else {
    root.children.push({
      type: 'list',
      ordered: false,
      children: impactEventIds.map((id) => ({
        type: 'listItem',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'inlineCode', value: id }],
          },
        ],
      })),
    });
  }

  // Relevant Evidence IDs Section
  const evidenceHeading: Heading = {
    type: 'heading',
    depth: 2,
    children: [{ type: 'text', value: 'Relevant Evidence IDs' }],
  };
  root.children.push(evidenceHeading);

  if (relevantEvidenceIds.length === 0) {
    root.children.push({
      type: 'paragraph',
      children: [{ type: 'text', value: 'None' }],
    });
  } else {
    root.children.push({
      type: 'list',
      ordered: false,
      children: relevantEvidenceIds.map((id) => ({
        type: 'listItem',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'inlineCode', value: id }],
          },
        ],
      })),
    });
  }

  return toMarkdown(root, { extensions: [gfmToMarkdown()] });
}

function formatEvidenceItem(ev: Evidence): Root['children'] {
  const children: Root['children'] = [];

  children.push({
    type: 'heading',
    depth: 3,
    children: [
      { type: 'inlineCode', value: ev.id },
      { type: 'text', value: ` (${ev.type})` },
    ],
  });

  children.push({
    type: 'paragraph',
    children: [
      { type: 'text', value: 'Timestamp: ' },
      { type: 'inlineCode', value: ev.ts },
    ],
  });

  children.push({
    type: 'paragraph',
    children: [
      { type: 'text', value: 'Source: ' },
      { type: 'inlineCode', value: ev.render?.source ?? '—' },
    ],
  });

  if ('sourceUrl' in ev) {
    children.push({
      type: 'paragraph',
      children: [
        { type: 'text', value: 'URL: ' },
        {
          type: 'link',
          url: ev.sourceUrl,
          children: [{ type: 'text', value: ev.sourceUrl }],
        },
      ],
    });
  }

  children.push({
    type: 'paragraph',
    children: [{ type: 'text', value: 'Text:' }],
  });
  children.push({
    type: 'blockquote',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: ev.text }],
      },
    ],
  });

  return children;
}

function collectEvidenceIds(state: IssueBundleState): string[] {
  const ids = new Set<string>();
  for (const prov of Object.values(state.servicesProvenance)) {
    if (prov.effect?.evidenceId) ids.add(prov.effect.evidenceId);
    if (prov.scopes?.evidenceId) ids.add(prov.scopes.evidenceId);
    if (prov.periods?.evidenceId) ids.add(prov.periods.evidenceId);
    if (prov.causes?.evidenceId) ids.add(prov.causes.evidenceId);
  }
  for (const prov of Object.values(state.facilitiesProvenance)) {
    if (prov.effect?.evidenceId) ids.add(prov.effect.evidenceId);
    if (prov.periods?.evidenceId) ids.add(prov.periods.evidenceId);
  }
  return [...ids];
}

function formatServiceSection(
  key: string,
  serviceId: string,
  effect: { kind: string } | null,
  scopes: ServiceScope[],
  periods: Period[],
  causes: string[],
): Root['children'] {
  const children: Root['children'] = [];

  children.push({
    type: 'heading',
    depth: 3,
    children: [{ type: 'text', value: key }],
  });

  children.push({
    type: 'paragraph',
    children: [
      { type: 'text', value: 'Service ID: ' },
      { type: 'inlineCode', value: serviceId },
    ],
  });

  children.push({
    type: 'paragraph',
    children: [
      { type: 'text', value: 'Effect: ' },
      { type: 'inlineCode', value: effect?.kind ?? 'null' },
    ],
  });

  if (scopes.length > 0) {
    children.push({
      type: 'paragraph',
      children: [{ type: 'text', value: 'Scopes:' }],
    });
    children.push({
      type: 'list',
      ordered: false,
      children: scopes.map((scope) => ({
        type: 'listItem',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'inlineCode', value: formatScope(scope) }],
          },
        ],
      })),
    });
  }

  if (periods.length > 0) {
    children.push({
      type: 'paragraph',
      children: [{ type: 'text', value: 'Periods:' }],
    });
    children.push({
      type: 'list',
      ordered: false,
      children: periods.map((period, i) => ({
        type: 'listItem',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: formatPeriod(period, i) }],
          },
        ],
      })),
    });
  }

  if (causes.length > 0) {
    children.push({
      type: 'paragraph',
      children: [
        { type: 'text', value: 'Causes: ' },
        { type: 'inlineCode', value: causes.join(', ') },
      ],
    });
  }

  return children;
}

function formatFacilitySection(
  key: string,
  stationId: string,
  kind: string,
  effect: { kind: string } | null,
  periods: Period[],
): Root['children'] {
  const children: Root['children'] = [];

  children.push({
    type: 'heading',
    depth: 3,
    children: [{ type: 'text', value: key }],
  });

  children.push({
    type: 'paragraph',
    children: [
      { type: 'text', value: 'Station: ' },
      { type: 'inlineCode', value: stationId },
      { type: 'text', value: ', Kind: ' },
      { type: 'inlineCode', value: kind },
    ],
  });

  children.push({
    type: 'paragraph',
    children: [
      { type: 'text', value: 'Effect: ' },
      { type: 'inlineCode', value: effect?.kind ?? 'null' },
    ],
  });

  if (periods.length > 0) {
    children.push({
      type: 'paragraph',
      children: [{ type: 'text', value: 'Periods:' }],
    });
    children.push({
      type: 'list',
      ordered: false,
      children: periods.map((period, i) => ({
        type: 'listItem',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: formatPeriod(period, i) }],
          },
        ],
      })),
    });
  }

  return children;
}

function formatScope(scope: ServiceScope): string {
  switch (scope.type) {
    case 'service.whole':
      return scope.type;
    case 'service.segment':
      return `${scope.type} (${scope.fromStationId} → ${scope.toStationId})`;
    case 'service.point':
      return `${scope.type} (${scope.stationId})`;
  }
}

function formatPeriod(period: Period, index: number): string {
  switch (period.kind) {
    case 'fixed':
      return `[${index}] fixed: ${period.startAt} → ${period.endAt ?? 'ongoing'}`;
    case 'recurring':
      return `[${index}] recurring ${period.frequency}: ${period.startAt}–${period.endAt} ${period.timeWindow.startAt}–${period.timeWindow.endAt}`;
  }
}
