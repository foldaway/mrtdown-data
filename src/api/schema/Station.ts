import z from 'zod';
import { StationLineMemberStructureTypeSchema } from '../../schema/Station.js';

export const StationLineMembershipSchema = z
  .object({
    lineId: z.string().describe('ID of the line to which the station belongs'),
    branchId: z.string().describe('ID of the branch'),
    code: z.string().describe('Code of the station'),
    startedAt: z.iso
      .date()
      .describe('Date when the station was added to the line'),
    endedAt: z.iso
      .date()
      .optional()
      .describe(
        'Date when the station was removed from the line, if applicable',
      ),
    structureType: StationLineMemberStructureTypeSchema.describe(
      'Structure type of the station',
    ),
    sequenceOrder: z.number().meta({
      description: 'Order of the station in the branch sequence',
    }),
  })
  .meta({
    ref: 'StationLineMembership',
    description:
      'Describes the membership of a station in a specific line, including its code, start and end dates, and structure type.',
  });
export type StationLineMembership = z.infer<typeof StationLineMembershipSchema>;

export const StationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    nameTranslations: z.record(z.string(), z.string()),
    geo: z.object({
      latitude: z.number().describe('Latitude of the station'),
      longitude: z.number().describe('Longitude of the station'),
    }),
    memberships: z.array(StationLineMembershipSchema).meta({
      description: 'List of line memberships for the station',
    }),
    townId: z.string().meta({
      description: 'ID of the town where the station is located',
    }),
    landmarkIds: z.array(z.string()).meta({
      description: 'List of landmark IDs near the station',
    }),
  })
  .meta({
    ref: 'Station',
    description: 'A station in the network, identified by its unique ID.',
  });
export type Station = z.infer<typeof StationSchema>;
