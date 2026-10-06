import { DrinkGlass } from "./DrinkGlass";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { TavernTrack } from "../storage";
import { cupPosition, getBarGeometry } from "../scene/barGeometry";

interface Props {
  ids: string[];
  tracks: Map<string, TavernTrack>;
  currentId?: string;
  direction: "next" | "prev" | "pick";
  dropTargetId?: string;
  getStyle: (track: TavernTrack) => { className: string; style: CSSProperties };
  onPlay: (id: string, direction?: "next" | "prev" | "pick") => void;
  onDrag: (id?: string) => void;
  onTarget: (id?: string) => void;
  onReorder: (id: string) => void;
  onAttention: () => void;
}

export function DrinkCarousel({
  ids,
  tracks,
  currentId,
  direction,
  dropTargetId,
  getStyle,
  onPlay,
  onDrag,
  onTarget,
  onReorder,
  onAttention,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const index = Math.max(0, ids.indexOf(currentId ?? ""));
  const signature = ids.join("|");
  const previous = useRef({ signature, index, cursor: index });
  const [cursor, setCursor] = useState(index);
  const renderedCursor = useRef(index);
  const motion = useRef({ from: index, to: index, started: 0 });
  useLayoutEffect(() => {
    const last = previous.current;
    let next = index;
    if (last.signature === signature) {
      let delta = index - last.index;
      if (direction === "next" && delta < 0) delta += ids.length;
      if (direction === "prev" && delta > 0) delta -= ids.length;
      next = last.cursor + delta;
    }
    if (
      last.index !== index &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const tilt = (next > last.cursor ? 1 : -1) * 9;
      host.current?.querySelectorAll(".liquid-inertia").forEach((liquid) => {
        liquid.animate(
          [
            { transform: `rotate(${-tilt}deg) translateX(${-tilt / 2}px)` },
            { transform: `rotate(${tilt * 0.65}deg)` },
            { transform: `rotate(${-tilt * 0.3}deg)` },
            { transform: "rotate(0deg)" },
          ],
          { duration: 950, easing: "ease-out" },
        );
      });
    }
    const reset = last.signature !== signature;
    motion.current = {
      from: reset ? next : renderedCursor.current,
      to: next,
      started: performance.now(),
    };
    if (reset) renderedCursor.current = next;
    previous.current = { signature, index, cursor: next };
    setCursor(next);
  }, [signature, index, ids.length, direction]);

  const count = Math.min(ids.length, 7);
  const left = Math.floor((count - 1) / 2);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    let bounds = element.getBoundingClientRect();
    let frame = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const draw = (now: number) => {
      const movement = motion.current;
      const progress = reduced.matches
        ? 1
        : Math.min(1, (now - movement.started) / 900);
      const eased = progress * progress * (3 - 2 * progress);
      const orbit = movement.from + (movement.to - movement.from) * eased;
      renderedCursor.current = orbit;
      const bar = getBarGeometry(bounds.width, bounds.height);
      element
        .querySelectorAll<HTMLButtonElement>(".bar-glass")
        .forEach((glass) => {
          const position = Number(glass.dataset.orbitSlot) - orbit;
          const p = cupPosition(bar, position);
          glass.style.setProperty("--arc-x", `${p.x}px`);
          glass.style.setProperty("--arc-y", `${p.y}px`);
          glass.style.setProperty("--glass-scale", String(p.scale));
          glass.style.setProperty(
            "--glass-rotate",
            `${-Math.sin(p.angle) * 4}deg`,
          );
          glass.style.setProperty("--glass-dim", String(p.opacity));
          glass.style.setProperty("--glass-blur", `${p.blur}px`);
          glass.style.setProperty(
            "--glass-z",
            String(30 - Math.round(Math.abs(position) * 4)),
          );
          glass.dataset.arcX = p.x.toFixed(2);
          glass.dataset.arcY = p.y.toFixed(2);
          glass.dataset.arcAngle = p.angle.toFixed(4);
        });
      element.dataset.moving = String(
        progress < 1 && movement.from !== movement.to,
      );
      if (progress < 1 && movement.from !== movement.to)
        frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(() => {
      bounds = element.getBoundingClientRect();
      cancelAnimationFrame(frame);
      draw(performance.now());
    });
    observer.observe(element);
    draw(performance.now());
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [cursor, signature, count]);
  // Unbounded slot keys retain the same DOM glass across playlist boundaries.
  const slots = Array.from({ length: count }, (_, i) => cursor + i - left);
  return (
    <div className="glass-orbit" ref={host}>
      {slots.map((slot) => {
        const id = ids[((slot % ids.length) + ids.length) % ids.length];
        const track = tracks.get(id);
        if (!track) return null;
        const position = slot - cursor;
        const current = position === 0;
        const drink = getStyle(track);

        return (
          <button
            key={`${signature}:${slot}`}
            className={`bar-glass ${drink.className} ${current ? "is-current" : ""} ${dropTargetId === id ? "is-drop-target" : ""}`}
            style={
              {
                ...drink.style,
                "--slot": position,
              } as CSSProperties
            }
            data-slot={position}
            data-orbit-slot={slot}
            data-track-id={id}
            aria-label={`播放 ${track.alias || track.title}`}
            aria-current={current ? "true" : undefined}
            draggable
            onPointerEnter={onAttention}
            onPointerDown={onAttention}
            onFocus={onAttention}
            onClick={() =>
              onPlay(id, position < 0 ? "prev" : position > 0 ? "next" : "pick")
            }
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.setData("text/plain", id);
              onDrag(id);
            }}
            onDragEnd={() => {
              onDrag(undefined);
              onTarget(undefined);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onTarget(id);
            }}
            onDragLeave={() => onTarget(undefined)}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onReorder(id);
            }}
          >
            <DrinkGlass track={track} current={current} />
          </button>
        );
      })}
    </div>
  );
}
