import { DateTime } from 'luxon';
import type { Table } from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import z from 'zod';
import type { MRTDownRepository } from '#repo/MRTDownRepository.js';
import { assert } from '#util/assert.js';
import { Tool } from '../../../common/tool.js';

const FindServicesToolParametersSchema = z.object({
  lineId: z.string(),
});
type FindServicesToolParameters = z.infer<
  typeof FindServicesToolParametersSchema
>;

export class FindServicesTool extends Tool<FindServicesToolParameters> {
  public name = 'findServices';
  public description = 'Find services by name';
  private readonly evidenceTs: DateTime;
  private readonly repo: MRTDownRepository;

  constructor(evidenceTs: DateTime, repo: MRTDownRepository) {
    super();
    this.evidenceTs = evidenceTs;
    this.repo = repo;
  }

  public get paramsSchema(): { [key: string]: unknown } {
    return z.toJSONSchema(FindServicesToolParametersSchema);
  }

  public parseParams(params: unknown): FindServicesToolParameters {
    return FindServicesToolParametersSchema.parse(params);
  }

  public async runner(params: FindServicesToolParameters): Promise<string> {
    console.log('[findServices] Calling tool with parameters:', params);

    const services = this.repo.services.searchByLineId(params.lineId);

    const table: Table = {
      type: 'table',
      children: [
        {
          type: 'tableRow',
          children: [
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Service ID' }],
            },
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Service Name' }],
            },
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Line ID' }],
            },
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Station IDs' }],
            },
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Operating Hours' }],
            },
          ],
        },
      ],
    };

    for (const service of services) {
      const relevantRevision = service.revisions.findLast((revision) => {
        const startAt = DateTime.fromISO(revision.startAt);
        assert(startAt.isValid, `Invalid date: ${revision.startAt}`);

        if (revision.endAt == null) {
          return startAt <= this.evidenceTs;
        }

        const endAt = DateTime.fromISO(revision.endAt);
        assert(endAt.isValid, `Invalid date: ${revision.endAt}`);

        return startAt <= this.evidenceTs && endAt > this.evidenceTs;
      });

      if (relevantRevision == null) continue;

      table.children.push({
        type: 'tableRow',
        children: [
          {
            type: 'tableCell',
            children: [{ type: 'text', value: service.id }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: service.name['en-SG'] }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: service.lineId }],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: `${relevantRevision.path.stations.length} (${relevantRevision.path.stations.map((station) => station.stationId).join('→')})`,
              },
            ],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: `Weekdays: ${relevantRevision.operatingHours.weekdays.start}-${relevantRevision.operatingHours.weekdays.end} | Weekends: ${relevantRevision.operatingHours.weekends.start}-${relevantRevision.operatingHours.weekends.end}`,
              },
            ],
          },
        ],
      });
    }

    const output = toMarkdown(table, {
      extensions: [gfmToMarkdown()],
    });
    console.log(`[findServices] Response output:\n${output}`);

    return output;
  }
}
