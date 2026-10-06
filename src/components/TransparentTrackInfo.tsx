import { AlertTriangle } from "lucide-react";

import type { TavernController } from "../app/useTavernController";
export function TransparentTrackInfo({ model }: { model: TavernController }) {
  const { currentTrack, currentTitle, currentArtist } = model;
  return (
    <div className="bill-card" aria-live="polite">
      <p className="eyebrow">CURRENT POUR</p>
      <h2>{currentTitle}</h2>
      <p>{currentArtist}</p>
      <div className="tag-row">
        {(currentTrack?.tags ?? ["等待点单"]).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        {currentTrack?.status === "missing" && (
          <span className="warning-tag">需重新导入</span>
        )}
        {currentTrack?.status === "ready" && !currentTrack.stored && (
          <span className="session-only">仅本次可播</span>
        )}
      </div>
      {currentTrack?.status === "missing" && (
        <span className="missing-badge">
          <AlertTriangle size={14} />
          本地音频未接回
        </span>
      )}
    </div>
  );
}
