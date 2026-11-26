type Point = { x: number; y: number };

// Attachment points on the 600 × 800 original shirt drawing. The wrist is
// below the crop. The painted cuff and the last visible skin define its axis.
const shoulder = { x: 460, y: 374 };
const elbow = { x: 486, y: 625 };
const wrist = { x: 512, y: 831 };
const upper = { x: elbow.x - shoulder.x, y: elbow.y - shoulder.y };
const lower = { x: wrist.x - elbow.x, y: wrist.y - elbow.y };
const upperLength = Math.hypot(upper.x, upper.y);
const lowerLength = Math.hypot(lower.x, lower.y);
const upperHeading = Math.atan2(upper.y, upper.x);
const lowerHeading = Math.atan2(lower.y, lower.x);
const rad = Math.PI / 180;
const initialPlane = 0.285;
const initialFlex = Math.atan(
  Math.tan(upperHeading - lowerHeading) / initialPlane,
);
const initialProjection = Math.hypot(
  Math.cos(initialFlex),
  Math.sin(initialFlex) * initialPlane,
);

function smoothstep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

// Map the two attachment points exactly. Preserve the width across the bone
// when its projected length changes as it turns towards the camera.
function boneMap(
  pivot: Point,
  bone: Point,
  length: number,
  target: Point,
  projected: Point,
) {
  const x = bone.x / length;
  const y = bone.y / length;
  const projectedLength = Math.hypot(projected.x, projected.y);
  const tx = projected.x / projectedLength;
  const ty = projected.y / projectedLength;
  const a = (projected.x / length) * x + ty * y;
  const b = (projected.y / length) * x - tx * y;
  const c = (projected.x / length) * y - ty * x;
  const d = (projected.y / length) * y + tx * x;
  return {
    a,
    b,
    c,
    d,
    e: target.x - a * pivot.x - c * pivot.y,
    f: target.y - b * pivot.x - d * pivot.y,
  };
}

// The raised hand artwork uses the elbow (522,606) and wrist (544,412).
// Backsolve its existing SVG rotation and local Y scale onto the same joints
// as the deformed resting sleeve so the hand stays attached to its cuff.
function registerBone(nativeX: number, nativeY: number, target: Point) {
  const scale = Math.sqrt(
    Math.max(
      0.04,
      (target.x ** 2 + target.y ** 2 - nativeX ** 2) / nativeY ** 2,
    ),
  );
  const angle =
    (Math.atan2(target.y, target.x) - Math.atan2(nativeY * scale, nativeX)) /
    rad;
  return { angle, scale };
}

export function isolGreetingPose(open: number) {
  const raise = smoothstep((open - 0.15) / 0.85);
  const direction = upperHeading + (78 * rad - upperHeading) * raise;
  const upperProjection = upperLength * (1 - 0.17 * raise);
  const ux = Math.cos(direction),
    uy = Math.sin(direction);
  const projectedUpper = { x: upperProjection * ux, y: upperProjection * uy };
  const projectedElbow = {
    x: shoulder.x + projectedUpper.x,
    y: shoulder.y + projectedUpper.y,
  };

  // First bend beside the ribs, then turn the forearm out to present the palm.
  // Flexion stays on one side of the elbow through the lift and the release.
  const flex = initialFlex + (140 * rad - initialFlex) * open;
  const along = Math.cos(flex);
  const across =
    -Math.sin(flex) * (initialPlane + 0.3 * smoothstep((open - 0.35) / 0.65));
  const projectedLower = {
    x: (lowerLength / initialProjection) * (along * ux - across * uy),
    y: (lowerLength / initialProjection) * (along * uy + across * ux),
  };
  const upperJoint = registerBone(62, 232, projectedUpper);
  const lowerJoint = registerBone(22, -194, projectedLower);
  return {
    shoulder: upperJoint.angle,
    upperScale: upperJoint.scale,
    elbow: lowerJoint.angle - upperJoint.angle,
    forearmScale: lowerJoint.scale,
    upperPaint: boneMap(shoulder, upper, upperLength, shoulder, projectedUpper),
    forearmPaint: boneMap(
      elbow,
      lower,
      lowerLength,
      projectedElbow,
      projectedLower,
    ),
  };
}
