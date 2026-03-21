import type { IStore } from './common/store.js';
import { IssueRepository } from './issue/IssueRepository.js';
import { LandmarkRepository } from './landmark/LandmarkRepository.js';
import { LineRepository } from './line/LineRepository.js';
import { OperatorRepository } from './operator/OperatorRepository.js';
import { ServiceRepository } from './service/ServiceRepository.js';
import { StationRepository } from './station/StationRepository.js';
import { TownRepository } from './town/TownRepository.js';

interface MRTDownRepositoryOptions {
  store: IStore;
}

export class MRTDownRepository {
  private readonly store: IStore;

  readonly stations: StationRepository;
  readonly towns: TownRepository;
  readonly landmarks: LandmarkRepository;
  readonly lines: LineRepository;
  readonly operators: OperatorRepository;
  readonly services: ServiceRepository;
  readonly issues: IssueRepository;

  constructor(options: MRTDownRepositoryOptions) {
    this.store = options.store;
    this.stations = new StationRepository(this.store);
    this.towns = new TownRepository(this.store);
    this.landmarks = new LandmarkRepository(this.store);
    this.lines = new LineRepository(this.store);
    this.operators = new OperatorRepository(this.store);
    this.services = new ServiceRepository(this.store);
    this.issues = new IssueRepository(this.store);
  }
}
