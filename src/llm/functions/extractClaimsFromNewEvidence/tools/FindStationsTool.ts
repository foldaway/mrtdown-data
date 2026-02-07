import { DateTime } from 'luxon';
import type { Table } from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import z from 'zod';
import { Tool } from '#llm/common/tool.js';
import type { MRTDownRepository } from '#repo/MRTDownRepository.js';
import { assert } from '#util/assert.js';

const FindStationsToolParametersSchema = z.object({
  stationNames: z.array(z.string()),
});
type FindStationsToolParameters = z.infer<
  typeof FindStationsToolParametersSchema
>;

export class FindStationsTool extends Tool<FindStationsToolParameters> {
  public name = 'findStations';
  public description = 'Find stations by name';
  private readonly repo: MRTDownRepository;

  public get paramsSchema(): { [key: string]: unknown } {
    return z.toJSONSchema(FindStationsToolParametersSchema);
  }

  public parseParams(params: unknown): FindStationsToolParameters {
    return FindStationsToolParametersSchema.parse(params);
  }

  /**
   * The timestamp of the evidence.
   */
  private evidenceTs: DateTime;

  constructor(evidenceTs: DateTime, repo: MRTDownRepository) {
    super();
    this.evidenceTs = evidenceTs;
    this.repo = repo;
  }

  public async runner(params: FindStationsToolParameters): Promise<string> {
    console.log('[findStations] Calling tool with parameters:', params);

    const stations = this.repo.stations.searchByName(params.stationNames);

    const table: Table = {
      type: 'table',
      children: [
        {
          type: 'tableRow',
          children: [
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Station ID' }],
            },
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Station Name' }],
            },
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Station Codes' }],
            },
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Line IDs' }],
            },
          ],
        },
      ],
    };

    for (const station of stations) {
      const relevantStationCodes = station.stationCodes.filter((membership) => {
        const startedAt = DateTime.fromISO(membership.startedAt);
        assert(startedAt.isValid, `Invalid date: ${membership.startedAt}`);
        if (startedAt > this.evidenceTs) return false;
        if (
          membership.endedAt != null &&
          DateTime.fromISO(membership.endedAt) < this.evidenceTs
        )
          return false;
        return true;
      });

      const stationCodesSet = new Set<string>(
        relevantStationCodes.map((membership) => membership.code),
      );

      const lineIds = relevantStationCodes.map(
        (membership) => membership.lineId,
      );

      table.children.push({
        type: 'tableRow',
        children: [
          {
            type: 'tableCell',
            children: [{ type: 'text', value: station.id }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: station.name['en-SG'] }],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: Array.from(stationCodesSet).join(', '),
              },
            ],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: lineIds.join(', '),
              },
            ],
          },
        ],
      });
    }

    const output = toMarkdown(table, {
      extensions: [gfmToMarkdown()],
    });
    console.log(`[findStations] Response output:\n${output}`);

    return output;
  }
}
