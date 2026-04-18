import { DIR_OPERATOR } from '../../constants.js';
import { type Operator, OperatorSchema } from '../../schema/Operator.js';
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
