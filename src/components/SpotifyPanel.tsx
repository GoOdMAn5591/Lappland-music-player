import { ExternalLink, Music2, ShieldCheck } from "lucide-react";
import { features, spotifyConfig } from "../config";
import { IntegrationDialog } from "./IntegrationDialog";

export function SpotifyPanel({ onClose }: { onClose: () => void }) {
  const configured = Boolean(
    spotifyConfig.clientId && spotifyConfig.redirectUri,
  );
  return (
    <IntegrationDialog
      title="Spotify 酒单"
      eyebrow="EXPERIMENTAL / NOT CONNECTED"
      onClose={onClose}
    >
      <div className="integration-status">
        <Music2 size={28} />
        <div>
          <strong>未连接 Spotify</strong>
          <small>
            {!features.spotify
              ? "功能开关已关闭"
              : !configured
                ? "缺少应用配置"
                : "实验配置就绪，播放适配器未接通"}
          </small>
        </div>
      </div>
      <dl className="integration-facts">
        <div>
          <dt>授权方式</dt>
          <dd>PKCE · 无 Client Secret</dd>
        </div>
        <div>
          <dt>网页完整播放</dt>
          <dd>需 Premium 与应用访问权限</dd>
        </div>
        <div>
          <dt>音频保存</dt>
          <dd>不下载、不转播</dd>
        </div>
      </dl>
      <p className="integration-note">
        <ShieldCheck size={17} />
        当前版本仅包含授权辅助函数、曲目接口和播放适配器契约，尚未提供登录、歌单读取或
        SDK 播放。
      </p>
      <a
        className="cellar-command"
        href="https://developer.spotify.com/dashboard"
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink size={16} />
        Spotify Developer Dashboard
      </a>
    </IntegrationDialog>
  );
}
