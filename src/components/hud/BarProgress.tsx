import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { formatTime } from "../../app/drinks";
import type { FrameBus } from "./frameBus";
import { t } from "../../i18n";

interface Props {
  bus: FrameBus;
  progress: number;
  duration: number;
  disabled: boolean;
  onSeek: (seconds: number) => void;
}

/**
 * Playback progress drawn as a gilt scale along the front lip of the counter.
 * The path follows the projected bar edge every frame; a hidden range input
 * keeps it keyboard and screen-reader friendly.
 */
export function BarProgress({
  bus,
  progress,
  duration,
  disabled,
  onSeek,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const paths = useRef<SVGPathElement[]>([]);
  const startRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<SVGCircleElement>(null);
  const points = useRef<[number, number][]>([]);
  const lengths = useRef<number[]>([]);
  const lastLip = useRef(-1);
  const [hover, setHover] = useState<number>();
  const [scrubbing, setScrubbing] = useState(false);
  const fraction = duration > 0 ? Math.min(1, progress / duration) : 0;
  const fractionRef = useRef(fraction);
  fractionRef.current = fraction;

  const pointAt = (t: number): [number, number] => {
    const pts = points.current,
      acc = lengths.current;
    if (pts.length < 2) return [0, 0];
    const total = acc[acc.length - 1];
    const target = t * total;
    for (let i = 1; i < pts.length; i++) {
      if (acc[i] >= target) {
        const k = (target - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
        return [
          pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k,
          pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k,
        ];
      }
    }
    return pts[pts.length - 1];
  };

  useEffect(
    () =>
      bus.subscribe((info) => {
        const pts = info.barEdge;
        if (pts.length < 2) return;
        points.current = pts;
        const acc = [0];
        for (let i = 1; i < pts.length; i++)
          acc.push(
            acc[i - 1] +
              Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
          );
        lengths.current = acc;
        const d = `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}`;
        for (const path of paths.current) path?.setAttribute("d", d);
        svgRef.current?.setAttribute(
          "viewBox",
          `0 0 ${info.width} ${info.height}`,
        );
        const [sx, sy] = pts[0];
        const [ex, ey] = pts[pts.length - 1];
        if (startRef.current)
          startRef.current.style.transform = `translate3d(${(sx - 8).toFixed(1)}px, ${(sy - 6).toFixed(1)}px, 0) translate(-100%, -100%)`;
        if (endRef.current)
          endRef.current.style.transform = `translate3d(${(ex + 8).toFixed(1)}px, ${(ey - 6).toFixed(1)}px, 0) translate(0, -100%)`;
        const [hx, hy] = pointAt(fractionRef.current);
        headRef.current?.setAttribute("cx", hx.toFixed(1));
        headRef.current?.setAttribute("cy", hy.toFixed(1));
        const lip = Math.round(pts[Math.floor(pts.length / 2)][1]);
        if (lip !== lastLip.current) {
          lastLip.current = lip;
          document.documentElement.style.setProperty("--lip-y", `${lip}px`);
        }
      }),
    [bus],
  );

  const fractionFromPointer = (event: ReactPointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const pts = points.current,
      acc = lengths.current;
    if (!rect || pts.length < 2) return 0;
    const px = event.clientX - rect.left,
      py = event.clientY - rect.top;
    let best = Infinity,
      bestT = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const dx = bx - ax,
        dy = by - ay;
      const k = Math.max(
        0,
        Math.min(
          1,
          ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
      const d = Math.hypot(px - (ax + dx * k), py - (ay + dy * k));
      if (d < best) {
        best = d;
        bestT = (acc[i - 1] + (acc[i] - acc[i - 1]) * k) / acc[acc.length - 1];
      }
    }
    return bestT;
  };

  const updateMarker = (t: number) => {
    const [x, y] = pointAt(t);
    if (markerRef.current)
      markerRef.current.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    setHover(t);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGPathElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    const t = fractionFromPointer(event);
    updateMarker(t);
    onSeek(t * duration);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGPathElement>) => {
    const t = fractionFromPointer(event);
    updateMarker(t);
    if (scrubbing && !disabled) onSeek(t * duration);
  };

  return (
    <div
      ref={rootRef}
      className={`bar-progress ${disabled ? "is-disabled" : ""} ${hover !== undefined ? "is-hover" : ""}`}
    >
      <svg
        ref={svgRef}
        className="bar-progress-svg"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="lip-gold" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#8a5a22" />
            <stop offset="0.5" stopColor="#ffe0a0" />
            <stop offset="1" stopColor="#c9893b" />
          </linearGradient>
        </defs>
        <path
          ref={(el) => void (paths.current[0] = el!)}
          className="lip-track"
          pathLength={1}
        />
        <path
          ref={(el) => void (paths.current[1] = el!)}
          className="lip-ticks"
          pathLength={1}
        />
        <path
          ref={(el) => void (paths.current[2] = el!)}
          className="lip-major"
          pathLength={1}
        />
        <path
          ref={(el) => void (paths.current[3] = el!)}
          className="lip-fill"
          pathLength={1}
          style={{ strokeDasharray: `${fraction.toFixed(4)} 1` }}
        />
        <path
          ref={(el) => void (paths.current[4] = el!)}
          className="lip-hit"
          pathLength={1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setScrubbing(false)}
          onPointerCancel={() => setScrubbing(false)}
          onPointerLeave={() => !scrubbing && setHover(undefined)}
        />
        <circle ref={headRef} className="lip-head" r={4.5} />
      </svg>
      <span ref={startRef} className="lip-time lip-time-start">
        {formatTime(progress)}
      </span>
      <span ref={endRef} className="lip-time lip-time-end">
        {formatTime(duration)}
      </span>
      <div ref={markerRef} className="lip-marker" aria-hidden="true">
        <span>{hover !== undefined ? formatTime(hover * duration) : ""}</span>
      </div>
      <input
        className="visually-hidden lip-range"
        type="range"
        min={0}
        max={Math.max(1, duration)}
        step={0.1}
        value={Math.min(progress, Math.max(1, duration))}
        disabled={disabled}
        aria-label={t("播放进度")}
        aria-valuetext={`${formatTime(progress)} / ${formatTime(duration)}`}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
    </div>
  );
}
