import { type Operator, OperatorSchema } from '@mrtdown/core';
import { DIR_OPERATOR } from '../../constants.js';
import { StandardRepository } from '../common/StandardRepository.js';
import type { IStore } from '../common/store.js';

export class OperatorRepository extends StandardRepository<Operator> {
  constructor(store: IStore) {
    super(store, DIR_OPERATOR);
  }

  protected parseItem(json: unknown): Operator {
    return OperatorSchema.parse(json);
  }
}
