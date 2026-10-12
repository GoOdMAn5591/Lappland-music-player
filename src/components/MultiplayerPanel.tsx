import {
  Check,
  Copy,
  Crown,
  DoorOpen,
  LoaderCircle,
  LogOut,
  Music2,
  RefreshCw,
  Users,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import type { TavernController } from "../app/useTavernController";
import type { RoomMember, TunnelInfo } from "../multiplayer/room";
import { IntegrationDialog } from "./IntegrationDialog";
import { t } from "../i18n";

function MemberList({ members, meId }: { members: RoomMember[]; meId?: string }) {
  if (!members.length) return null;
  return (
    <ul className="room-members" aria-label={t("在座的人")}>
      {members.map((member) => (
        <li key={member.id} className={member.role === "host" ? "is-host" : ""}>
          {member.role === "host" ? <Crown size={13} /> : <span className="seat-dot" />}
          {member.name}
          {member.id === meId && <small>{t("（你）")}</small>}
        </li>
      ))}
    </ul>
  );
}

function TunnelState({
  tunnel,
  onRetry,
}: {
  tunnel?: TunnelInfo;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!tunnel || tunnel.status === "off" || tunnel.status === "starting")
    return (
      <p className="room-progress">
        <LoaderCircle size={16} className="spin" />
        {t("正在接通外网（Cloudflare 临时隧道，大约 10 秒）……")}
      </p>
    );
  if (tunnel.status === "downloading")
    return (
      <p className="room-progress">
        <LoaderCircle size={16} className="spin" />
        {t("第一次使用：正在下载 Cloudflare 隧道工具（约 20 MB，只需一次）…")}{" "}
        {tunnel.progress ? `${tunnel.progress}%` : ""}
      </p>
    );
  if (tunnel.status !== "ready" || !tunnel.invite)
    return (
      <div className="room-error" role="alert">
        <WifiOff size={18} />
        <div>
          <strong>{t("外网没接通")}</strong>
          <small>{tunnel.error || t("隧道没有启动成功。")}</small>
        </div>
        <button className="cellar-command" onClick={onRetry}>
          <RefreshCw size={15} />
          {t("重试")}
        </button>
      </div>
    );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tunnel.invite!);
    } catch {
      const field = document.querySelector<HTMLInputElement>(".room-invite input");
      field?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="room-invite">
      <label>
        <span>{t("邀请链接 · 发给朋友，用浏览器打开就能入座")}</span>
        <input
          readOnly
          value={tunnel.invite}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={t("邀请链接")}
        />
      </label>
      <button className="commit-note" onClick={copy}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? t("已复制") : t("复制邀请链接")}
      </button>
      <small>{t("链接刚生成时，可能要等十几秒才能打开；每次开房都会换一个新链接。")}</small>
    </div>
  );
}

export function MultiplayerPanel({
  model,
  onClose,
}: {
  model: TavernController;
  onClose: () => void;
}) {
  const { room } = model;
  const [name, setName] = useState(room.defaultName || "");

  if (room.isGuest)
    return (
      <IntegrationDialog title={t("同席")} eyebrow="TOGETHER AT THE BAR" onClose={onClose}>
        <div className="integration-status">
          <Users size={28} />
          <div>
            <strong>
              {room.inRoom ? t("你在 {host} 的酒馆", { host: room.hostName }) : t("还没入座")}
            </strong>
            <small>
              {room.inRoom
                ? room.connection === "open"
                  ? t("和大家听同一首歌 · 谁都可以点歌、暂停、切歌、拖进度")
                  : t("网络断了一下，正在重新连接……")
                : room.message || t("用房主发来的邀请链接入座。")}
            </small>
          </div>
        </div>
        <MemberList members={room.members} meId={room.me?.id} />
        {room.inRoom && (
          <div className="room-actions">
            <button className="cellar-command" onClick={room.leave}>
              <LogOut size={16} />
              {t("离席")}
            </button>
          </div>
        )}
        <p className="integration-note">
          {t("歌是房主的电脑实时传过来的，网速慢时会先缓冲一下再追上大家。音量只影响你自己。")}
        </p>
        {model.tracks.some((track) => track.source === "spotify") && (
          <p className="integration-note">
            <Music2 size={16} />
            <span>
              {t("Spotify 的歌要用你自己的 Spotify 账号听。")}{" "}
              <button className="link-button" onClick={() => model.setSpotifyPanelOpen(true)}>
                {model.spotify.account.status === "ok" ? t("已连接") : t("去登录")}
              </button>
            </span>
          </p>
        )}
      </IntegrationDialog>
    );

  return (
    <IntegrationDialog title={t("同席 · 一起听")} eyebrow="TOGETHER AT THE BAR" onClose={onClose}>
      {room.status === "unavailable" || room.status === "checking" ? (
        <>
          <div className="integration-status">
            <WifiOff size={28} />
            <div>
              <strong>{room.status === "checking" ? t("正在查看……") : t("现在开不了房间")}</strong>
              <small>
                {t("同席需要用「启动酒馆.bat」打开酒馆。现在这个页面是开发模式（npm run dev）。")}
              </small>
            </div>
          </div>
        </>
      ) : room.status === "idle" ? (
        <>
          <div className="integration-status">
            <DoorOpen size={28} />
            <div>
              <strong>{t("开放同席")}</strong>
              <small>{t("你的电脑就是酒馆，朋友不用装任何东西")}</small>
            </div>
          </div>
          <ul className="room-explain">
            <li>{t("点「开放同席」后会生成一个邀请链接，发给朋友，他们在任何地方用浏览器打开就能入座。")}</li>
            <li>{t("你正在放的歌会从这台电脑传给大家，所有人听到的进度是对齐的。")}</li>
            <li>{t("在座的人都能点歌、播放 / 暂停、切歌、拖进度；歌单只能你来改。")}</li>
            <li>
              {t("Spotify 的歌不经过你的电脑：朋友用自己的 Spotify Premium 登录（要先加进你应用的用户名单），酒馆把大家对齐到同一秒。")}
            </li>
            <li>{t("YouTube 视频也不经过你的电脑：朋友什么账号都不用，各自的浏览器里会出现同一块小屏幕。")}</li>
          </ul>
          <form
            className="room-form"
            onSubmit={(event) => {
              event.preventDefault();
              void room.open(name);
            }}
          >
            <label>
              <span>{t("你的称呼")}</span>
              <input
                value={name}
                maxLength={16}
                placeholder={t("房主")}
                onChange={(event) => setName(event.target.value)}
                aria-label={t("你的称呼")}
              />
            </label>
            <button className="commit-note" type="submit">
              <DoorOpen size={16} />
              {t("开放同席")}
            </button>
          </form>
          {room.message && <p className="cellar-message">{room.message}</p>}
        </>
      ) : (
        <>
          <div className="integration-status">
            <Users size={28} />
            <div>
              <strong>{t("同席进行中")}</strong>
              <small>
                {t("{n} 人在座 · 关掉黑色窗口或点「打烊」房间就会关闭", { n: room.members.length })}
              </small>
            </div>
          </div>
          <TunnelState tunnel={room.tunnel} onRetry={room.retryTunnel} />
          <MemberList members={room.members} meId={room.me?.id} />
          <div className="room-actions">
            <button className="cellar-command" onClick={() => void room.close()}>
              <LogOut size={16} />
              {t("打烊（关闭房间）")}
            </button>
          </div>
          <p className="integration-note">
            {t("只有拿到链接的人能进来。链接里带着房间密钥，别发到公开的地方。")}
          </p>
        </>
      )}
    </IntegrationDialog>
  );
}
