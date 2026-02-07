import {
  DIR_LANDMARK,
  DIR_LINE,
  DIR_OPERATOR,
  DIR_SERVICE,
  DIR_STATION,
  DIR_TOWN,
} from '../constants.js';
import type { Landmark } from '../schema/Landmark.js';
import type { Line } from '../schema/Line.js';
import type { Operator } from '../schema/Operator.js';
import type { Service } from '../schema/Service.js';
import type { Station } from '../schema/Station.js';
import type { Town } from '../schema/Town.js';
import { StandardWriter } from './common/StandardWriter.js';
import type { IWriteStore } from './common/store.js';
import { IssueWriter } from './issue/IssueWriter.js';

type MRTDownWriterParams = {
  store: IWriteStore;
};

/**
 * A writer for the MRTDown data.
 */
export class MRTDownWriter {
  private readonly store: IWriteStore;
  readonly issues: IssueWriter;
  readonly stations: StandardWriter<Station>;
  readonly lines: StandardWriter<Line>;
  readonly operators: StandardWriter<Operator>;
  readonly services: StandardWriter<Service>;
  readonly landmarks: StandardWriter<Landmark>;
  readonly towns: StandardWriter<Town>;

  constructor(params: MRTDownWriterParams) {
    this.store = params.store;
    this.issues = new IssueWriter(this.store);
    this.stations = new StandardWriter(this.store, DIR_STATION);
    this.lines = new StandardWriter(this.store, DIR_LINE);
    this.operators = new StandardWriter(this.store, DIR_OPERATOR);
    this.services = new StandardWriter(this.store, DIR_SERVICE);
    this.landmarks = new StandardWriter(this.store, DIR_LANDMARK);
    this.towns = new StandardWriter(this.store, DIR_TOWN);
  }
}
