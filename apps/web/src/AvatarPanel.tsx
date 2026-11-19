import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AvatarInspector } from "./AvatarInspector";
import { normalizedLipSync } from "./avatar";
import type {
  AvatarMotionBridge,
  ExpressionCue,
  MotionCue,
} from "./avatar-motion";
import type { Segment } from "./gateway";
import "./avatar-panel.css";

export type AvatarPanelProps = {
  bridge: AvatarMotionBridge;
  level: number;
  cue?: Pick<Segment, "emotion" | "gesture">;
  busy?: boolean;
};

const emotions: Record<ExpressionCue, string> = {
  neutral: "차분함",
  happy: "기쁨",
  concerned: "걱정",
  surprised: "놀람",
};
const gestures: Record<MotionCue, string> = {
  idle: "대기",
  nod: "끄덕임",
  greeting: "인사",
};

/** Original SVG artwork; independent of the optional licensed renderer. */
function BuiltinAvatar({
  level,
  emotion,
  gesture,
  cue,
}: {
  level: number;
  emotion: ExpressionCue;
  gesture: MotionCue;
  cue: AvatarPanelProps["cue"];
}) {
  const id = useId();
  const head = useRef<SVGGElement>(null);
  const hand = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const target =
      gesture === "nod"
        ? head.current
        : gesture === "greeting"
          ? hand.current
          : null;
    if (!target) return;
    // A new reply may repeat the same CSS animation after it has finished.
    // Restart only its transform; keep the face and audio-driven mouth mounted.
    target.style.animation = "none";
    target.getBoundingClientRect();
    target.style.removeProperty("animation");
  }, [cue, gesture]);

  const rest = emotion === "surprised" ? 6 : 2;
  const brows =
    emotion === "concerned"
      ? "M119 136l17-7 M184 129l17 7"
      : emotion === "surprised"
        ? "M119 126q9-8 18 0 M183 126q9-8 18 0"
        : "M119 130q9-4 18 0 M183 130q9-4 18 0";

  return (
    <svg
      className="avatar-panel__svg"
      viewBox="0 0 320 320"
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>
        기본 아바타 · {emotions[emotion]} · {gestures[gesture]}
      </title>
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#b8f8e5" />
          <stop offset="1" stopColor="#8aabed" />
        </linearGradient>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#a6c5f6" />
          <stop offset="1" stopColor="#657ed2" />
        </linearGradient>
      </defs>
      <g aria-hidden="true">
        <circle cx="160" cy="153" r="119" fill="#172a40" />
        <circle
          cx="160"
          cy="153"
          r="101"
          fill="none"
          stroke="#39546c"
          strokeDasharray="3 11"
        />
        <path
          d="M53 82v14m-7-7h14 M263 205v14m-7-7h14"
          stroke="#9cded4"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="252" cy="75" r="4" fill="#b8a5ef" />
        <circle cx="66" cy="220" r="3" fill="#b8a5ef" />
        <ellipse
          cx="160"
          cy="291"
          rx="68"
          ry="9"
          fill="#070f22"
          opacity="0.5"
        />
        <g
          className="avatar-panel__character"
          data-testid="avatar-character"
          data-gesture={gesture}
        >
          <path
            d="M135 266l-7 17m57-17 7 17"
            stroke="#8cabeb"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <rect
            x="119"
            y="213"
            width="82"
            height="63"
            rx="28"
            fill={`url(#${id}-body)`}
          />
          <path
            d="M126 231q-24 0-29 25"
            stroke="#a1c9ef"
            strokeWidth="17"
            strokeLinecap="round"
            fill="none"
          />
          <g className="avatar-panel__hand" ref={hand}>
            <path
              d="M196 232q29 8 39-18"
              stroke="#a1c9ef"
              strokeWidth="17"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="237" cy="208" r="12" fill="#b8f8e5" />
          </g>
          <path
            d="M151 245l7 7 13-15"
            stroke="#e3fcf6"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <g className="avatar-panel__head" ref={head}>
            <path d="M160 96V78" stroke="#a4c9e8" strokeWidth="6" />
            <circle
              className="avatar-panel__antenna"
              cx="160"
              cy="71"
              r="10"
              fill="#b8f8e5"
            />
            <rect
              x="69"
              y="141"
              width="22"
              height="37"
              rx="11"
              fill="#91b1e2"
            />
            <rect
              x="229"
              y="141"
              width="22"
              height="37"
              rx="11"
              fill="#91b1e2"
            />
            <rect
              x="80"
              y="94"
              width="160"
              height="129"
              rx="44"
              fill={`url(#${id}-shell)`}
            />
            <rect
              x="94"
              y="109"
              width="132"
              height="98"
              rx="33"
              fill="#182940"
            />
            <g data-testid="avatar-features">
              <path
                d={brows}
                fill="none"
                stroke="#a9d8ec"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <g className="avatar-panel__eyes" fill="#e0fff5">
                {emotion === "happy" ? (
                  <path
                    d="M120 150q8-13 16 0 M184 150q8-13 16 0"
                    fill="none"
                    stroke="#e0fff5"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                ) : (
                  <>
                    <ellipse
                      cx="128"
                      cy="149"
                      rx={emotion === "surprised" ? 7 : 5}
                      ry={emotion === "surprised" ? 11 : 8}
                    />
                    <ellipse
                      cx="192"
                      cy="149"
                      rx={emotion === "surprised" ? 7 : 5}
                      ry={emotion === "surprised" ? 11 : 8}
                    />
                  </>
                )}
              </g>
              <ellipse
                cx="112"
                cy="169"
                rx="9"
                ry="4"
                fill="#f1a9bd"
                opacity={emotion === "happy" ? 0.8 : 0.35}
              />
              <ellipse
                cx="208"
                cy="169"
                rx="9"
                ry="4"
                fill="#f1a9bd"
                opacity={emotion === "happy" ? 0.8 : 0.35}
              />
              <ellipse
                className="avatar-panel__mouth"
                data-testid="avatar-mouth"
                cx="160"
                cy="178"
                rx={emotion === "surprised" ? 8 : 12}
                ry={rest + level * (18 - rest)}
                fill="#f0b9ca"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

/** A parent key tied to mode/service resets both selection and inspector state. */
export function AvatarPanel({
  bridge,
  level,
  cue,
  busy = false,
}: AvatarPanelProps) {
  const [kind, setKind] = useState<"builtin" | "live2d">("builtin");
  const id = useId();
  const audioLevel = normalizedLipSync(level, 1);
  const emotion: ExpressionCue =
    cue?.emotion === "happy" ||
    cue?.emotion === "concerned" ||
    cue?.emotion === "surprised"
      ? cue.emotion
      : "neutral";
  const gesture: MotionCue =
    cue?.gesture === "nod" || cue?.gesture === "greeting"
      ? cue.gesture
      : "idle";
  const status =
    audioLevel > 0 ? "말하는 중" : busy ? "답변 준비 중" : "대화 준비 완료";

  useEffect(() => {
    bridge.detach();
    return () => bridge.detach();
  }, [bridge]);

  return (
    <section
      className="avatar-panel"
      aria-labelledby={`${id}-heading`}
      data-busy={busy}
    >
      <div className="avatar-panel__heading">
        <h2 id={`${id}-heading`}>아바타</h2>
        <span className="avatar-panel__badge">
          {kind === "builtin" ? "기본 아바타" : "Live2D"}
        </span>
      </div>
      <label className="avatar-panel__label" htmlFor={`${id}-kind`}>
        아바타 종류
      </label>
      <select
        className="avatar-panel__select"
        id={`${id}-kind`}
        value={kind}
        onChange={(event) => {
          bridge.detach();
          setKind(event.target.value === "live2d" ? "live2d" : "builtin");
        }}
      >
        <option value="builtin">기본 아바타 (SVG)</option>
        <option value="live2d">Live2D (사용권 필요)</option>
      </select>
      {kind === "builtin" ? (
        <>
          <div className="avatar-panel__stage">
            <BuiltinAvatar
              level={audioLevel}
              emotion={emotion}
              gesture={gesture}
              cue={cue}
            />
          </div>
          <p className="avatar-panel__status" role="status" aria-atomic="true">
            <span className="avatar-panel__status-dot" aria-hidden="true" />
            {status}
          </p>
          <meter
            className="avatar-panel__meter"
            aria-label="음성 레벨"
            min="0"
            max="1"
            value={audioLevel}
          />
          <p className="avatar-panel__note">
            직접 그린 SVG 캐릭터입니다. 음성이 재생되면 입이 움직이고 답변의
            표정과 동작을 표현합니다.
          </p>
        </>
      ) : (
        <div className="avatar-panel__licensed">
          <p className="avatar-panel__note">
            Live2D는 사용권이 확인된 모델 자산과 별도로 설치한 Cubism SDK
            어댑터가 필요합니다. SDK와 모델은 포함되어 있지 않습니다.
          </p>
          <p className="avatar-panel__note">
            클라우드에서도 현재 페이지와 같은 출처의 <code>/avatar-local/</code>{" "}
            경로로 서버가 모델 자산을 제공해야 합니다. 여기서 로컬 경로는
            Gateway 서버 기준입니다.
          </p>
          <AvatarInspector bridge={bridge} />
        </div>
      )}
    </section>
  );
}
