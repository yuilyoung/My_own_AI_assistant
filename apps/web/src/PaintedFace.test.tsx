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
