import { memo } from "react";
import restingSleeve from "./portraits/isol/rest-sleeve.webp";

export const isolRelaxedSleeve = {
  href: restingSleeve,
  x: 455,
  y: 352,
  width: 100,
  height: 448,
};

type Point = { x: number; y: number };
type Triangle = readonly [Point, Point, Point];
export type IsolSkinMatrix = Pick<
  DOMMatrixReadOnly,
  "a" | "b" | "c" | "d" | "e" | "f"
>;

const elbow = { x: 486, y: 625 };
const creaseCenter = 494;
const columns = [454, 476, 496, 516, 537, 556];
const offsets = [-40, -24, -10, 5, 21, 41];
const crease = (x: number) => elbow.y - 0.35 * (x - creaseCenter);
const rows = offsets.map((offset) =>
  columns.map((x) => ({ x, y: crease(x) + offset })),
);
const patches: readonly Triangle[] = rows.slice(0, -1).flatMap((row, i) =>
  row.slice(0, -1).flatMap((topLeft, j) => {
    const topRight = row[j + 1];
    const bottomLeft = rows[i + 1][j];
    const bottomRight = rows[i + 1][j + 1];
    return [
      [topLeft, topRight, bottomLeft],
      [topRight, bottomRight, bottomLeft],
    ] as const;
  }),
);

function points(vertices: readonly Point[]) {
  return vertices.map(({ x, y }) => `${x},${y}`).join(" ");
}

function overlap(vertices: readonly Point[]) {
  const center = vertices.reduce(
    (sum, point) => ({
      x: sum.x + point.x / vertices.length,
      y: sum.y + point.y / vertices.length,
    }),
    { x: 0, y: 0 },
  );
  return vertices.map(({ x, y }) => {
    const distance = Math.hypot(x - center.x, y - center.y);
    return {
      x: x + (0.65 * (x - center.x)) / distance,
      y: y + (0.65 * (y - center.y)) / distance,
    };
  });
}

const upperClip = points([
  { x: 454, y: 351 },
  { x: 556, y: 351 },
  ...[...rows[0]].reverse().map(({ x, y }) => ({ x, y: y + 0.6 })),
]);
const forearmClip = points([
  ...rows[rows.length - 1].map(({ x, y }) => ({ x, y: y - 0.6 })),
  { x: 556, y: 774.3 },
  { x: 454, y: 774.3 },
]);
const patchClips = patches.map((triangle) => points(overlap(triangle)));

export const IsolGreetingSleeve = memo(function IsolGreetingSleeve({
  id,
}: {
  id: string;
}) {
  const art = id + "-sleeve-art";
  const upper = id + "-sleeve-upper";
  const lower = id + "-sleeve-lower";
  const skin = id + "-sleeve-skin";
  return (
    <g data-isol-greeting-sleeve="">
      <defs>
        <image id={art} {...isolRelaxedSleeve} />
        <clipPath id={upper}>
          <polygon points={upperClip} />
        </clipPath>
        <clipPath id={lower}>
          <polygon points={forearmClip} />
        </clipPath>
        <clipPath id={skin}>
          <rect x="470" y="774" width="61" height="26" />
        </clipPath>
        {patchClips.map((polygon, index) => (
          <clipPath key={index} id={art + "-" + index}>
            <polygon points={polygon} />
          </clipPath>
        ))}
      </defs>
      <g data-sleeve-upper="">
        <use href={`#${art}`} clipPath={`url(#${upper})`} />
      </g>
      {patchClips.map((_, index) => (
        <g key={index} data-sleeve-patch="">
          <use href={`#${art}`} clipPath={`url(#${art}-${index})`} />
        </g>
      ))}
      <g data-sleeve-lower="">
        <use href={`#${art}`} clipPath={`url(#${lower})`} />
        {/* The plate stops below the viewport. Carry its own skin to the
            off-stage wrist so it stays attached as the forearm comes up. */}
        <g transform="translate(0 774) matrix(1 0 .461538 2.192308 0 0) translate(0 -774)">
          <use href={`#${art}`} clipPath={`url(#${skin})`} />
        </g>
      </g>
    </g>
  );
});

function transform(point: Point, matrix: IsolSkinMatrix): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function strain(matrix: IsolSkinMatrix, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    a: cos * matrix.a + sin * matrix.b,
    b: cos * matrix.b - sin * matrix.a,
    c: cos * matrix.c + sin * matrix.d,
    d: cos * matrix.d - sin * matrix.c,
  };
}

const mix = (a: number, b: number, weight: number) => a + (b - a) * weight;

function skinVertices(upper: IsolSkinMatrix, lower: IsolSkinMatrix) {
  const upperJoint = transform(elbow, upper);
  const lowerJoint = transform(elbow, lower);
  const upperAngle = Math.atan2(upper.b, upper.a);
  const lowerAngle = Math.atan2(lower.b, lower.a);
  const turn = Math.atan2(
    Math.sin(lowerAngle - upperAngle),
    Math.cos(lowerAngle - upperAngle),
  );
  const upperStrain = strain(upper, upperAngle);
  const lowerStrain = strain(lower, lowerAngle);
  const result = new Map<Point, Point>();
  rows.forEach((row, index) => {
    const t = (offsets[index] - offsets[0]) / (offsets.at(-1)! - offsets[0]);
    const weight = t * t * (3 - 2 * t);
    const angle = upperAngle + turn * weight;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    row.forEach((point) => {
      // Unwrap the two local rotations at the hinge. Blending the raw matrix
      // entries would flatten the cloth through a large bend.
      const x = point.x - elbow.x;
      const y = point.y - elbow.y;
      const localX =
        mix(upperStrain.a, lowerStrain.a, weight) * x +
        mix(upperStrain.c, lowerStrain.c, weight) * y;
      const localY =
        mix(upperStrain.b, lowerStrain.b, weight) * x +
        mix(upperStrain.d, lowerStrain.d, weight) * y;
      result.set(point, {
        x:
          mix(upperJoint.x, lowerJoint.x, weight) + cos * localX - sin * localY,
        y:
          mix(upperJoint.y, lowerJoint.y, weight) + sin * localX + cos * localY,
      });
    });
  });
  return result;
}

function patchMatrix(source: Triangle, posed: Map<Point, Point>) {
  const [s0, s1, s2] = source;
  const t0 = posed.get(s0)!;
  const t1 = posed.get(s1)!;
  const t2 = posed.get(s2)!;
  const sx = s1.x - s0.x;
  const sy = s1.y - s0.y;
  const ux = s2.x - s0.x;
  const uy = s2.y - s0.y;
  const tx = t1.x - t0.x;
  const ty = t1.y - t0.y;
  const vx = t2.x - t0.x;
  const vy = t2.y - t0.y;
  const determinant = sx * uy - sy * ux;
  const a = (tx * uy - vx * sy) / determinant;
  const b = (ty * uy - vy * sy) / determinant;
  const c = (vx * sx - tx * ux) / determinant;
  const d = (vy * sx - ty * ux) / determinant;
  return {
    a,
    b,
    c,
    d,
    e: t0.x - a * s0.x - c * s0.y,
    f: t0.y - b * s0.x - d * s0.y,
  };
}

function writeMatrix(node: Element, { a, b, c, d, e, f }: IsolSkinMatrix) {
  const matrix = `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
  if (node.getAttribute("transform") !== matrix)
    node.setAttribute("transform", matrix);
}

export function paintIsolGreetingSleeve(
  svg: SVGSVGElement,
  upper: IsolSkinMatrix,
  forearm: IsolSkinMatrix,
) {
  const sleeve = svg.querySelector("[data-isol-greeting-sleeve]");
  if (!sleeve) return;
  const vertices = skinVertices(upper, forearm);
  writeMatrix(sleeve.querySelector("[data-sleeve-upper]")!, upper);
  writeMatrix(sleeve.querySelector("[data-sleeve-lower]")!, forearm);
  sleeve.querySelectorAll("[data-sleeve-patch]").forEach((patch, index) => {
    writeMatrix(patch, patchMatrix(patches[index], vertices));
  });
}
