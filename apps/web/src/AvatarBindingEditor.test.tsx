// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarBindingEditor } from "./AvatarBindingEditor";
import type { AvatarBindings } from "./avatar-motion";
import type { CubismModel3 } from "./model3";

const manifest: CubismModel3 = {
  moc: "A.moc3",
  textures: ["A.png"],
  referencedFiles: ["A.moc3", "A.png"],
  lipSyncIds: ["ParamMouthOpenY"],
  expressions: { F01: "expressions/F01.exp3.json" },
  motions: { Idle: ["motions/idle.motion3.json"], Empty: [] },
};
afterEach(cleanup);

it("maps only actual model names and forwards explicit preview cues", async () => {
  const user = userEvent.setup();
  const onExpression = vi.fn();
  const onMotion = vi.fn();
  let bindings: AvatarBindings = {};
  const { rerender } = render(
    <AvatarBindingEditor
      manifest={manifest}
      bindings={bindings}
      disabled={false}
      ready={false}
      onChange={update}
      onExpression={onExpression}
      onMotion={onMotion}
    />,
  );
  function update(next: AvatarBindings) {
    bindings = next;
    rerender(
      <AvatarBindingEditor
        manifest={manifest}
        bindings={next}
        disabled={false}
        ready
        onChange={update}
        onExpression={onExpression}
        onMotion={onMotion}
      />,
    );
  }
  await user.selectOptions(screen.getByLabelText("표정: 기쁨"), "F01");
  expect(bindings.expressions?.happy).toBe("F01");
  await user.selectOptions(screen.getByLabelText("모션: 대기"), "Idle");
  expect(bindings.motions?.idle).toBe("Idle");
  expect(screen.queryByRole("option", { name: "Empty" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "표정 테스트: 기쁨" }));
  await user.click(screen.getByRole("button", { name: "모션 테스트: 대기" }));
  expect(onExpression).toHaveBeenCalledExactlyOnceWith("happy");
  expect(onMotion).toHaveBeenCalledExactlyOnceWith("idle");
  await user.selectOptions(screen.getByLabelText("표정: 기쁨"), "");
  expect(bindings.expressions?.happy).toBeUndefined();
});

it("does not allow mapping edits before asset inspection is finished", async () => {
  const onChange = vi.fn();
  render(
    <AvatarBindingEditor
      manifest={manifest}
      bindings={{}}
      disabled
      ready={false}
      onChange={onChange}
      onExpression={vi.fn()}
      onMotion={vi.fn()}
    />,
  );
  expect(
    (screen.getByLabelText("표정: 기쁨") as HTMLSelectElement).disabled,
  ).toBe(true);
  expect(screen.queryByText("표정 테스트: 기쁨")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
