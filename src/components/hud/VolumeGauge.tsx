import { useRef, type CSSProperties } from "react";
import { t } from "../../i18n";

/**
 * Volume as the amount of drink in a small rocks glass with a gilt measuring scale.
 * A real range input sits on top for pointer, wheel and keyboard control.
 */
export function VolumeGauge({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (value: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const ticks = 12;
  const level = Math.round(volume * 100);
  return (
    <div
      className="volume-gauge"
      style={{ "--volume": volume } as CSSProperties}
      data-tip={t("酒量 {level}% · 滚轮微调", { level })}
      onWheel={(event) => {
        const next = Math.min(
          1,
          Math.max(0, volume - Math.sign(event.deltaY) * 0.05),
        );
        onChange(Number(next.toFixed(2)));
      }}
    >
      <svg className="volume-glass" viewBox="0 0 24 28" aria-hidden="true">
        <defs>
          <clipPath id="volume-clip">
            <path d="M4.2 3 L19.8 3 L18.6 25 L5.4 25 Z" />
          </clipPath>
        </defs>
        <rect
          className="volume-liquid"
          x="0"
          width="24"
          y={25 - 22 * volume}
          height={22 * volume}
          clipPath="url(#volume-clip)"
        />
        <path
          className="volume-outline"
          d="M3.6 2.5 L20.4 2.5 L19 25.5 L5 25.5 Z"
        />
        <path className="volume-base" d="M5 25.5 L19 25.5" />
      </svg>
      <span className="volume-scale" aria-hidden="true">
        {Array.from({ length: ticks }, (_, i) => (
          <i
            key={i}
            className={
              i / (ticks - 1) <= volume + 0.001 && volume > 0 ? "on" : ""
            }
            style={{ "--i": i } as CSSProperties}
          />
        ))}
      </span>
      <input
        ref={ref}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        aria-label={t("音量")}
        aria-valuetext={`${level}%`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
