import type { ServiceRevision } from '@mrtdown/core';

type PathStation = ServiceRevision['path']['stations'][number];

export function matchServicePath(
  path: readonly PathStation[],
  sequence: readonly string[],
) {
  const segments: PathStation[][] = [];
  for (let start = 0; start < path.length; start++) {
    if (
      start + sequence.length <= path.length &&
      sequence.every((id, index) => id === path[start + index].stationId)
    ) {
      segments.push(path.slice(start, start + sequence.length));
    }
  }
  if (segments.length) {
    const match =
      sequence.length === path.length
        ? ('exact' as const)
        : ('contiguousSegment' as const);
    return { match, segments };
  }
  // Rotation is allowed only for an explicitly closed path and at most one circuit.
  if (
    path.length <= 2 ||
    path[0].stationId !== path.at(-1)?.stationId ||
    sequence.length > path.length
  ) {
    return undefined;
  }
  for (let start = 0; start < path.length - 1; start++) {
    const rotatedPath = [...path.slice(start), ...path.slice(1, start + 1)];
    const segment = rotatedPath.slice(0, sequence.length);
    if (sequence.every((id, index) => id === segment[index].stationId)) {
      segments.push(segment);
    }
  }
  if (segments.length) {
    return { match: 'cyclicSegment' as const, segments };
  }
  return undefined;
}
