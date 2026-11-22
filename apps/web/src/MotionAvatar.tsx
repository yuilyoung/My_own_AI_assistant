import { memo, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { normalizedLipSync } from "./avatar";
import {
  expressionLabels,
  motionLabels,
  type ExpressionCue,
  type MotionCue,
} from "./avatar-motion";
import { avatarNames, type AvatarCharacter } from "./avatar-cast";
import { seorinArt } from "./SeorinArt";
import { hanaArt } from "./HanaArt";
import { isolArt } from "./IsolArt";
import type { Segment } from "./gateway";
import "./seorin-avatar.css";

export type { AvatarCharacter } from "./avatar-cast";
export type MotionAvatarProps = {
  character: AvatarCharacter;
  level: number;
  brightness?: number;
  emotion: ExpressionCue;
  gesture: MotionCue;
  cue?: Pick<Segment, "emotion" | "gesture">;
};

const paint = (id: string, name: string) => "url(#" + id + "-" + name + ")";

const artwork = { seorin: seorinArt, hana: hanaArt, isol: isolArt };
// Eye proportions, ink and the strength of a spoken accent belong to the
// character; lid shapes and gestures describe the current reply.
const portraits = {
  seorin: {
    eyeHeight: 1,
    irisRim: "#66493d",
    irisLight: "#efc77f",
    brow: "#51414a",
    lip: "#a46567",
    cavity: "#743d45",
    mouthWidth: 1,
    speech: 1,
    glance: 1,
  },
  hana: {
    eyeHeight: 1.12,
    irisRim: "#36554d",
    irisLight: "#c9e9ad",
    brow: "#724a47",
    lip: "#b46c65",
    cavity: "#84484a",
    mouthWidth: 1.1,
    speech: 1.22,
    glance: 1.18,
  },
  isol: {
    eyeHeight: 0.88,
    irisRim: "#534462",
    irisLight: "#d5c3f3",
    brow: "#54465c",
    lip: "#976879",
    cavity: "#694453",
    mouthWidth: 0.93,
    speech: 0.8,
    glance: 0.87,
  },
};

// The portrait is drawn in a 360-unit square. Each eye uses a local coordinate
// system from the outer lash to the inner corner so the two lids can blink together.
const eyeDrawing = {
  neutral: {
    opening: "M0 3Q12-6 23-1Q30 1 35 8Q23 15 12 12Q5 10 0 3Z",
    lash: "M-4 0Q0 3 3 1Q20-11 35 8Q18-5 3 6Z",
    brow: "M0-11Q13-19 31-12Q18-15 3-9Z",
    gaze: [0, 0],
    pupil: 3.3,
    glint: 2.45,
    smile: 0.18,
    aperture: 1,
  },
  happy: {
    opening: "M0 5Q11-6 23-1Q30 1 35 7Q24 6 15 8Q5 9 0 5Z",
    lash: "M-4 2Q0 5 3 2Q18-11 35 7Q19-5 3 8Z",
    brow: "M0-12Q14-22 31-15Q18-18 3-10Z",
    gaze: [0, -0.55],
    pupil: 3.6,
    glint: 2.85,
    smile: 0.9,
    aperture: 0.88,
  },
  concerned: {
    opening: "M0 5Q12 0 23-2Q30-2 35 5Q26 14 13 13Q5 11 0 5Z",
    lash: "M-4 3Q0 5 3 3Q14 0 23-3Q31-4 35 5Q29 0 23 0Q11 3 3 7Z",
    brow: "M0-8Q12-10 30-20Q28-14 23-13L4-6Z",
    gaze: [-2.5, 1.25],
    pupil: 3.1,
    glint: 2.1,
    smile: -0.48,
    aperture: 0.84,
  },
  surprised: {
    opening: "M0 3Q13-11 25-5Q33-1 35 8Q24 19 11 15Q3 12 0 3Z",
    lash: "M-4 0Q0 3 2 0Q12-12 25-7Q33-3 35 8Q28-10 14-5Q8-3 2 6Z",
    brow: "M0-17Q15-31 32-21Q18-25 4-15Z",
    gaze: [0.65, -0.85],
    pupil: 2.5,
    glint: 2.7,
    smile: 0,
    aperture: 1.15,
  },
  curious: {
    opening: "M0 4Q13-8 24-3Q32 0 35 7Q26 16 15 14Q5 12 0 4Z",
    lash: "M-4 1Q0 3 3 1Q20-13 35 7Q23-5 12-2Q5 0 2 7Z",
    brow: "M0-12Q10-23 30-17Q24-16 16-17Q8-17 2-10Z",
    gaze: [2.9, -1.05],
    pupil: 3.65,
    glint: 3.05,
    smile: 0.4,
    aperture: 1.04,
  },
  thoughtful: {
    opening: "M0 4Q13-1 22 0Q30 1 35 7Q25 14 13 12Q5 10 0 4Z",
    lash: "M-4 2Q1 4 4 2Q24-5 35 7Q22-1 5 6L1 6Z",
    brow: "M0-10Q13-14 29-16Q25-13 20-13L3-8Z",
    gaze: [-3.1, -1.75],
    pupil: 2.9,
    glint: 1.9,
    smile: -0.17,
    aperture: 0.73,
  },
};

const RaisedHand = memo(function RaisedHand({ id }: { id: string }) {
  return (
    <g data-pose="greeting" strokeLinejoin="round" strokeLinecap="round">
      <path
        d="M286 234L287 224Q280 217 277 207L273 195Q272 190 275 189Q278 188 280 193L284 201L281 179Q280 174 283 173Q286 172 287 177L291 194L290 170Q290 165 293 165Q296 165 296 171L298 192L300 173Q301 168 304 169Q307 169 306 175L305 196L310 184Q312 180 315 182Q317 184 315 189L310 204Q312 213 305 222L303 238Z"
        fill={paint(id, "skin")}
        stroke="#936f68"
        strokeWidth="1.35"
      />
      <path d="M287 224Q295 228 303 218L301 235L287 232Z" fill="#dea899" />
      <path
        d="M282 202Q287 203 291 213M288 219Q291 210 301 206M296 197L298 197M287 197L289 198M302 198L304 198"
        fill="none"
        stroke="#c08f82"
        strokeWidth="1"
      />
      <path
        d="M282.4 176L284 182M292 168L293 175M303 172L302.5 178M313.8 185L312 189"
        fill="none"
        stroke="#ffedda"
        strokeWidth="1.5"
      />
    </g>
  );
});

const PointingHand = memo(function PointingHand({ id }: { id: string }) {
  return (
    <g data-pose="point" strokeLinejoin="round" strokeLinecap="round">
      {/* The forefinger extends from the first knuckle. The other fingers
        overlap the thumb and palm above the same cuff as the waving hand. */}
      <path
        d="M286 234L287 224Q277 216 277 206Q276 200 279 197Q282 194 286 198L287 200L284 176Q283 170 286 169Q289 168 290 174L295 196Q296 191 300 192Q302 192 303 196Q306 193 309 196L310 200Q313 198 315 202Q318 211 311 219L304 226L303 238Z"
        fill={paint(id, "skin")}
        stroke="#946f69"
        strokeWidth="1.4"
      />
      <path
        d="M286 223Q298 229 306 219L302 236L287 232Z"
        fill="#c89183"
        opacity=".64"
      />
      <path
        d="M279 200Q282 198 286 202L293 209Q295 212 292 214Q290 215 287 212L281 208M295 197L297 204Q298 208 301 207Q303 207 303 203L302 197M304 201L305 206Q307 211 310 207L310 202M310 208Q312 210 314 206M292 219Q296 214 301 213"
        fill="none"
        stroke="#b7897c"
        strokeWidth="1.1"
      />
      <path
        d="M286 173L287 180M281 201L284 203"
        fill="none"
        stroke="#ffebd7"
        strokeWidth="1.5"
      />
    </g>
  );
});

const Eye = memo(function Eye({
  id,
  emotion,
  character,
  right,
}: {
  id: string;
  emotion: ExpressionCue;
  character: AvatarCharacter;
  right?: boolean;
}) {
  const { opening, lash, gaze, pupil, glint } = eyeDrawing[emotion];
  const portrait = portraits[character];
  const eyeHeight =
    portrait.eyeHeight * (right && emotion === "curious" ? 1.16 : 1);
  const clipId = id + (right ? "-eye-r" : "-eye-l");
  return (
    <g
      transform={
        right
          ? `translate(213 140) scale(-.93 ${eyeHeight * 0.98})`
          : `translate(115 140) scale(1 ${eyeHeight})`
      }
    >
      <defs>
        <clipPath id={clipId}>
          <path d={opening} />
        </clipPath>
      </defs>
      <path
        d="M1 0Q16-11 31 0"
        fill="none"
        stroke="#bc8d82"
        strokeWidth="1.1"
      />
      <path d={opening} fill="#fff7e8" stroke="#966f65" strokeWidth="1.05" />
      <g clipPath={"url(#" + clipId + ")"}>
        <g
          className="seorin__gaze"
          transform={`translate(${(right ? -gaze[0] : gaze[0]) * portrait.glance} ${gaze[1] * portrait.glance})`}
        >
          <ellipse
            cx="18.4"
            cy="5"
            rx="8.6"
            ry="9.5"
            fill={paint(id, "amber")}
            stroke={portrait.irisRim}
            strokeWidth="1.35"
          />
          <ellipse
            cx="18.4"
            cy="4.6"
            rx={pupil}
            ry={pupil + 1.75}
            fill="#35333e"
          />
          <path
            d="M12.8 9.5Q17 15 22.5 10"
            stroke={portrait.irisLight}
            fill="none"
            strokeWidth="1.25"
          />
          <path
            d="M12.1 7.8l-.8 .3m1.4 1.7-.6 .6m10.8-2 .9 .3m-2.1 2 .7 .4"
            fill="none"
            stroke={portrait.irisLight}
            strokeWidth=".85"
          />
          <circle cx={right ? 21 : 15.7} cy="1.8" r={glint} fill="#fff9ef" />
          <circle
            cx={right ? 14.5 : 22.7}
            cy="8.7"
            r={glint * 0.45}
            fill={portrait.irisLight}
          />
        </g>
      </g>
      <path
        d="M5 10Q11 14 16 13"
        fill="none"
        stroke={portrait.irisRim}
        strokeWidth=".85"
      />
      <path d={lash} fill="#352f37" />
      <path
        d="M4 3Q-1 3-3-1 M7 1Q4 0 3-3"
        fill="none"
        stroke="#40323a"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </g>
  );
});

export function MotionAvatar(props: MotionAvatarProps) {
  // Each character owns its animation listeners and SVG definitions. Audio
  // frames and new semantic cues keep the same mouth and head mounted.
  return <Portrait key={props.character} {...props} />;
}

function Portrait({
  character,
  level,
  brightness = 0.5,
  emotion,
  gesture,
  cue,
}: MotionAvatarProps) {
  const { Inks, Backdrop, Wardrobe, HairBehind, Face, Fringe } =
    artwork[character];
  const portrait = portraits[character];
  const id = useId();
  const head = useRef<SVGGElement>(null);
  const hand = useRef<SVGGElement>(null);
  const gestureRun = useMemo(() => ({ cue, gesture }), [cue, gesture]);
  const [finishedArm, setFinishedArm] = useState<typeof gestureRun | null>(
    null,
  );
  const raised =
    (gesture === "greeting" || gesture === "point") &&
    finishedArm !== gestureRun;
  useLayoutEffect(() => {
    const motion = gestureRun.gesture;
    if (motion === "idle") return;
    const isArm = motion === "greeting" || motion === "point";
    const target = isArm ? hand.current : head.current;
    if (!target) return;
    target.style.animation = "none";
    target.getBoundingClientRect();
    target.style.removeProperty("animation");
    if (!isArm) return;
    const animation = motion === "point" ? "avatar-point" : "seorin-wave";
    const restArm = (event: AnimationEvent) => {
      if (event.target === target && event.animationName === animation)
        setFinishedArm(gestureRun);
    };
    target.addEventListener("animationend", restArm);
    return () => target.removeEventListener("animationend", restArm);
  }, [gestureRun]);

  const amplitude = normalizedLipSync(level, 1);
  const tone = normalizedLipSync(brightness, 1);
  const { aperture, smile } = eyeDrawing[emotion];
  const rx = (10 + amplitude * (12 * tone - 4.5)) * portrait.mouthWidth;
  const ry =
    (emotion === "surprised" ? 3 : 2) + amplitude * aperture * (8.5 - 4 * tone);
  const mouthY = 181;
  const x = 164,
    left = x - rx,
    right = x + rx;
  const cornerY = mouthY - smile * (1.2 + ry * 0.35);
  const farCorner = cornerY - (emotion === "curious" ? 1.8 : 0);
  const upper = mouthY - ry,
    lower = mouthY + ry;
  // Smile corners and the asymmetric upper lip survive even at full volume.
  const contour = `M${left} ${cornerY}
    C${left + rx * 0.22} ${cornerY} ${x - rx * 0.62} ${upper - 0.4} ${x - rx * 0.2} ${upper}
    Q${x} ${upper + 1} ${x + rx * 0.2} ${upper}
    C${x + rx * 0.62} ${upper - 0.4} ${right - rx * 0.18} ${farCorner} ${right} ${farCorner}
    C${right - rx * 0.27} ${lower - 0.4} ${x + rx * 0.32} ${lower} ${x} ${lower}
    Q${left + rx * 0.37} ${lower} ${left} ${cornerY}Z`;
  const restLip = {
    neutral:
      "M154 180Q158 182 163 181Q168 180 174 178.5Q167 183.5 161 183Q157 182.5 154 180Z",
    happy: "M152 178Q165 185 177 176Q169 187 159 183Z",
    concerned: "M154 182Q163 175 173 181Q165 179.5 155 183Z",
    surprised: "M160 179Q165 175 169 180Q169 186 164 187Q159 186 160 179Z",
    curious:
      "M154 181Q161 182 167 180Q171 179 175 176Q171 183 163 183Q157 183 154 181Z",
    thoughtful:
      "M155 181Q163 179 171 180L175 179Q171 182 166 182Q159 181 155 182Z",
  }[emotion];
  return (
    <svg
      className="avatar-panel__svg seorin"
      data-character={character}
      viewBox="0 0 360 360"
      role="img"
      aria-labelledby={id + "-title"}
    >
      <title id={id + "-title"}>
        {`기본 아바타 · ${expressionLabels[emotion]} · ${motionLabels[gesture]} · ${avatarNames[character]}`}
      </title>
      <Inks id={id} />
      <g aria-hidden="true">
        <Backdrop id={id} />
        <g
          className="seorin__character"
          data-testid="avatar-character"
          data-gesture={gesture}
        >
          <Wardrobe id={id} greeting={raised} />
          <g className="avatar-panel__hand" ref={hand}>
            {raised &&
              (gesture === "point" ? (
                <PointingHand id={id} />
              ) : (
                <RaisedHand id={id} />
              ))}
          </g>
          <g className="avatar-panel__head" ref={head}>
            <g
              className="seorin__speech-head"
              style={{
                transform: `translateY(${-1.25 * amplitude * portrait.speech}px) rotate(${-1.05 * amplitude * portrait.speech}deg)`,
              }}
            >
              <HairBehind id={id} />
              <Face id={id} />
              <g data-testid="avatar-features">
                <g
                  className="seorin__speech-brows"
                  fill={portrait.brow}
                  style={{
                    transform: `translateY(${-2.4 * amplitude * portrait.speech}px)`,
                  }}
                >
                  <path
                    transform="translate(116 139)"
                    d={eyeDrawing[emotion].brow}
                  />
                  <path
                    transform={
                      emotion === "curious"
                        ? "translate(213 136) scale(-.93 1)"
                        : "translate(213 139) scale(-.93 1)"
                    }
                    d={eyeDrawing[emotion].brow}
                  />
                </g>
                <g className="seorin__eyes">
                  <Eye id={id} character={character} emotion={emotion} />
                  <Eye id={id} character={character} emotion={emotion} right />
                </g>
                <g className="seorin__lips">
                  <defs>
                    <clipPath id={id + "-mouth"}>
                      <path d={contour} />
                    </clipPath>
                  </defs>
                  <g
                    clipPath={paint(id, "mouth")}
                    opacity={Math.min(1, amplitude * 7)}
                  >
                    <ellipse
                      data-testid="avatar-mouth"
                      cx="164"
                      cy={mouthY}
                      rx={rx}
                      ry={ry}
                      fill={portrait.cavity}
                    />
                    <path
                      d={`M143 ${mouthY - ry}q19 3.7 41-.5v2.4q-20 4.6-41-.1Z`}
                      fill="#fff0da"
                    />
                    <ellipse
                      cx="166"
                      cy={mouthY + ry + 1}
                      rx={rx * 0.76}
                      ry={ry * 0.5}
                      fill="#cf8984"
                    />
                  </g>
                  <path
                    className="seorin__lip-contour"
                    d={contour}
                    fill="none"
                    stroke={portrait.lip}
                    strokeWidth="1.1"
                    opacity={Math.min(1, amplitude * 6)}
                  />
                  <path
                    d={restLip}
                    transform={`translate(164 181) scale(${portrait.mouthWidth} 1) translate(-164 -181)`}
                    fill={portrait.lip}
                    opacity={Math.max(0, 1 - amplitude * 5)}
                  />
                  <path
                    d={`M159 ${mouthY + ry + 2.2}q5 1.6 9-.6`}
                    fill="none"
                    stroke="#ffdfc9"
                    strokeWidth="1.55"
                    strokeLinecap="round"
                  />
                </g>
              </g>
              <Fringe id={id} />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
