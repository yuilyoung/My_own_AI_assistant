// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { isolArt } from "./IsolArt";
import { PaintedFace, paintedFeatureImages } from "./PaintedFace";

afterEach(cleanup);

function portrait(level: number) {
  return (
    <PaintedFace
      id="isol-test"
      rig={isolArt.faceRig}
      character="isol"
      emotion="neutral"
      level={level}
      brightness={0.5}
    />
  );
}

it("moves each painted iris inside its own eye opening while the whites and occluding ink stay registered", () => {
  const { container } = render(<svg>{portrait(0)}</svg>);
  const apertures = new Set<string>();
  const images = paintedFeatureImages(isolArt.faceRig);
  const eyes = container.querySelectorAll(".painted-face__eye-pose");
  expect(eyes).toHaveLength(2);
  eyes.forEach((eye) => {
    const iris = eye.querySelector<SVGGElement>(".painted-face__gaze-iris")!;
    expect(iris).toBeTruthy();
    const clip = iris.parentElement!.getAttribute("clip-path")!;
    expect(clip).toMatch(/^url\(#.+\)$/);
    apertures.add(clip);
    expect(
      container.querySelector(clip.slice(4, -1))?.firstElementChild?.tagName,
    ).toBe("path");
    for (const selector of [
      ".painted-face__eye-socket",
      ".painted-face__lash",
    ]) {
      const plate = eye.querySelector(selector)!;
      expect(plate).toBeTruthy();
      expect(iris.contains(plate)).toBe(false);
      expect(images).toContain(plate.getAttribute("href"));
    }
    expect(images).toContain(iris.querySelector("image")?.getAttribute("href"));
  });
  expect(apertures.size).toBe(2);
});

it("keeps the original closed lips through floor noise and restores them during a speech pause", () => {
  const { container, rerender } = render(<svg>{portrait(0.006)}</svg>);
  const lips = container.querySelector(".painted-face__mouth-rest")!;
  expect(lips.getAttribute("opacity")).toBe("1");
  rerender(<svg>{portrait(0.6)}</svg>);
  expect(lips.getAttribute("opacity")).toBe("0");
  rerender(<svg>{portrait(0)}</svg>);
  expect(lips.getAttribute("opacity")).toBe("1");
});

it("keeps each feature's rotation and scale centered on the drawing as an expression begins", () => {
  const rig = isolArt.faceRig;
  const { container, rerender } = render(<svg>{portrait(0)}</svg>);
  const origins = (selector: string) =>
    Array.from(
      container.querySelectorAll<SVGGElement>(selector),
      (e) => e.style.transformOrigin,
    );
  const mouth = [rig.mouth.center.map((v) => v + "px").join(" ")];
  const eyelids = rig.eyes.map(
    (eye) => eye.center[0] + "px " + eye.blinkY + "px",
  );
  const brows = rig.eyes.map(
    ({ brow }) =>
      brow.x + brow.width / 2 + "px " + (brow.y + brow.height / 2) + "px",
  );
  function checkPivots() {
    expect(origins(".painted-face__mouth-pose")).toEqual(mouth);
    expect(origins(".painted-face__eye-pose")).toEqual(eyelids);
    expect(origins(".painted-face__brow-pose")).toEqual(brows);
  }
  checkPivots();
  rerender(
    <svg>
      <PaintedFace
        id="isol-test"
        rig={rig}
        character="isol"
        emotion="surprised"
        level={0}
        brightness={0.5}
      />
    </svg>,
  );
  checkPivots();
});
