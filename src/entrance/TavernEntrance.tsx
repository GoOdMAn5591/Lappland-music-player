import { DoorOpen, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DoorScene } from "./DoorScene";
import { t } from "../i18n";

export type EntrancePhase = "closed" | "opening" | "entered";
const PREFERENCE = "tavern-skip-entrance";
export function skipEntrancePreference() {
  try {
    return localStorage.getItem(PREFERENCE) === "true";
  } catch {
    return false;
  }
}
export function rememberEntrance(skip: boolean) {
  try {
    localStorage.setItem(PREFERENCE, String(skip));
  } catch {
    /* This session still works. */
  }
}

export function ringDoorbell(context?: AudioContext) {
  if (!context) return;
  const now = context.currentTime;
  [1046.5, 1582, 2177, 3260].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.045 / (index + 1), now + 0.006);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 1.3 - index * 0.14,
    );
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 1.4);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  });
}

export function TavernEntrance({
  phase,
  ready,
  onOpen,
  onEnter,
}: {
  phase: EntrancePhase;
  ready: boolean;
  onOpen: () => void;
  onEnter: () => void;
}) {
  const [remember, setRemember] = useState(skipEntrancePreference);
  const host = useRef<HTMLDivElement>(null);
  const enter = useRef<HTMLButtonElement>(null);
  const opening = phase === "opening";
  const begin = () => {
    if (!ready || opening) return;
    rememberEntrance(remember);
    onOpen();
  };
  const skip = () => {
    rememberEntrance(true);
    onEnter();
  };
  useEffect(() => {
    enter.current?.focus();
  }, [ready]);
  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(
      onEnter,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 180 : 3200,
    );
    return () => clearTimeout(timer);
  }, [opening, onEnter]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        ["Shift", "Control", "Alt", "Meta"].includes(event.key)
      )
        return;
      if (event.key === "Tab") {
        const items = Array.from(
          host.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled)",
          ) ?? [],
        );
        const index = items.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        items[
          (index + (event.shiftKey ? -1 : 1) + items.length) % items.length
        ]?.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        skip();
        return;
      }
      if (
        (event.target as HTMLElement).closest("button,input") &&
        ["Enter", " "].includes(event.key)
      )
        return;
      event.preventDefault();
      begin();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <div
      ref={host}
      role="dialog"
      aria-modal="true"
      aria-labelledby="entrance-title"
      className={`tavern-entrance ${opening ? "is-opening" : ""}`}
      data-phase={phase}
    >
      <DoorScene opening={opening} />
      <div className="entrance-spill" aria-hidden="true" />
      <header className="door-inscription">
        <span>NOCTURNE · EST. 00:00</span>
        <h1 id="entrance-title">{t("无序酒馆")}</h1>
        <p>LAPPLAND / AFTER HOURS</p>
      </header>
      <div className="entrance-actions">
        <button
          ref={enter}
          className="enter-tavern"
          onClick={begin}
          disabled={!ready || opening}
        >
          <DoorOpen size={19} />
          <span>
            {!ready ? t("酒窖苏醒中") : opening ? t("欢迎光临") : t("进入酒馆")}
          </span>
        </button>
        <label className="remember-entrance">
          <input
            type="checkbox"
            checked={remember}
            disabled={opening}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>{t("下次直接进入")}</span>
        </label>
      </div>
      <button className="skip-entrance" onClick={skip}>
        <SkipForward size={15} />
        {t("跳过入场动画")}
      </button>
      <span className="entrance-edition" aria-hidden="true">
        THE PRIVATE CELLAR / I
      </span>
    </div>
  );
}
