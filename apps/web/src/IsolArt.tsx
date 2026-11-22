import { memo } from "react";

type ArtProps = { id: string };
const ink = (id: string, color: string) => `url(#${id}-${color})`;

const Inks = memo(function IsolInks({ id }: ArtProps) {
  return (
    <defs>
      <radialGradient id={id + "-sky"} cx="74%" cy="25%" r="90%">
        <stop stopColor="#535478" />
        <stop offset=".44" stopColor="#2e395a" />
        <stop offset="1" stopColor="#121d34" />
      </radialGradient>
      <linearGradient id={id + "-hair"} x2="82%" y2="92%">
        <stop stopColor="#ece7fc" />
        <stop offset=".28" stopColor="#d2c9e6" />
        <stop offset=".57" stopColor="#b9aecf" />
        <stop offset=".85" stopColor="#9589ac" />
        <stop offset="1" stopColor="#736a8e" />
      </linearGradient>
      <linearGradient id={id + "-underhair"} x2="90%" y2="70%">
        <stop stopColor="#b0a6c6" />
        <stop offset=".52" stopColor="#8d809e" />
        <stop offset="1" stopColor="#635c7e" />
      </linearGradient>
      <linearGradient id={id + "-skin"} x2="84%" y2="100%">
        <stop stopColor="#ffebdf" />
        <stop offset=".58" stopColor="#f8dbd1" />
        <stop offset="1" stopColor="#e6b9b5" />
      </linearGradient>
      <linearGradient id={id + "-uniform"} x1="10%" x2="87%" y2="92%">
        <stop stopColor="#4a4e6b" />
        <stop offset=".32" stopColor="#30394f" />
        <stop offset=".82" stopColor="#222c42" />
        <stop offset="1" stopColor="#192638" />
      </linearGradient>
      <linearGradient id={id + "-silver"} x2="90%" y2="60%">
        <stop stopColor="#b39991" />
        <stop offset=".28" stopColor="#ffe6c2" />
        <stop offset=".58" stopColor="#eac9a9" />
        <stop offset="1" stopColor="#b8a3bc" />
      </linearGradient>
      <linearGradient id={id + "-amber"} x1="0" x2=".15" y1="0" y2="1">
        <stop stopColor="#3e305d" />
        <stop offset=".42" stopColor="#785d9c" />
        <stop offset=".77" stopColor="#ad8acb" />
        <stop offset="1" stopColor="#dbc5ef" />
      </linearGradient>
      <radialGradient id={id + "-blush"}>
        <stop stopColor="#e8aaa9" stopOpacity=".66" />
        <stop offset="1" stopColor="#e8aaa9" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
});

const Backdrop = memo(function IsolBackdrop({ id }: ArtProps) {
  return (
    <g>
      <rect width="360" height="360" fill={ink(id, "sky")} />
      <path
        d="M-12 262Q23 239 67 237Q100 228 136 242L201 225L246 236Q299 221 373 230V360H-12Z"
        fill="#202e49"
      />
      <path
        d="M-11 259Q31 244 62 249L117 241L176 250L250 241L307 249L373 240V360H-11Z"
        fill="#19263c"
      />
      {/* The brass equatorial grid looks outward from inside the observatory. */}
      <g fill="none" stroke="#d7c3b7" opacity=".41" strokeWidth=".7">
        <path d="M-11 219A242 242 0 0 1 303-8M-12 233A252 252 0 0 1 323-9" />
        <ellipse
          cx="219"
          cy="102"
          rx="196"
          ry="78"
          transform="rotate(-29 219 102)"
        />
        <ellipse
          cx="207"
          cy="87"
          rx="166"
          ry="102"
          transform="rotate(28 207 87)"
          strokeDasharray="1 4"
        />
        <path d="M17 123l7 2m12-42 6 4m38-44 4 5m173-42-1 5m59 50 5 2m19 74 7 1" />
      </g>
      <path
        d="M250 43l20-15 19 10 28-21m-28 21 11 19 21 3M12 172l17-15 21 1"
        fill="none"
        stroke="#c4bdd6"
        strokeWidth=".7"
        opacity=".58"
      />
      <g fill="#f2e1c4">
        <path d="M269 23l.9 3.6L274 28l-4.1 1.2L269 33l-1.2-3.8L264 28l3.8-1.4Z M57 69l.9 2.8L61 73l-3.1.9L57 77l-1-3.1L53 73l3-1.2Z" />
        {[
          [20, 43],
          [34, 110],
          [13, 172],
          [29, 157],
          [50, 158],
          [35, 24],
          [67, 39],
          [79, 15],
          [254, 43],
          [289, 38],
          [317, 17],
          [300, 57],
          [321, 60],
          [323, 95],
          [262, 118],
          [277, 87],
          [306, 124],
          [336, 158],
          [322, 196],
          [59, 207],
        ].map(([cx, cy], index) => (
          <circle
            key={cx + ":" + cy}
            cx={cx}
            cy={cy}
            r={index % 3 === 0 ? 1.35 : 0.88}
          />
        ))}
      </g>
      <path d="M341-2h9v227l-7 5zM0 249l360-38v7L0 259z" fill="#1b243a" />
      <path
        d="M341 0v219M0 247l360-38"
        fill="none"
        stroke="#8490a8"
        strokeWidth="1.2"
        opacity=".64"
      />
    </g>
  );
});

const Wardrobe = memo(function IsolWardrobe({
  id,
  greeting,
}: ArtProps & { greeting: boolean }) {
  const uniform = ink(id, "uniform");
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M138 192q14 12 37 11l15-10 3 21 13 12-21 25-41-3-19-18 14-19Z"
        fill={ink(id, "skin")}
        stroke="#977f91"
        strokeWidth="1.35"
      />
      <path
        d="M138 201q17 15 36 12l17-15-1 10q-11 13-24 16l-27-9Z"
        fill="#cca4ad"
      />
      <path
        d="M138 216l25 13 30-17 24 14 38 14q14 6 20 22l19 99H24l20-79q6-26 22-35l41-15Z"
        fill={uniform}
        stroke="#202537"
        strokeWidth="2"
      />
      {/* A high band collar and swept front fastening give the coat its formal cut. */}
      <path
        d="M134 207q13 8 28 10l3 14q15-7 28-25l7 18-28 24-19-9-19-14Z"
        fill="#50536e"
        stroke="#262e45"
        strokeWidth="1.4"
      />
      <path
        d="M136 210q12 8 25 9l3 13m5-2q15-9 23-20"
        fill="none"
        stroke="#e3c8b0"
        strokeWidth="1.45"
      />
      <path d="M198 223l16 8-37 33-17 96h-9l15-99Z" fill="#1d273d" />
      <path
        d="M203 227l-33 35-17 98M133 231l16 24-11 105"
        fill="none"
        stroke="#818097"
        strokeWidth="1.05"
      />
      <path
        d="M173 257l-4 8-2-8 4-5ZM162 291l-3 6-2-6 4-5ZM156 323l-3 6-2-6 4-5Z"
        fill={ink(id, "silver")}
      />
      <path
        d="M71 246q-19 25-17 56l-12 59H25l18-77q8-29 28-38Zm34 29q3 50-4 85H64q25-36 23-68ZM229 252q-7 17-9 41l-10 67h36l13-76Z"
        fill="#1c293f"
      />
      <path
        d="M55 277q-4 23-3 46m16-1-14 19m151-52 27-6"
        fill="none"
        stroke="#61647d"
        strokeWidth="1.15"
      />
      <path
        d="M197 277l33-7 1 4-34 7Z"
        fill="#606781"
        stroke="#252c41"
        strokeWidth=".8"
      />
      <g transform="translate(211 260)" fill="none" stroke="#dbc5b0">
        <circle r="5.7" strokeWidth=".9" />
        <ellipse rx="9" ry="2.5" transform="rotate(-32)" strokeWidth=".9" />
        <circle r="1.4" fill="#efce97" stroke="none" />
      </g>
      {greeting ? (
        <g>
          <path
            d="M244 239q18 0 26 17l9 21 2-27 5-18 21 5-3 30-7 36q-5 24-19 27-16 0-27-20l-17-41q-8-22 10-30Z"
            fill={uniform}
            stroke="#22293d"
            strokeWidth="1.8"
          />
          <path
            d="M242 246q14 0 22 18l10 25 3 25-13-10-14-30Z"
            fill="#444961"
          />
          <path
            d="M258 303q12 8 20 19m3-24q2-11 12-22"
            fill="none"
            stroke="#62647c"
          />
          <path
            d="M283 244l3-14 22 6-3 15Z"
            fill="#65667e"
            stroke="#272d44"
            strokeWidth="1.3"
          />
          <path
            d="M285 234l21 6m-23 4 21 6"
            fill="none"
            stroke="#e1c6a8"
            strokeWidth="1.35"
          />
        </g>
      ) : (
        <g>
          <path
            d="M243 237q19 2 28 20 10 19 17 53l13 51h-40l-22-66q-11-41 4-58Z"
            fill={uniform}
            stroke="#22293d"
            strokeWidth="1.6"
          />
          <path
            d="M245 244q15 7 22 27l8 32-12-17q-5-26-18-42Z"
            fill="#51546c"
          />
          <path
            d="M243 278q9 25 24 40m6 8 14 9m-19 9 14 5"
            fill="none"
            stroke="#61637b"
          />
        </g>
      )}
      <path
        d="M74 244q13-6 27-9m118-5 26 9"
        fill="none"
        stroke="#c5b4ac"
        strokeWidth="1.15"
      />
    </g>
  );
});

const HairBehind = memo(function IsolHairBehind({ id }: ArtProps) {
  const hair = ink(id, "hair");
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path
        d="M118 208q-20 12-38 7 10-12 4-30-12-25-10-52-10-41 7-74 19-34 58-41 23-9 52-1 34 2 51 31 18 31 7 78-9 34-3 60 1 22-13 40 3-16-4-26-5 18-14 23 5-16-6-28l-24-7-22-4Z"
        fill={ink(id, "underhair")}
        stroke="#5a536c"
        strokeWidth="1.9"
      />
      <path
        d="M234 101q-17 50-9 82 4 18-2 32 20-22 15-49-6-27-4-65Zm-142 32q-13 31 3 56l2 17q16-19 3-39Z"
        fill="#746a89"
      />
      {/* Interleaving locks taper toward the ribbon on her left shoulder. */}
      <path
        d="M93 174q17-5 29 12 10 16-3 30 4 17-10 28 0 19-14 29-3 18-16 27-3 13-14 18l-11-5q-7-14-1-28-5-18 4-32-4-19 10-34-2-21 13-32Z"
        fill={ink(id, "underhair")}
        stroke="#59536e"
        strokeWidth="1.8"
      />
      <g className="isol__braid" fill={hair} stroke="#89809e" strokeWidth=".95">
        <path d="M103 174q-19 4-25 23 3 12 11 21 0-15 13-25 10-8 12-14Z" />
        <path d="M114 180q15 16 6 31-4 9-19 17 3-15-10-22 20-10 23-26Z" />
        <path d="M83 201q-18 12-13 31 4 12 11 20-2-12 9-23l12-8q-13-6-19-20Z" />
        <path d="M114 215q5 18-10 31-7 6-17 9l-5-15q18-15 32-25Z" />
        <path d="M71 230q-16 13-11 30 4 11 11 18-1-11 12-19l10-8q-13-7-22-21Z" />
        <path d="M103 244q1 17-11 28-8 7-17 8l-5-13q12-9 33-23Z" />
        <path d="M60 260q-10 12-5 27 2 8 9 16-1-10 9-16l8-9q-13-6-21-18Z" />
        <path d="M90 270q-1 15-12 25-5 5-12 7l-4-10q11-10 28-22Z" />
        <path d="M56 286q-6 14 2 26l8 5q-2-8 9-17-12-4-19-14Z" />
      </g>
      <path
        d="M59 313q-2 11-10 18-10 11-8 23 3-6 8-9l-1 9q22-11 22-30l-4-10Z"
        fill={hair}
        stroke="#655c79"
        strokeWidth="1.1"
      />
      <path d="M53 311l15 5-2 6-15-5Z" fill="#555873" stroke="#3b4059" />
      <path
        d="M53 312l14 5m-16-2 15 5"
        fill="none"
        stroke="#e6c7a7"
        strokeWidth="1.45"
      />
      <path
        d="M98 183q-11 7-13 19m29-9q-1 8-8 14m-30 14q-5 9-3 15m33-6-11 11m-28 6q-3 5-2 12m31-6-12 13m-23 8 1 10m12 8-7 6m-5 30-12 17"
        fill="none"
        stroke="#f8edf7"
        strokeWidth="1.6"
        opacity=".86"
      />
    </g>
  );
});

const Face = memo(function IsolFace({ id }: ArtProps) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M102 124q-1-35 32-55 41-22 73 2 20 15 20 44l-4 31q-4 28-19 48-12 16-32 25-5 2-11-1-21-9-38-27-15-16-22-36-11-2-12-15-1-11 13-16Z"
        fill={ink(id, "skin")}
        stroke="#937885"
        strokeWidth="1.5"
      />
      <path
        d="M103 124q17-28 36-31 17-3 39-23 8 24 39 43l5 15 4-16q-4-37-37-48-36-9-65 11-23 18-25 46Z"
        fill="#e8c1bd"
      />
      <path
        d="M100 133q-7-2-7 7 2 7 7 9m2-13-5 3q3 0 5 5"
        fill="none"
        stroke="#b58b95"
        strokeWidth="1.1"
      />
      <path
        d="M110 164q8 23 28 38-21-13-31-35Zm109-8q-5 22-24 42-11 11-25 18 16-2 34-23 12-15 15-37Z"
        fill="#dcafb1"
        opacity=".75"
      />
      <ellipse cx="125" cy="162" rx="15" ry="7" fill={ink(id, "blush")} />
      <ellipse cx="201" cy="161" rx="13" ry="6" fill={ink(id, "blush")} />
      <path d="M161 145q-1 9-5 16-1 3 4 4l4-1-5-2Z" fill="#dab1ad" />
      <path
        d="M158 164q2 2 4 1m6-1 1-1"
        fill="none"
        stroke="#b48689"
        strokeWidth=".95"
      />
      <path
        d="M160 152l1-3m-4 12 2 1m2 41q4 2 8 0"
        fill="none"
        stroke="#ffebe1"
        strokeWidth="1.5"
      />
      <circle cx="193.5" cy="154.7" r=".9" fill="#886978" />
      <path
        d="M98 153q0 8-2 13m0 0 2 5-2 5-2-5Z"
        fill={ink(id, "silver")}
        stroke="#aa9ca2"
        strokeWidth="1"
      />
    </g>
  );
});

const Fringe = memo(function IsolFringe({ id }: ArtProps) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M86 179q5-22-1-39-14-28-9-57 7-42 41-59 17-8 36-10 33-8 59 8 25 13 33 38 11 32-1 59-10 21-9 39 0 19 7 33-11-6-16-21 1 17 6 27-14-13-16-33-2-26 7-50-11-10-22-16-14-9-25-23-16 24-46 36-20 7-25 22-3 13 0 29l5 26q-11-9-15-27 0 17-9 31Z"
        fill={ink(id, "hair")}
        stroke="#655d79"
        strokeWidth="1.65"
      />
      <path
        d="M84 89q5-38 35-55 24-13 49-13-31 8-49 28-17 15-25 39l3-18Z"
        fill="#ece4f5"
      />
      <path
        d="M100 91q13-40 48-58-10 9-16 21l8-6q-19 17-26 34l2-12Zm42-38q15-20 36-25-12 7-19 17l4-2-9 10 1-7Z"
        fill="#f8f0fc"
        opacity=".86"
      />
      <path
        d="M88 96q-3 28 5 45l1 24-5-21q-9-21-4-43Zm24 17q43-13 62-52-5 25-27 43-22 15-33 23-12 12-12 25-3-24 10-39Z"
        fill="#a196b6"
      />
      <path
        d="M178 49q4 20 21 35l21 16 8 14q1-21-20-36-17-12-30-29Z"
        fill="#8e859f"
        opacity=".76"
      />
      <path
        d="M185 27q23 2 39 22 10 10 12 28-6-18-18-27l6 9q-15-16-31-20Z"
        fill="#ede4f3"
      />
      <path d="M231 106q9 14 3 33-8 19-3 35-10-15-4-37Z" fill="#9c90b1" />
      <g fill="none" stroke="#8d829e" strokeWidth="1.05">
        <path d="M79 102q3-44 35-68m-21 62q10-45 48-65m-33 72q18-32 48-52m-35 54q32-16 48-42m9-34q-10 9-12 18m15-16q14 7 25 21m-23-10q12 26 30 35m10-3q14 14 13 28m-13 24q-6 23 0 36m-126-21q-6 18-1 26" />
      </g>
      <path
        d="M82 83q7-35 38-53m-19 40q14-25 37-37m53-8q18 4 31 19m-14 15 11 12m11 42q2 12-3 23"
        fill="none"
        stroke="#fff4ff"
        strokeWidth="1.25"
        opacity=".88"
      />
      {/* The crescent curves around a pinned star at her temple. */}
      <g transform="translate(221 86) rotate(-23)">
        <path
          d="M-10 4l21-4q3 1 1 3l-21 5Z"
          fill={ink(id, "silver")}
          stroke="#736c83"
          strokeWidth="1.1"
        />
        <path
          d="M1-11q-8 7-2 14 4 4 12 1-5 8-13 4-8-3-7-11 1-6 10-8Z"
          fill={ink(id, "silver")}
          stroke="#807385"
          strokeWidth="1"
        />
        <path
          d="M5-8l1.2 3.6L10-3 6.2-2 5 2 3.8-2 0-3l3.8-1.4Z"
          fill="#ffe5b2"
        />
      </g>
    </g>
  );
});

export const isolArt = { Inks, Backdrop, Wardrobe, HairBehind, Face, Fringe };
