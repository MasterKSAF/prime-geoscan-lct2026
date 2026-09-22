import { distance, segmentInside } from './geometry.ts';
import type { Point, Multi } from './geometry.ts';

const TAU = 2 * Math.PI;
export const wrapAngle = (a: number) => ((a % TAU) + TAU) % TAU;
export const angleDifference = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
export type FixedWingPose = { point: Point; headingRad: number };
export type FixedWingPrimitive = {
  from: Point;
  to: Point;
  headingFromRad: number;
  headingToRad: number;
  lengthM: number;
  center?: Point;
  radiusM?: number;
  sweepRad?: number;
};

/** Complete capsule containment, including holes/concavities; not vertex sampling. */
export function capsuleInside(
  a: Point,
  b: Point,
  radiusM: number,
  free: Multi,
) {
  if (
    !Number.isFinite(radiusM) ||
    radiusM < 0 ||
    [...a, ...b].some((x) => !Number.isFinite(x))
  )
    return false;
  if (!segmentInside(a, b, free)) return false;
  const pointEdge = (p: Point, c: Point, d: Point) => {
    const dx = d[0] - c[0],
      dy = d[1] - c[1],
      den = dx * dx + dy * dy;
    const t = den
      ? Math.max(
          0,
          Math.min(1, ((p[0] - c[0]) * dx + (p[1] - c[1]) * dy) / den),
        )
      : 0;
    return distance(p, [c[0] + dx * t, c[1] + dy * t]);
  };
  for (const polygon of free)
    for (const ring of polygon)
      for (let i = 1; i < ring.length; i++) {
        const c = ring[i - 1],
          d = ring[i];
        if (
          Math.min(
            pointEdge(a, c, d),
            pointEdge(b, c, d),
            pointEdge(c, a, b),
            pointEdge(d, a, b),
          ) <
          radiusM - 1e-6
        )
          return false;
      }
  return true;
}

function integrate(
  pose: FixedWingPose,
  type: 'L' | 'R' | 'S',
  amount: number,
  radius: number,
): FixedWingPrimitive[] {
  if (amount < 1e-8) return [];
  const { point: from, headingRad: h } = pose;
  if (type === 'S')
    return [
      {
        from,
        to: [
          from[0] + Math.cos(h) * amount * radius,
          from[1] + Math.sin(h) * amount * radius,
        ],
        headingFromRad: h,
        headingToRad: h,
        lengthM: amount * radius,
      },
    ];
  const sign = type === 'L' ? 1 : -1;
  const center: Point = [
    from[0] - sign * Math.sin(h) * radius,
    from[1] + sign * Math.cos(h) * radius,
  ];
  // Each arc is small enough for a bounded linear rendering, max 10 degrees.
  const count = Math.ceil(amount / (Math.PI / 18));
  const pieces: FixedWingPrimitive[] = [];
  let previous = from;
  for (let i = 1; i <= count; i++) {
    const heading = h + (sign * amount * i) / count;
    const to: Point = [
      center[0] + sign * Math.sin(heading) * radius,
      center[1] - sign * Math.cos(heading) * radius,
    ];
    pieces.push({
      from: previous,
      to,
      headingFromRad: h + (sign * amount * (i - 1)) / count,
      headingToRad: heading,
      lengthM: (amount * radius) / count,
      center,
      radiusM: radius,
      sweepRad: (sign * amount) / count,
    });
    previous = to;
  }
  return pieces;
}

/** Four CSC Dubins families. Bounded subset: no claim of global shortest route. */
export function dubinsCandidates(
  start: FixedWingPose,
  end: FixedWingPose,
  radiusM: number,
): FixedWingPrimitive[][] {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return [];
  if (
    distance(start.point, end.point) < 1e-6 &&
    angleDifference(start.headingRad, end.headingRad) < 1e-6
  )
    return [[]];
  const theta = Math.atan2(
    end.point[1] - start.point[1],
    end.point[0] - start.point[0],
  );
  const a = wrapAngle(start.headingRad - theta),
    b = wrapAngle(end.headingRad - theta),
    d = distance(start.point, end.point) / radiusM;
  const sa = Math.sin(a),
    sb = Math.sin(b),
    ca = Math.cos(a),
    cb = Math.cos(b),
    cab = Math.cos(a - b);
  const plans: { types: ('L' | 'R' | 'S')[]; amounts: number[] }[] = [];
  const add = (
    types: ('L' | 'R' | 'S')[],
    square: number,
    angles: (p: number) => [number, number],
  ) => {
    if (square < -1e-10) return;
    const p = Math.sqrt(Math.max(0, square)),
      [t, q] = angles(p);
    plans.push({ types, amounts: [wrapAngle(t), p, wrapAngle(q)] });
  };
  add(['L', 'S', 'L'], 2 + d * d - 2 * cab + 2 * d * (sa - sb), () => {
    const t = Math.atan2(cb - ca, d + sa - sb);
    return [-a + t, b - t];
  });
  add(['R', 'S', 'R'], 2 + d * d - 2 * cab + 2 * d * (sb - sa), () => {
    const t = Math.atan2(ca - cb, d - sa + sb);
    return [a - t, -b + t];
  });
  add(['L', 'S', 'R'], -2 + d * d + 2 * cab + 2 * d * (sa + sb), (p) => {
    const t = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p);
    return [-a + t, -b + t];
  });
  add(['R', 'S', 'L'], -2 + d * d + 2 * cab - 2 * d * (sa + sb), (p) => {
    const t = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p);
    return [a - t, b - t];
  });
  return plans
    .flatMap(({ types, amounts }) => {
      let pose = start;
      const result: FixedWingPrimitive[] = [];
      types.forEach((type, i) => {
        const parts = integrate(pose, type, amounts[i], radiusM);
        result.push(...parts);
        if (parts.length)
          pose = {
            point: parts.at(-1)!.to,
            headingRad: parts.at(-1)!.headingToRad,
          };
      });
      // Independent end-pose condition guards the family formula implementation.
      return distance(pose.point, end.point) < 0.001 &&
        angleDifference(pose.headingRad, end.headingRad) < 1e-6
        ? [result]
        : [];
    })
    .sort(
      (x, y) =>
        x.reduce((sum, p) => sum + p.lengthM, 0) -
        y.reduce((sum, p) => sum + p.lengthM, 0),
    );
}

export function fixedWingLoiter(
  pose: FixedWingPose,
  radiusM: number,
  clockwise = false,
) {
  return integrate(pose, clockwise ? 'R' : 'L', TAU, radiusM);
}
