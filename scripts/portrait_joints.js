// Rasterize the actual mounted WebP layers at their compositor placements. Keeping the
// layers separate lets the test ask whether the two pieces of paint meet at a joint.
async function measurePortraitJoints(svg, handRightOnly = false) {
  const bitmaps = new Map();
  const stage = svg.getScreenCTM().inverse();
  const stageMatrix = (node) => stage.multiply(node.getScreenCTM());
  function place(ctx, node, padding) {
    const matrix = stageMatrix(node);
    matrix.e += padding;
    matrix.f += padding;
    ctx.setTransform(matrix);
  }
  const joint = (selector) => {
    const node = svg.querySelector(selector);
    const [x, y] = getComputedStyle(node)
      .transformOrigin.split(" ")
      .map(parseFloat);
    return new DOMPoint(x, y).matrixTransform(stageMatrix(node));
  };
  async function mask(
    selector,
    exclude,
    padding = 0,
    { clipPaint = true, alpha = 128 } = {},
  ) {
    const size = 360 + 2 * padding;
    const ctx = new OffscreenCanvas(size, size).getContext("2d");
    for (const node of svg.querySelectorAll(selector)) {
      if (exclude && node.closest(exclude)) continue;
      const source =
        node.localName === "use"
          ? document.getElementById(node.href.baseVal.slice(1))
          : node;
      const url = source.href.baseVal;
      if (!bitmaps.has(url)) {
        const image = new Image();
        image.src = url;
        await image.decode();
        bitmaps.set(url, image);
      }
      const image = bitmaps.get(url);
      const rect = source.getBBox();
      const scale = Math.min(
        rect.width / image.width,
        rect.height / image.height,
      );
      const w = scale * image.width,
        h = scale * image.height;
      ctx.save();
      for (
        let owner = node;
        clipPaint && owner !== svg;
        owner = owner.parentElement
      ) {
        const clip = owner.getAttribute("clip-path")?.match(/^url\(#(.+)\)$/);
        if (!clip) continue;
        const art = document.getElementById(clip[1]).firstElementChild;
        const outline =
          art.localName === "polygon"
            ? new Path2D(`M${art.getAttribute("points")}Z`)
            : new Path2D(art.getAttribute("d") ?? "");
        if (art.localName === "rect") {
          outline.rect(
            art.x.baseVal.value,
            art.y.baseVal.value,
            art.width.baseVal.value,
            art.height.baseVal.value,
          );
        }
        place(ctx, owner, padding);
        ctx.clip(outline);
      }
      place(ctx, node, padding);
      ctx.drawImage(
        image,
        rect.x +
          (node.localName === "use" ? node.x.baseVal.value : 0) +
          (rect.width - w) / 2,
        rect.y +
          (node.localName === "use" ? node.y.baseVal.value : 0) +
          (rect.height - h) / 2,
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
      data[((y + padding) * size + x + padding) * 4 + 3] > alpha;
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
  // The same padding lets the test see paint outside the real viewport.
  const armPadding = 90;
  const handSelector = ".avatar-panel__hand :is(image,use)";
  if (handRightOnly) {
    const hand = await mask(handSelector, undefined, armPadding, { alpha: 32 });
    for (let x = 360 + armPadding - 1; x >= 0; x--)
      for (let y = 0; y < 360; y++) if (hand(x, y)) return x;
    return null;
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
  const sleeve = svg.querySelector("[data-isol-greeting-sleeve]");
  const upper = await mask(
    sleeve ? "[data-sleeve-upper] use" : ".narration__upper-arm image",
    undefined,
    armPadding,
  );
  const forearm = await mask(
    (sleeve ? "[data-sleeve-lower] use," : "") +
      ".narration__arm .narration__forearm image",
    ".avatar-panel__hand",
    armPadding,
  );
  const hand = await mask(handSelector, undefined, armPadding);
  // Finger curl changes the visible reach. Check the full texture for the
  // underlying hand length and use its articulated paint for the seam.
  const handArt = await mask(
    ".avatar-panel__hand image",
    undefined,
    armPadding,
    { clipPaint: false },
  );
  const wrist = joint(".avatar-panel__hand");
  const handLocal = stageMatrix(
    svg.querySelector(".avatar-panel__hand"),
  ).inverse();
  gaps.shoulder = jointGap(torso, upper, joint(".narration__arm"), 25);
  const elbow = joint(".narration__forearm");
  if (sleeve) {
    const crease = await mask("[data-sleeve-patch] use", undefined, armPadding);
    const upperEdge = jointGap(upper, crease, elbow, 33);
    const lowerEdge = jointGap(crease, forearm, elbow, 33);
    gaps.elbow =
      upperEdge === null || lowerEdge === null
        ? null
        : Math.max(upperEdge, lowerEdge);
  } else {
    gaps.elbow = jointGap(upper, forearm, elbow, 26);
  }
  gaps.wrist = jointGap(forearm, hand, wrist, 18);
  let reach = 0;
  for (let y = -armPadding; y < 360 + armPadding; y++)
    for (let x = -armPadding; x < 360 + armPadding; x++) {
      if (handArt(x, y)) {
        const dx = x + 0.5 - wrist.x;
        const dy = y + 0.5 - wrist.y;
        reach = Math.max(
          reach,
          Math.hypot(
            handLocal.a * dx + handLocal.c * dy,
            handLocal.b * dx + handLocal.d * dy,
          ),
        );
      }
    }
  const shoulder = joint(".narration__arm");
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // The camera-plane length changes in transit; undo the forearm's projection
  // to check the underlying distance between its painted attachments.
  const armLocal = stageMatrix(
    svg.querySelector(sleeve ? "[data-sleeve-lower]" : ".narration__forearm"),
  ).inverse();
  const upperLocal = stageMatrix(
    svg.querySelector(sleeve ? "[data-sleeve-upper]" : ".narration__arm"),
  ).inverse();
  const placement = sleeve ? stageMatrix(sleeve) : new DOMMatrix();
  const unit = Math.hypot(placement.a, placement.b);
  return {
    gaps,
    reach,
    upperArm:
      unit *
      distance(
        shoulder.matrixTransform(upperLocal),
        elbow.matrixTransform(upperLocal),
      ),
    forearm:
      unit *
      distance(
        elbow.matrixTransform(armLocal),
        wrist.matrixTransform(armLocal),
      ),
    projectedForearm: distance(elbow, wrist),
  };
}
