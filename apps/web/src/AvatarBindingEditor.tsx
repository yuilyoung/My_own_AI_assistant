import type { AvatarBindings, ExpressionCue, MotionCue } from "./avatar-motion";
import type { CubismModel3 } from "./model3";

export const expressionCues: readonly { cue: ExpressionCue; label: string }[] = [
  { cue: "neutral", label: "중립" },
  { cue: "happy", label: "기쁨" },
  { cue: "concerned", label: "걱정" },
  { cue: "surprised", label: "놀람" },
];
export const motionCues: readonly { cue: MotionCue; label: string }[] = [
  { cue: "idle", label: "대기" },
  { cue: "nod", label: "끄덕임" },
  { cue: "greeting", label: "인사" },
];

/** Explicitly map user-owned model names; never guess generic SDK motion IDs. */
export function AvatarBindingEditor({
  manifest,
  bindings,
  disabled,
  ready,
  onChange,
  onExpression,
  onMotion,
}: {
  manifest: CubismModel3;
  bindings: AvatarBindings;
  disabled: boolean;
  ready: boolean;
  onChange: (bindings: AvatarBindings) => void;
  onExpression: (cue: ExpressionCue) => void;
  onMotion: (cue: MotionCue) => void;
}) {
  const expressions = Object.keys(manifest.expressions);
  const motions = Object.entries(manifest.motions)
    .filter(([, paths]) => paths.length > 0)
    .map(([name]) => name);
  function changeExpression(cue: ExpressionCue, name: string) {
    const next = { ...bindings.expressions };
    if (name) next[cue] = name;
    else delete next[cue];
    onChange({ ...bindings, expressions: next });
  }
  function changeMotion(cue: MotionCue, group: string) {
    const next = { ...bindings.motions };
    if (group) next[cue] = group;
    else delete next[cue];
    onChange({ ...bindings, motions: next });
  }
  return (
    <div className="avatar-bindings" aria-label="모델별 표정·모션 매핑">
      <p>실제 모델에 있는 이름만 선택하세요. 비워 두면 동작하지 않습니다.</p>
      {expressionCues.map(({ cue, label }) => (
        <div key={cue} className="avatar-binding-row">
          <label htmlFor={`avatar-expression-${cue}`}>표정: {label}</label>
          <select
            id={`avatar-expression-${cue}`}
            disabled={disabled}
            value={bindings.expressions?.[cue] ?? ""}
            onChange={(e) => changeExpression(cue, e.target.value)}
          >
            <option value="">연결 안 함</option>
            {expressions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          {ready && bindings.expressions?.[cue] && (
            <button type="button" onClick={() => onExpression(cue)}>표정 테스트: {label}</button>
          )}
        </div>
      ))}
      {motionCues.map(({ cue, label }) => (
        <div key={cue} className="avatar-binding-row">
          <label htmlFor={`avatar-motion-${cue}`}>모션: {label}</label>
          <select
            id={`avatar-motion-${cue}`}
            disabled={disabled}
            value={bindings.motions?.[cue] ?? ""}
            onChange={(e) => changeMotion(cue, e.target.value)}
          >
            <option value="">연결 안 함</option>
            {motions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          {ready && bindings.motions?.[cue] && (
            <button type="button" onClick={() => onMotion(cue)}>모션 테스트: {label}</button>
          )}
        </div>
      ))}
      <small>테스트 버튼은 로컬 SDK 어댑터가 연결된 뒤에만 표시됩니다.</small>
    </div>
  );
}
