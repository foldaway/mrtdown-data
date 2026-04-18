import Fuse, { type Expression } from 'fuse.js';
import { DIR_LINE } from '../../constants.js';
import { type Line, LineSchema } from '../../schema/Line.js';
import { StandardRepository } from '../common/StandardRepository.js';
import type { IStore } from '../common/store.js';

export class LineRepository extends StandardRepository<Line> {
  constructor(store: IStore) {
    super(store, DIR_LINE);
  }

  protected parseItem(json: unknown): Line {
    return LineSchema.parse(json);
  }

  /**
   * Search lines by name.
   * @param names
   * @returns
   */
  searchByName(names: string[]): Line[] {
    this.loadAll();
    const fuse = new Fuse(Array.from(this.byId.values()), {
      keys: ['id', 'name.en-SG'],
      includeScore: true,
      threshold: 0.3,
    });
    const results = fuse.search({
      $or: names.flatMap((name) => {
        return [{ id: name }, { 'name.en-SG': name }] as Expression[];
      }),
    });
    return results.map((r) => r.item);
  }
}
