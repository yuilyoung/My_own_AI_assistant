// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AvatarMotionBridge } from "./avatar-motion";
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
    expressions: { F01: "expressions/F01.exp3.json" },
    motions: { Idle: ["motions/idle.motion3.json"] },
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
  expect((await screen.findByRole("status")).textContent).toContain(
    "표정 F01, 모션 Idle",
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

it("shows inaccessible Live2D asset references", async () => {
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
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
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

it("reports resource HEAD request failures", async () => {
  vi.mocked(verifyLocalModelResources).mockRejectedValue(
    new Error("HEAD 접근 거부"),
  );
  const user = userEvent.setup();
  render(<AvatarInspector />);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "HEAD 접근 거부",
  );
  expect(screen.queryByRole("status")).toBeNull();
});

function modelAudit(available: number) {
  return {
    manifest: {
      moc: "Haru.moc3",
      textures: ["textures/0.png"],
      referencedFiles: ["Haru.moc3", "textures/0.png"],
      lipSyncIds: ["ParamMouthOpenY"],
      expressions: {},
      motions: {},
    },
    checked: 2,
    available,
    issues:
      available === 2 ? [] : [{ path: "textures/0.png", reason: "HTTP 404" }],
  };
}

it("connects an explicitly installed runtime only after local asset preflight", async () => {
  vi.mocked(verifyLocalModelResources).mockResolvedValue(modelAudit(2));
  const adapter = {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
  const loadAdapter = vi.fn(async () => adapter);
  const bridge = new AvatarMotionBridge();
  const user = userEvent.setup();
  render(<AvatarInspector bridge={bridge} loadAdapter={loadAdapter} />);
  const connect = screen.getByRole("button", {
    name: "로컬 Cubism 어댑터 연결",
  }) as HTMLButtonElement;
  expect(connect.disabled).toBe(true);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  expect(await screen.findByText(/참조 파일 HEAD 확인: 2\/2개/)).toBeTruthy();
  await waitFor(() => expect(connect.disabled).toBe(false));
  await user.click(connect);
  expect(await screen.findByText(/로컬 어댑터 초기화 완료/)).toBeTruthy();
  expect(loadAdapter).toHaveBeenCalledWith(
    screen.getByRole("img", { name: "Live2D 로컬 캔버스" }),
  );
  expect(bridge.ready).toBe(true);
  bridge.onAudioLevel(0.4);
  expect(adapter.setLipSync).toHaveBeenLastCalledWith(0.4);
  const slider = screen.getByRole("slider", {
    name: /수동 입모양 테스트 강도/,
  });
  fireEvent.change(slider, { target: { value: "0.75" } });
  expect(adapter.setLipSync).toHaveBeenLastCalledWith(0.75);
  fireEvent.pointerUp(slider);
  expect(adapter.setLipSync).toHaveBeenLastCalledWith(0);
  fireEvent.change(slider, { target: { value: "0.5" } });
  await user.click(screen.getByRole("button", { name: "입모양 닫기" }));
  expect(adapter.setLipSync).toHaveBeenLastCalledWith(0);
  cleanup();
  expect(bridge.ready).toBe(false);
  expect(adapter.dispose).toHaveBeenCalledOnce();
});

it("refuses SDK activation when even one referenced resource fails HEAD", async () => {
  vi.mocked(verifyLocalModelResources).mockResolvedValue(modelAudit(1));
  const loadAdapter = vi.fn();
  const user = userEvent.setup();
  render(
    <AvatarInspector
      bridge={new AvatarMotionBridge()}
      loadAdapter={loadAdapter}
    />,
  );
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  expect(await screen.findByText(/참조 파일 HEAD 확인: 1\/2개/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "로컬 Cubism 어댑터 연결",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(loadAdapter).not.toHaveBeenCalled();
});

it("reports missing private SDK runtime rather than claiming a rendered avatar", async () => {
  vi.mocked(verifyLocalModelResources).mockResolvedValue(modelAudit(2));
  const bridge = new AvatarMotionBridge();
  const user = userEvent.setup();
  render(
    <AvatarInspector
      bridge={bridge}
      loadAdapter={async () => {
        throw new Error("Cubism SDK not installed");
      }}
    />,
  );
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "로컬 Cubism 어댑터 연결",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  await user.click(
    screen.getByRole("button", { name: "로컬 Cubism 어댑터 연결" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Cubism SDK not installed",
  );
  expect(bridge.ready).toBe(false);
});

it("forwards explicitly mapped preview cues to the licensed adapter", async () => {
  const audit = modelAudit(2);
  audit.manifest.expressions = { F01: "expressions/F01.exp3.json" };
  audit.manifest.motions = { Idle: ["motions/idle.motion3.json"] };
  vi.mocked(verifyLocalModelResources).mockResolvedValue(audit);
  const adapter = {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
  const bridge = new AvatarMotionBridge();
  const user = userEvent.setup();
  render(<AvatarInspector bridge={bridge} loadAdapter={async () => adapter} />);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  await screen.findByText(/참조 파일 HEAD 확인: 2\/2개/);
  await user.selectOptions(screen.getByLabelText("표정: 기쁨"), "F01");
  await user.selectOptions(screen.getByLabelText("모션: 대기"), "Idle");
  await user.click(
    screen.getByRole("button", { name: "로컬 Cubism 어댑터 연결" }),
  );
  expect(await screen.findByText(/로컬 어댑터 초기화 완료/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "표정 테스트: 기쁨" }));
  await user.click(screen.getByRole("button", { name: "모션 테스트: 대기" }));
  expect(adapter.setExpression).toHaveBeenCalledExactlyOnceWith("F01");
  expect(adapter.setMotion).toHaveBeenCalledExactlyOnceWith("Idle");

  await user.selectOptions(screen.getByLabelText("표정: 기쁨"), "");
  expect(bridge.ready).toBe(false);
  expect(adapter.dispose).toHaveBeenCalledOnce();
  expect(
    (
      screen.getByRole("button", {
        name: "로컬 Cubism 어댑터 연결",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});

it("does not enable manual lipsync for a model without LipSync parameters", async () => {
  const audit = modelAudit(2);
  audit.manifest.lipSyncIds = [];
  vi.mocked(verifyLocalModelResources).mockResolvedValue(audit);
  const adapter = {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
  const user = userEvent.setup();
  render(
    <AvatarInspector
      bridge={new AvatarMotionBridge()}
      loadAdapter={async () => adapter}
    />,
  );
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  await screen.findByText(/참조 파일 HEAD 확인: 2\/2개/);
  await user.click(
    screen.getByRole("button", { name: "로컬 Cubism 어댑터 연결" }),
  );
  await screen.findByText(/로컬 어댑터 초기화 완료/);
  expect(screen.queryByRole("slider", { name: /수동 입모양/ })).toBeNull();
  expect(adapter.setLipSync).not.toHaveBeenCalled();
});

it("detaches a licensed adapter when WebGL is lost and waits for restoration", async () => {
  vi.mocked(verifyLocalModelResources).mockResolvedValue(modelAudit(2));
  const adapter = {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
  const bridge = new AvatarMotionBridge();
  const user = userEvent.setup();
  render(<AvatarInspector bridge={bridge} loadAdapter={async () => adapter} />);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  await screen.findByText(/참조 파일 HEAD 확인: 2\/2개/);
  const connect = screen.getByRole("button", {
    name: "로컬 Cubism 어댑터 연결",
  }) as HTMLButtonElement;
  await user.click(connect);
  await screen.findByText(/로컬 어댑터 초기화 완료/);
  expect(bridge.ready).toBe(true);

  const canvas = screen.getByRole("img", {
    name: "Live2D 로컬 캔버스",
  });
  const lost = new Event("webglcontextlost", { cancelable: true });
  fireEvent(canvas, lost);
  expect(lost.defaultPrevented).toBe(true);
  expect(bridge.ready).toBe(false);
  expect(adapter.setLipSync).toHaveBeenLastCalledWith(0);
  expect(adapter.dispose).toHaveBeenCalledOnce();
  expect(connect.disabled).toBe(true);
  expect(screen.queryByRole("slider", { name: /수동 입모양/ })).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("컨텍스트가 손실");
  const calls = adapter.setLipSync.mock.calls.length;
  bridge.onAudioLevel(0.7);
  expect(adapter.setLipSync).toHaveBeenCalledTimes(calls);

  fireEvent(canvas, new Event("webglcontextrestored"));
  expect(connect.disabled).toBe(false);
  expect(screen.getByRole("alert").textContent).toContain("다시 연결");
  expect(bridge.ready).toBe(false);
});

it("cancels an in-flight adapter factory after WebGL context loss", async () => {
  vi.mocked(verifyLocalModelResources).mockResolvedValue(modelAudit(2));
  const adapter = {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
  let complete!: (value: typeof adapter) => void;
  const delayed = new Promise<typeof adapter>((resolve) => {
    complete = resolve;
  });
  const loadAdapter = vi.fn(() => delayed);
  const bridge = new AvatarMotionBridge();
  const user = userEvent.setup();
  render(<AvatarInspector bridge={bridge} loadAdapter={loadAdapter} />);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  await screen.findByText(/참조 파일 HEAD 확인: 2\/2개/);
  await user.click(
    screen.getByRole("button", { name: "로컬 Cubism 어댑터 연결" }),
  );
  expect(loadAdapter).toHaveBeenCalledOnce();
  const canvas = screen.getByRole("img", {
    name: "Live2D 로컬 캔버스",
  });
  fireEvent(canvas, new Event("webglcontextlost", { cancelable: true }));
  complete(adapter);
  await waitFor(() => expect(adapter.dispose).toHaveBeenCalledOnce());
  expect(adapter.load).not.toHaveBeenCalled();
  expect(bridge.ready).toBe(false);
  expect(screen.queryByText(/로컬 어댑터 초기화 완료/)).toBeNull();
});

it("preserves recovery controls if the GPU cleanup throws", async () => {
  vi.mocked(verifyLocalModelResources).mockResolvedValue(modelAudit(2));
  const adapter = {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(() => {
      throw new Error("driver lost");
    }),
  };
  const bridge = new AvatarMotionBridge();
  const user = userEvent.setup();
  render(<AvatarInspector bridge={bridge} loadAdapter={async () => adapter} />);
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  await screen.findByText(/참조 파일 HEAD 확인: 2\/2개/);
  const connect = screen.getByRole("button", {
    name: "로컬 Cubism 어댑터 연결",
  }) as HTMLButtonElement;
  await user.click(connect);
  await screen.findByText(/로컬 어댑터 초기화 완료/);
  const canvas = screen.getByRole("img", {
    name: "Live2D 로컬 캔버스",
  });
  fireEvent(canvas, new Event("webglcontextlost", { cancelable: true }));
  expect(bridge.ready).toBe(false);
  expect(adapter.dispose).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert").textContent).toContain("정리에도 실패");
  expect(connect.disabled).toBe(true);
  fireEvent(canvas, new Event("webglcontextrestored"));
  expect(connect.disabled).toBe(false);
});

it("shows an SDK callback failure instead of stale connected status", async () => {
  vi.mocked(verifyLocalModelResources).mockResolvedValue(modelAudit(2));
  const adapter = {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
  const bridge = new AvatarMotionBridge();
  const loadAdapter = vi.fn(async () => adapter);
  const user = userEvent.setup();
  const { rerender } = render(
    <AvatarInspector bridge={bridge} loadAdapter={loadAdapter} />,
  );
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.click(screen.getByRole("button", { name: "참조 파일 접근 검사" }));
  await screen.findByText(/참조 파일 HEAD 확인: 2\\/2개/);
  await user.click(
    screen.getByRole("button", { name: "로컬 Cubism 어댑터 연결" }),
  );
  await screen.findByText(/로컬 어댑터 초기화 완료/);
  adapter.setLipSync.mockImplementation(() => {
    throw new Error("GPU callback failed");
  });
  bridge.onAudioLevel(0.6);
  rerender(<AvatarInspector bridge={bridge} loadAdapter={loadAdapter} />);

  expect(bridge.ready).toBe(false);
  expect(adapter.dispose).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert").textContent).toContain("GPU callback failed");
  expect(screen.queryByText(/로컬 어댑터 초기화 완료/)).toBeNull();
});
