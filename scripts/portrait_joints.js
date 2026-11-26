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
  async function mask(selector, exclude) {
    const ctx = new OffscreenCanvas(360, 360).getContext("2d");
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
      ctx.setTransform(stageMatrix(node));
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
    const data = ctx.getImageData(0, 0, 360, 360).data;
    return (x, y) =>
      x >= 0 &&
      x < 360 &&
      y >= 0 &&
      y < 360 &&
      data[(y * 360 + x) * 4 + 3] > 128;
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
  const upper = await mask(".narration__upper-arm image");
  const forearm = await mask(
    ".narration__arm .narration__forearm image",
    ".avatar-panel__hand",
  );
  const hand = await mask(".avatar-panel__hand image");
  const wrist = joint(".avatar-panel__hand");
  gaps.shoulder = jointGap(torso, upper, joint(".narration__arm"), 25);
  gaps.elbow = jointGap(upper, forearm, joint(".narration__forearm"), 26);
  gaps.wrist = jointGap(forearm, hand, wrist, 18);
  let reach = 0;
  for (let y = 0; y < 360; y++)
    for (let x = 0; x < 360; x++) {
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
