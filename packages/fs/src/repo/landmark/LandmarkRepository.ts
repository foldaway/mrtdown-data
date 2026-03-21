import { type Landmark, LandmarkSchema } from '@mrtdown/core';
import { DIR_LANDMARK } from '../../constants.js';
import { StandardRepository } from '../common/StandardRepository.js';
import type { IStore } from '../common/store.js';

export class LandmarkRepository extends StandardRepository<Landmark> {
  constructor(store: IStore) {
    super(store, DIR_LANDMARK);
  }

  protected parseItem(json: unknown): Landmark {
    return LandmarkSchema.parse(json);
  }
}
