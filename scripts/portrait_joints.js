// Rasterize the actual mounted WebP layers at their compositor placements. Keeping the
// layers separate lets the test ask whether the two pieces of paint meet at a joint.
async function measurePortraitJoints(svg) {
  const bitmaps = new Map();
  const stage = svg.getScreenCTM().inverse();
  const stageMatrix = (node) => stage.multiply(node.getScreenCTM());
  const joint = (selector) => {
    const node = svg.querySelector(selector);
    const [x, y] = getComputedStyle(node)
      .transformOrigin.split(" ")
      .map(parseFloat);
    return new DOMPoint(x, y).matrixTransform(stageMatrix(node));
  };
  async function mask(selector, exclude, padding = 0) {
    const size = 360 + 2 * padding;
    const ctx = new OffscreenCanvas(size, size).getContext("2d");
    for (const node of svg.querySelectorAll(selector)) {
      if (exclude && node.closest(exclude)) continue;
      const url = node.href.baseVal;
      if (!bitmaps.has(url)) {
        const image = new Image();
        image.src = url;
        await image.decode();
        bitmaps.set(url, image);
      }
      const image = bitmaps.get(url);
      const rect = node.getBBox();
      const scale = Math.min(
        rect.width / image.width,
        rect.height / image.height,
      );
      const w = scale * image.width,
        h = scale * image.height;
      ctx.save();
      const matrix = stageMatrix(node);
      matrix.e += padding;
      matrix.f += padding;
      ctx.setTransform(matrix);
      const clip = node.getAttribute("clip-path")?.match(/^url\(#(.+)\)$/);
      if (clip) {
        const path = document.getElementById(clip[1]).querySelector("path");
        ctx.clip(new Path2D(path.getAttribute("d")));
      }
      ctx.drawImage(
        image,
        rect.x + (rect.width - w) / 2,
        rect.y + (rect.height - h) / 2,
        w,
        h,
      );
      ctx.restore();
    }
    const data = ctx.getImageData(0, 0, size, size).data;
    return (x, y) =>
      x >= -padding &&
      x < 360 + padding &&
      y >= -padding &&
      y < 360 + padding &&
      data[((y + padding) * size + x + padding) * 4 + 3] > 128;
  }
  function jointGap(first, second, pivot, radius) {
    // A local seam can be hidden under another layer. Look for opaque raster
    // overlap (zero), adjacent raster pixels (one), or an actual painted gap.
    let gap = Infinity;
    for (let y = Math.round(pivot.y) - radius; y <= pivot.y + radius; y++) {
      for (let x = Math.round(pivot.x) - radius; x <= pivot.x + radius; x++) {
        if (!first(x, y) || Math.hypot(x - pivot.x, y - pivot.y) > radius)
          continue;
        if (second(x, y)) return 0;
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            if (second(x + dx, y + dy)) gap = Math.min(gap, Math.hypot(dx, dy));
          }
      }
    }
    return Number.isFinite(gap) ? gap : null;
  }
  const active = svg.querySelector(".avatar-panel__hand [data-pose]");
  const outfit = active
    ? ".narration__raised-outfit"
    : ".narration__rest-outfit";
  const torso = await mask(outfit + " image", ".narration__upper-arm");
  const head = await mask(
    ".avatar-panel__head > :first-child image, .avatar-panel__head > image:first-child",
  );
  const gaps = {
    neck: jointGap(torso, head, joint(".avatar-panel__head"), 28),
  };
  if (!active) return { gaps };
  // A reaching wrist can enter from below the stage crop. Measure every
  // painted segment of the arm in the same padded stage coordinate space.
  const armPadding = 90;
  const upper = await mask(
    ".narration__upper-arm image",
    undefined,
    armPadding,
  );
  const forearm = await mask(
    ".narration__arm .narration__forearm image",
    ".avatar-panel__hand",
    armPadding,
  );
  const hand = await mask(".avatar-panel__hand image", undefined, armPadding);
  const wrist = joint(".avatar-panel__hand");
  gaps.shoulder = jointGap(torso, upper, joint(".narration__arm"), 25);
  gaps.elbow = jointGap(upper, forearm, joint(".narration__forearm"), 26);
  gaps.wrist = jointGap(forearm, hand, wrist, 18);
  let reach = 0;
  for (let y = -armPadding; y < 360 + armPadding; y++)
    for (let x = -armPadding; x < 360 + armPadding; x++) {
      if (hand(x, y))
        reach = Math.max(
          reach,
          Math.hypot(x + 0.5 - wrist.x, y + 0.5 - wrist.y),
        );
    }
  const shoulder = joint(".narration__arm"),
    elbow = joint(".narration__forearm");
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return {
    gaps,
    reach,
    upperArm: distance(shoulder, elbow),
    forearm: distance(elbow, wrist),
  };
}
