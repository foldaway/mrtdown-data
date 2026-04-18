import Fuse, { type Expression } from 'fuse.js';
import { DIR_STATION } from '../../constants.js';
import { type Station, StationSchema } from '../../schema/Station.js';
import { StandardRepository } from '../common/StandardRepository.js';
import type { IStore } from '../common/store.js';

export class StationRepository extends StandardRepository<Station> {
  constructor(store: IStore) {
    super(store, DIR_STATION);
  }

  protected parseItem(json: unknown): Station {
    return StationSchema.parse(json);
  }

  /**
   * Search stations by name.
   * @param names
   * @returns
   */
  searchByName(names: string[]): Station[] {
    this.loadAll();
    const fuse = new Fuse(Array.from(this.byId.values()), {
      keys: ['id', 'name.en-SG'],
      includeScore: true,
      threshold: 0.2,
    });
    const results = fuse.search({
      $or: names.flatMap(
        (name) => [{ id: name }, { 'name.en-SG': name }] as Expression[],
      ),
    });
    return results.map((r) => r.item);
  }
}
