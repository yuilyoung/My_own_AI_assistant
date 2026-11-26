type HandImage = {
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const fingerMotion = [
  ["index", -0.55, 0.09],
  ["middle", -0.15, 0.12],
  ["ring", 0.35, 0.16],
  ["little", 0.8, 0.2],
] as const;

export type GreetingHandRig = {
  size: readonly [number, number];
  palm: string;
  wrist: string;
  fingers: Record<
    (typeof fingerMotion)[number][0],
    { joint: readonly [number, number]; paint: string }
  >;
};

type Props = { id: string; image: HandImage; rig: GreetingHandRig };

export function PaintedGreetingHand({ id, image, rig }: Props) {
  const { href, ...bounds } = image;
  const [width, height] = rig.size;
  const paint = id + "-greeting-paint";
  const palm = id + "-greeting-palm";

  return (
    <svg {...bounds} viewBox={`0 0 ${width} ${height}`} overflow="visible">
      <defs>
        <clipPath id={palm}>
          <path d={rig.palm} />
        </clipPath>
        {fingerMotion.map(([name]) => (
          <clipPath key={name} id={`${paint}-${name}`}>
            <path d={rig.fingers[name].paint} />
          </clipPath>
        ))}
      </defs>
      <g clipPath={`url(#${palm})`}>
        <image id={paint} href={href} width={width} height={height} />
      </g>
      {fingerMotion.map(([name, splay, curl]) => {
        const [x, y] = rig.fingers[name].joint;
        return (
          <g
            key={name}
            data-finger={name}
            style={{
              transformOrigin: `${x}px ${y}px`,
              transform: `rotate(calc(var(--finger-splay, 0deg) * ${splay})) scaleY(calc(1 - var(--finger-curl, 0) * ${curl}))`,
            }}
          >
            <use href={`#${paint}`} clipPath={`url(#${paint}-${name})`} />
          </g>
        );
      })}
    </svg>
  );
}

export function PaintedGreetingWrist({ id, image, rig }: Props) {
  const { href, ...bounds } = image;
  const [width, height] = rig.size;
  const wrist = id + "-greeting-wrist";

  // Keep a narrow strip of the original wrist anchored to the cuff so the
  // moving hand remains joined to the forearm even at the ends of the wave.
  return (
    <svg {...bounds} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <clipPath id={wrist}>
          <path d={rig.wrist} />
        </clipPath>
      </defs>
      <image
        href={href}
        width={width}
        height={height}
        clipPath={`url(#${wrist})`}
      />
    </svg>
  );
}
