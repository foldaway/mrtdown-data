import { DIR_TOWN } from '../../constants.js';
import { type Town, TownSchema } from '../../schema/Town.js';
import { StandardRepository } from '../common/StandardRepository.js';
import type { IStore } from '../common/store.js';

export class TownRepository extends StandardRepository<Town> {
  constructor(store: IStore) {
    super(store, DIR_TOWN);
  }

  protected parseItem(json: unknown): Town {
    return TownSchema.parse(json);
  }
}
