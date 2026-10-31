// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarInspector } from "./AvatarInspector";
import { inspectLocalModel3 } from "./model3";
import { verifyLocalModelResources } from "./model-assets";

vi.mock("./model3", () => ({
  inspectLocalModel3: vi.fn(),
}));
vi.mock("./model-assets", () => ({
  verifyLocalModelResources: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("inspects local model metadata without claiming that Cubism is loaded", async () => {
  vi.mocked(inspectLocalModel3).mockResolvedValue({
    moc: "Haru.moc3",
    textures: ["Haru.2048/texture_00.png"],
    referencedFiles: ["Haru.moc3", "Haru.2048/texture_00.png"],
    lipSyncIds: ["ParamMouthOpenY"],
    expressions: {},
    motions: {},
  });
  const user = userEvent.setup();
  render(<AvatarInspector />);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "모델 JSON 검사" }));
  expect((await screen.findByRole("status")).textContent).toContain(
    "실제 파일 존재·렌더링은 미검증",
  );
  expect(inspectLocalModel3).toHaveBeenCalledWith(
    "/avatar-local/Haru/Haru.model3.json",
    window.location.origin,
  );
});

it("shows missing or rejected asset errors to the user", async () => {
  vi.mocked(inspectLocalModel3).mockRejectedValue(
    new Error("모델 파일을 읽을 수 없습니다"),
  );
  const user = userEvent.setup();
  render(<AvatarInspector />);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/not-found.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "모델 JSON 검사" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "모델 파일을 읽을 수 없습니다",
  );
});

it("reports accessible and missing referenced resources separately from JSON validation", async () => {
  vi.mocked(verifyLocalModelResources).mockResolvedValue({
    manifest: {
      moc: "Haru.moc3",
      textures: ["textures/0.png"],
      referencedFiles: ["Haru.moc3", "textures/0.png"],
      lipSyncIds: ["ParamMouthOpenY"],
      expressions: {},
      motions: {},
    },
    checked: 2,
    available: 1,
    issues: [{ path: "textures/0.png", reason: "HTTP 404" }],
  });
  const user = userEvent.setup();
  render(<AvatarInspector />);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(
    screen.getByRole("button", { name: "참조 파일 접근 검사" }),
  );
  expect((await screen.findByRole("status")).textContent).toContain(
    "참조 파일 HEAD 확인: 1/2개",
  );
  expect(
    screen.getByRole("list", { name: "문제가 있는 모델 자산" }).textContent,
  ).toContain("textures/0.png: HTTP 404");
  expect(verifyLocalModelResources).toHaveBeenCalledWith(
    "/avatar-local/Haru/Haru.model3.json",
    window.location.origin,
    undefined,
    expect.any(AbortSignal),
  );
});

it("does not mask resource request errors as successful validation", async () => {
  vi.mocked(verifyLocalModelResources).mockRejectedValue(
    new Error("HEAD 접근 거부"),
  );
  const user = userEvent.setup();
  render(<AvatarInspector />);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(
    screen.getByRole("button", { name: "참조 파일 접근 검사" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "HEAD 접근 거부",
  );
  expect(screen.queryByRole("status")).toBeNull();
});
