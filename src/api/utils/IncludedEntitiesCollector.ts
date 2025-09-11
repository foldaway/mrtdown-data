import {
  fetchIssuesByIds,
  fetchLandmarksByIds,
  fetchLinesByIds,
  fetchStationsByIds,
  fetchTownsByIds,
} from '../queries/entities.js';
import type { IncludedEntities } from '../schema/BaseResponse.js';

/**
 * Utility class for collecting entity IDs throughout API processing
 * and fetching them efficiently at the end for the "included" response field.
 */
export class IncludedEntitiesCollector {
  private lineIds = new Set<string>();
  private stationIds = new Set<string>();
  private issueIds = new Set<string>();
  private landmarkIds = new Set<string>();
  private townIds = new Set<string>();

  /**
   * Add a line ID to be included in the final response
   */
  addLineId(lineId: string): void {
    this.lineIds.add(lineId);
  }

  /**
   * Add multiple line IDs to be included in the final response
   */
  addLineIds(lineIds: string[]): void {
    for (const lineId of lineIds) {
      this.lineIds.add(lineId);
    }
  }

  /**
   * Add a station ID to be included in the final response
   */
  addStationId(stationId: string): void {
    this.stationIds.add(stationId);
  }

  /**
   * Add multiple station IDs to be included in the final response
   */
  addStationIds(stationIds: string[]): void {
    for (const stationId of stationIds) {
      this.stationIds.add(stationId);
    }
  }

  /**
   * Add an issue ID to be included in the final response
   */
  addIssueId(issueId: string): void {
    this.issueIds.add(issueId);
  }

  /**
   * Add multiple issue IDs to be included in the final response
   */
  addIssueIds(issueIds: string[]): void {
    for (const issueId of issueIds) {
      this.issueIds.add(issueId);
    }
  }

  /**
   * Add a landmark ID to be included in the final response
   */
  addLandmarkId(landmarkId: string): void {
    this.landmarkIds.add(landmarkId);
  }

  /**
   * Add multiple landmark IDs to be included in the final response
   */
  addLandmarkIds(landmarkIds: string[]): void {
    for (const landmarkId of landmarkIds) {
      this.landmarkIds.add(landmarkId);
    }
  }

  /**
   * Add a town ID to be included in the final response
   */
  addTownId(townId: string): void {
    this.townIds.add(townId);
  }

  /**
   * Add multiple town IDs to be included in the final response
   */
  addTownIds(townIds: string[]): void {
    for (const townId of townIds) {
      this.townIds.add(townId);
    }
  }

  /**
   * Get the current set of collected line IDs
   */
  getLineIds(): string[] {
    return [...this.lineIds];
  }

  /**
   * Get the current set of collected station IDs
   */
  getStationIds(): string[] {
    return [...this.stationIds];
  }

  /**
   * Get the current set of collected issue IDs
   */
  getIssueIds(): string[] {
    return [...this.issueIds];
  }

  /**
   * Get the current set of collected landmark IDs
   */
  getLandmarkIds(): string[] {
    return [...this.landmarkIds];
  }

  /**
   * Check if any entities have been collected
   */
  hasAnyEntities(): boolean {
    return (
      this.lineIds.size > 0 ||
      this.stationIds.size > 0 ||
      this.issueIds.size > 0 ||
      this.landmarkIds.size > 0 ||
      this.townIds.size > 0
    );
  }

  /**
   * Get counts of collected entities for debugging/logging
   */
  getCounts(): {
    lines: number;
    stations: number;
    issues: number;
    landmarks: number;
    towns: number;
  } {
    return {
      lines: this.lineIds.size,
      stations: this.stationIds.size,
      issues: this.issueIds.size,
      landmarks: this.landmarkIds.size,
      towns: this.townIds.size,
    };
  }

  /**
   * Fetch all collected entities and return them in the standard included format.
   * This method also handles the cascading relationship collection:
   * - Issues contain station IDs, which get added to the station collection
   * - Stations contain line memberships, which get added to the line collection
   */
  async fetchIncludedEntities(): Promise<IncludedEntities> {
    // Fetch issues first
    const issues = await fetchIssuesByIds([...this.issueIds]);
    issues.sort((a, b) => {
      return a.id.localeCompare(b.id);
    });

    // Collect station IDs from issues
    for (const issue of issues) {
      for (const branch of issue.branchesAffected) {
        this.addLineId(branch.lineId);
        this.addStationIds(branch.stationIds);
      }
    }

    // Fetch stations (including those from issues)
    const stations = await fetchStationsByIds([...this.stationIds]);
    stations.sort((a, b) => {
      return a.id.localeCompare(b.id);
    });

    // Collect line IDs from station memberships
    for (const station of stations) {
      for (const membership of station.memberships) {
        this.addLineId(membership.lineId);
      }
      this.addLandmarkIds(station.landmarkIds);
      this.addTownId(station.townId);
    }

    // Fetch lines (including those from station memberships)
    const lines = await fetchLinesByIds([...this.lineIds]);
    lines.sort((a, b) => {
      return a.id.localeCompare(b.id);
    });

    // Fetch landmarks (including those from stations)
    const landmarks = await fetchLandmarksByIds([...this.landmarkIds]);
    landmarks.sort((a, b) => {
      return a.id.localeCompare(b.id);
    });

    // Fetch towns (including those from stations)
    const towns = await fetchTownsByIds([...this.townIds]);
    towns.sort((a, b) => {
      return a.id.localeCompare(b.id);
    });

    return {
      lines: Object.fromEntries(lines.map((line) => [line.id, line])),
      stations: Object.fromEntries(
        stations.map((station) => [station.id, station]),
      ),
      issues: Object.fromEntries(issues.map((issue) => [issue.id, issue])),
      landmarks: Object.fromEntries(
        landmarks.map((landmark) => [landmark.id, landmark]),
      ),
      towns: Object.fromEntries(towns.map((town) => [town.id, town])),
    };
  }

  /**
   * Reset all collected IDs (useful for reusing the same collector instance)
   */
  reset(): void {
    this.lineIds.clear();
    this.stationIds.clear();
    this.issueIds.clear();
  }
}
