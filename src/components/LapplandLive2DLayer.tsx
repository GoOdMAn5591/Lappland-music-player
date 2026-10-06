import { ImagePlus } from "lucide-react";
import { CharacterPortrait, ModelLayer } from "../character/CharacterPortrait";

import type { TavernController } from "../app/useTavernController";
export function LapplandLive2DLayer({ model }: { model: TavernController }) {
  const {
    currentTrackId,
    isPlaying,
    setStatusLine,
    attentionRef,
    modelFiles,
    portrait,
    pointerRef,
    portraitInputRef,
  } = model;
  return (
    <div
      className={`bartender-layer ${portrait.url ? "has-portrait" : ""}`}
      aria-label="拉普兰德角色层"
    >
      {portrait.url && portrait.asset ? (
        <div className="portrait-space">
          <CharacterPortrait
            url={portrait.url}
            rig={portrait.asset.rig}
            pointer={pointerRef}
            onStatus={setStatusLine}
            playing={isPlaying}
            trackId={currentTrackId}
            attention={attentionRef}
          />
          {modelFiles.length > 0 && (
            <ModelLayer
              files={modelFiles}
              pointer={pointerRef}
              onStatus={setStatusLine}
            />
          )}
        </div>
      ) : (
        <button
          className="portrait-empty"
          onClick={() => portraitInputRef.current?.click()}
        >
          <ImagePlus size={24} />
          <span>载入拉普兰德图片</span>
        </button>
      )}
    </div>
  );
}
