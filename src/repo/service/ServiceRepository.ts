import Fuse, { type Expression } from 'fuse.js';
import { DIR_SERVICE } from '../../constants.js';
import { type Service, ServiceSchema } from '../../schema/Service.js';
import { StandardRepository } from '../common/StandardRepository.js';
import type { IStore } from '../common/store.js';

export class ServiceRepository extends StandardRepository<Service> {
  constructor(store: IStore) {
    super(store, DIR_SERVICE);
  }

  protected parseItem(json: unknown): Service {
    return ServiceSchema.parse(json);
  }

  /**
   * Search services by name.
   * @param names
   * @returns
   */
  searchByName(names: string[]): Service[] {
    this.loadAll();
    const fuse = new Fuse(Array.from(this.byId.values()), {
      keys: ['id', 'name.en-SG'],
      includeScore: true,
      threshold: 0.3,
    });
    const results = fuse.search({
      $or: names.flatMap(
        (name) => [{ id: name }, { 'name.en-SG': name }] as Expression[],
      ),
    });
    return results.map((r) => r.item);
  }

  /**
   * Search services by line ID.
   * @param lineId
   * @returns
   */
  searchByLineId(lineId: string): Service[] {
    this.loadAll();
    return Array.from(this.byId.values()).filter((s) => s.lineId === lineId);
  }
}
