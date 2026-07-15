import type {
  EstimatedFrequencyPeriod,
  EstimatedFrequencyProfile,
  EstimatedHeadway,
  ServiceDayType,
  ServiceRevision,
} from '../schema/Service.js';
import type {
  Station,
  StationFirstLastTrainCalendar,
  StationFirstLastTrainTime,
} from '../schema/Station.js';

const SECONDS_PER_DAY = 24 * 60 * 60;
const ESTIMATED_DEPARTURE_QUANTUM_SECONDS = 30;

export type EstimatedStationScheduleCalendar =
  | 'weekday'
  | 'saturday'
  | 'sunday_public_holiday';

export type EstimatedFrequencyWindow = {
  startTime: string;
  endTime: string;
  startSeconds: number;
  endSeconds: number;
  headwaySeconds: number;
  headwayRangeSeconds: {
    min: number;
    max: number;
  };
  sourcePeriodId: string | null;
  exactTimes: false;
};

export type EstimatedStationFrequencySchedule = {
  serviceId: string;
  stationId: string;
  displayCode: string;
  stopSequence: number;
  calendar: EstimatedStationScheduleCalendar;
  sourceCalendar: StationFirstLastTrainCalendar | null;
  firstTrainTime: string | null;
  lastTrainTime: string | null;
  windows: EstimatedFrequencyWindow[];
};

export type EstimatedStationDeparture = {
  time: string;
  seconds: number;
  basis: 'first_train' | 'frequency_estimate' | 'last_train';
  headwaySeconds: number;
  headwayRangeSeconds: {
    min: number;
    max: number;
  };
  sourcePeriodId: string | null;
};

type StationInput = Pick<Station, 'id' | 'firstLastTrain'>;

type ClippedPeriod = {
  startSeconds: number;
  endSeconds: number;
  period: EstimatedFrequencyPeriod;
};

const calendarConfig: Record<
  EstimatedStationScheduleCalendar,
  {
    dayType: ServiceDayType;
    sourceCalendars: readonly StationFirstLastTrainCalendar[];
  }
> = {
  weekday: {
    dayType: 'weekdays',
    sourceCalendars: ['weekday', 'weekday_saturday', 'daily'],
  },
  saturday: {
    dayType: 'weekends',
    sourceCalendars: ['saturday', 'weekday_saturday', 'daily'],
  },
  sunday_public_holiday: {
    dayType: 'weekends',
    sourceCalendars: ['sunday_public_holiday', 'daily'],
  },
};

function parseTime(time: string): number {
  const [hours, minutes, seconds = 0] = time.split(':').map(Number);

  if (
    hours === undefined ||
    minutes === undefined ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds)
  ) {
    throw new Error(
      `Frequency generation requires whole-second times: ${time}`,
    );
  }

  return hours * 60 * 60 + minutes * 60 + seconds;
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function toWindow(
  startSeconds: number,
  endSeconds: number,
  headway: EstimatedHeadway,
  sourcePeriodId: string | null,
): EstimatedFrequencyWindow {
  return {
    startTime: formatTime(startSeconds),
    endTime: formatTime(endSeconds),
    startSeconds,
    endSeconds,
    headwaySeconds: headway.representativeSeconds,
    headwayRangeSeconds: {
      min: headway.minSeconds,
      max: headway.maxSeconds,
    },
    sourcePeriodId,
    exactTimes: false,
  };
}

function clipPeriodToStationDay(
  period: EstimatedFrequencyPeriod,
  stationStart: number,
  stationEnd: number,
): ClippedPeriod[] {
  const periodStart = parseTime(period.start);
  let periodEnd = parseTime(period.end);
  if (periodEnd <= periodStart) {
    periodEnd += SECONDS_PER_DAY;
  }

  const clipped: ClippedPeriod[] = [];
  for (const offset of [-SECONDS_PER_DAY, 0, SECONDS_PER_DAY]) {
    const startSeconds = Math.max(stationStart, periodStart + offset);
    const endSeconds = Math.min(stationEnd, periodEnd + offset);
    if (startSeconds < endSeconds) {
      clipped.push({ startSeconds, endSeconds, period });
    }
  }

  return clipped;
}

function generateWindows(
  profile: EstimatedFrequencyProfile,
  timing: StationFirstLastTrainTime,
  dayType: ServiceDayType,
): EstimatedFrequencyWindow[] {
  if (timing.firstTrain == null || timing.lastTrain == null) {
    return [];
  }

  const stationStart = parseTime(timing.firstTrain);
  let stationEnd = parseTime(timing.lastTrain);
  if (stationEnd === stationStart) {
    throw new Error('Station first and last train times must differ');
  }
  if (stationEnd < stationStart) {
    stationEnd += SECONDS_PER_DAY;
  }

  const clippedPeriods = profile.periods
    .filter((period) => period.dayType === dayType)
    .flatMap((period) =>
      clipPeriodToStationDay(period, stationStart, stationEnd),
    );
  const boundaries = [
    stationStart,
    stationEnd,
    ...clippedPeriods.flatMap(({ startSeconds, endSeconds }) => [
      startSeconds,
      endSeconds,
    ]),
  ]
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((a, b) => a - b);

  return boundaries.slice(0, -1).map((startSeconds, index) => {
    const endSeconds = boundaries[index + 1];
    if (endSeconds === undefined) {
      throw new Error('Frequency window has no end boundary');
    }

    const activePeriods = clippedPeriods.filter(
      (candidate) =>
        candidate.startSeconds <= startSeconds &&
        candidate.endSeconds >= endSeconds,
    );
    if (activePeriods.length > 1) {
      throw new Error(
        `Estimated frequency periods overlap: ${activePeriods
          .map(({ period }) => period.id)
          .join(', ')}`,
      );
    }

    const activePeriod = activePeriods[0]?.period;
    return toWindow(
      startSeconds,
      endSeconds,
      activePeriod?.headway ?? profile.defaultHeadway,
      activePeriod?.id ?? null,
    );
  });
}

function resolveTiming(
  station: StationInput,
  serviceId: string,
  calendar: EstimatedStationScheduleCalendar,
): {
  sourceCalendar: StationFirstLastTrainCalendar;
  timing: StationFirstLastTrainTime;
} | null {
  const serviceTiming = station.firstLastTrain?.services.find(
    (candidate) => candidate.serviceId === serviceId,
  );
  if (!serviceTiming?.times) {
    return null;
  }

  for (const sourceCalendar of calendarConfig[calendar].sourceCalendars) {
    const timing = serviceTiming.times[sourceCalendar];
    if (timing) {
      return { sourceCalendar, timing };
    }
  }

  return null;
}

/**
 * Generates frequency windows bounded by one station's canonical first and
 * last train times. This preserves short starters and calendar differences
 * that cannot be represented by a service-wide operating window.
 */
function generateEstimatedStationFrequencyScheduleAtStop({
  serviceId,
  revision,
  station,
  calendar,
  stopIndex,
}: {
  serviceId: string;
  revision: Pick<ServiceRevision, 'path' | 'estimatedFrequency'>;
  station: StationInput;
  calendar: EstimatedStationScheduleCalendar;
  stopIndex: number;
}): EstimatedStationFrequencySchedule {
  const profile = revision.estimatedFrequency;
  if (!profile) {
    throw new Error('Service revision has no estimated frequency profile');
  }

  const stop = revision.path.stations[stopIndex];
  if (!stop || stop.stationId !== station.id) {
    throw new Error(
      `Station ${station.id} is not in the service revision path`,
    );
  }

  const resolved = resolveTiming(station, serviceId, calendar);
  return {
    serviceId,
    stationId: station.id,
    displayCode: stop.displayCode,
    stopSequence: stopIndex + 1,
    calendar,
    sourceCalendar: resolved?.sourceCalendar ?? null,
    firstTrainTime: resolved?.timing.firstTrain ?? null,
    lastTrainTime: resolved?.timing.lastTrain ?? null,
    windows: resolved
      ? generateWindows(
          profile,
          resolved.timing,
          calendarConfig[calendar].dayType,
        )
      : [],
  };
}

export function generateEstimatedStationFrequencySchedule({
  serviceId,
  revision,
  station,
  calendar,
}: {
  serviceId: string;
  revision: Pick<ServiceRevision, 'path' | 'estimatedFrequency'>;
  station: StationInput;
  calendar: EstimatedStationScheduleCalendar;
}): EstimatedStationFrequencySchedule {
  const stopIndexes = revision.path.stations.flatMap((stop, index) =>
    stop.stationId === station.id ? [index] : [],
  );
  if (stopIndexes.length !== 1) {
    throw new Error(
      stopIndexes.length === 0
        ? `Station ${station.id} is not in the service revision path`
        : `Station ${station.id} occurs more than once in the service revision path; generate the full service schedule instead`,
    );
  }

  const stopIndex = stopIndexes[0];
  if (stopIndex === undefined) {
    throw new Error(`Service revision path has no stop for ${station.id}`);
  }

  return generateEstimatedStationFrequencyScheduleAtStop({
    serviceId,
    revision,
    station,
    calendar,
    stopIndex,
  });
}

/** Generates station schedules in service path order. */
export function generateEstimatedServiceStationFrequencySchedules({
  serviceId,
  revision,
  stations,
  calendar,
}: {
  serviceId: string;
  revision: Pick<ServiceRevision, 'path' | 'estimatedFrequency'>;
  stations: readonly StationInput[];
  calendar: EstimatedStationScheduleCalendar;
}): EstimatedStationFrequencySchedule[] {
  const stationById = new Map(stations.map((station) => [station.id, station]));

  return revision.path.stations.map((stop, stopIndex) => {
    const station = stationById.get(stop.stationId);
    if (!station) {
      throw new Error(`Station data is missing for ${stop.stationId}`);
    }

    return generateEstimatedStationFrequencyScheduleAtStop({
      serviceId,
      revision,
      station,
      calendar,
      stopIndex,
    });
  });
}

function departureFromWindow(
  seconds: number,
  window: EstimatedFrequencyWindow,
  basis: EstimatedStationDeparture['basis'],
): EstimatedStationDeparture {
  return {
    time: formatTime(seconds),
    seconds,
    basis,
    headwaySeconds: window.headwaySeconds,
    headwayRangeSeconds: { ...window.headwayRangeSeconds },
    sourcePeriodId: window.sourcePeriodId,
  };
}

function estimatedDepartureSeconds(
  window: EstimatedFrequencyWindow,
  includeEnd: boolean,
): number[] {
  const duration = window.endSeconds - window.startSeconds;
  const idealIntervalCount = Math.max(
    1,
    Math.round(duration / window.headwaySeconds),
  );
  const minimumIntervalCount = Math.max(
    1,
    Math.ceil(duration / window.headwayRangeSeconds.max),
  );
  const maximumIntervalCount = Math.floor(
    duration / window.headwayRangeSeconds.min,
  );
  const intervalCount =
    maximumIntervalCount >= minimumIntervalCount
      ? Math.min(
          Math.max(idealIntervalCount, minimumIntervalCount),
          maximumIntervalCount,
        )
      : idealIntervalCount;
  const departureCount = includeEnd ? intervalCount + 1 : intervalCount;

  return Array.from({ length: departureCount }, (_, index) => {
    if (index === intervalCount) {
      return window.endSeconds;
    }

    const unquantizedOffset = (duration * index) / intervalCount;
    const offset =
      Math.round(unquantizedOffset / ESTIMATED_DEPARTURE_QUANTUM_SECONDS) *
      ESTIMATED_DEPARTURE_QUANTUM_SECONDS;
    return window.startSeconds + offset;
  });
}

/**
 * Expands a station's frequency windows into deterministic estimated train
 * times. Departures are distributed evenly around the representative headway
 * and quantized to 30 seconds, so window boundaries and the canonical last
 * train remain aligned without implying unsupported precision. Internal window
 * ends are exclusive; the final canonical last train is included.
 */
export function enumerateEstimatedStationDepartures(
  schedule: EstimatedStationFrequencySchedule,
): EstimatedStationDeparture[] {
  const firstWindow = schedule.windows[0];
  const lastWindow = schedule.windows.at(-1);
  if (
    !firstWindow ||
    !lastWindow ||
    schedule.firstTrainTime == null ||
    schedule.lastTrainTime == null
  ) {
    return [];
  }

  const departureBySeconds = new Map<number, EstimatedStationDeparture>();
  for (const [index, window] of schedule.windows.entries()) {
    const isLastWindow = index === schedule.windows.length - 1;
    for (const seconds of estimatedDepartureSeconds(window, isLastWindow)) {
      departureBySeconds.set(
        seconds,
        departureFromWindow(seconds, window, 'frequency_estimate'),
      );
    }
  }

  departureBySeconds.set(
    firstWindow.startSeconds,
    departureFromWindow(firstWindow.startSeconds, firstWindow, 'first_train'),
  );
  departureBySeconds.set(
    lastWindow.endSeconds,
    departureFromWindow(lastWindow.endSeconds, lastWindow, 'last_train'),
  );

  return [...departureBySeconds.values()].sort(
    (first, second) => first.seconds - second.seconds,
  );
}
