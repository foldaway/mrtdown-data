import { ScheduledTripPatternBindingSchema } from '../schema/ScheduledTripPatternBinding.js';
import { ScheduledTripTimesSchema } from '../schema/ScheduledTripTimes.js';

/** Structural join only; matching canonical identities and approving dates remain external. */
export function bindScheduledTripPattern(
  tripInput: unknown,
  bindingInput: unknown,
) {
  const trip = ScheduledTripTimesSchema.parse(tripInput);
  const binding = ScheduledTripPatternBindingSchema.parse(bindingInput);
  if (trip.providerTripId !== binding.providerTripId) {
    throw new Error(
      `Trip ${trip.providerTripId} does not match binding ${binding.providerTripId}`,
    );
  }
  if (trip.stopTimes.length !== binding.occurrences.length) {
    throw new Error(
      `Trip ${trip.providerTripId} has ${trip.stopTimes.length} occurrences; binding has ${binding.occurrences.length}`,
    );
  }
  for (const [index, stop] of trip.stopTimes.entries()) {
    const expected = binding.occurrences[index];
    if (
      stop.providerStopId !== expected.providerStopId ||
      stop.stopSequence !== expected.stopSequence
    ) {
      throw new Error(
        `Trip ${trip.providerTripId}: source occurrence ${index} differs from binding`,
      );
    }
  }
  const { stops, ...identities } = binding.pattern;
  return {
    ...trip,
    ...identities,
    stopTimes: trip.stopTimes.map((stop, index) => ({
      ...stop,
      ...stops[index],
    })),
  };
}

export type ScheduledTripWithPattern = ReturnType<
  typeof bindScheduledTripPattern
>;
