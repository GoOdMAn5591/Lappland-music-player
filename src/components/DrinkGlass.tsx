import type { TavernTrack } from "../storage";
export function DrinkGlass({
  track,
  current,
}: {
  track: TavernTrack;
  current: boolean;
}) {
  const seconds = Math.floor(track.duration || 0);
  return (
    <>
      {" "}
      <span className="glass-shadow" />
      <span className="glass-coaster" />
      <span className="glass-vessel">
        <span className="liquid-inertia">
          <span className="drink-liquid">
            <i className="bubble bubble-a" />
            <i className="bubble bubble-b" />
            <i className="bubble bubble-c" />
          </span>
        </span>
        <span className="glass-rim" />
        <span className="glass-highlight" />
      </span>
      <span className="glass-stem" />
      <span className="glass-base" />
      <span className="glass-caption">{track.alias || track.title}</span>
      <span className="glass-tooltip">
        <strong>{track.alias || track.title}</strong>
        <small>
          {track.artist} · {Math.floor(seconds / 60)}:
          {String(seconds % 60).padStart(2, "0")}
        </small>
        {current && <small>{track.tags.join(" · ")}</small>}
      </span>
    </>
  );
}
