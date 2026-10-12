import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Heart,
  KeyRound,
  Link2,
  LoaderCircle,
  LogIn,
  LogOut,
  Music2,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { TavernController } from "../app/useTavernController";
import {
  fetchMyPlaylists,
  fetchPlaylistInfo,
  LIKED_LINK,
  parsePlaylistId,
  SpotifyApiError,
  type SpotifyPlaylistInfo,
} from "../integrations/spotify/api";
import { redirectUri, SpotifyAuthError } from "../integrations/spotify/auth";
import { spotifyProblemText, type SpotifySession } from "../integrations/spotify/session";
import { IntegrationDialog } from "./IntegrationDialog";
import { t } from "../i18n";

const DASHBOARD = "https://developer.spotify.com/dashboard";

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="spotify-copy">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="ghost-icon"
        aria-label={t("复制")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            /* the field is selectable */
          }
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </span>
  );
}

function authErrorText(error: unknown) {
  if (error instanceof SpotifyAuthError) {
    if (error.code === "declined") return t("你在 Spotify 页面上取消了授权。");
    if (error.code === "expired") return t("这次登录等太久过期了，再点一次「登录 Spotify」。");
    if (error.code === "mismatch")
      return t("这个网址不是刚才那次登录的：再点一次「登录 Spotify」，复制新跳出来的网址。");
    if (error.code === "network") return t("连不上 Spotify，检查一下网络。");
    if (error.code === "no-client") return t("还没有 Spotify 应用的 Client ID。");
  }
  return t("授权没有完成（{why}）。再试一次。", { why: (error as Error)?.message ?? "" });
}

/** Sign in from a page Spotify can't send the browser back to: paste the address. */
function PasteSignIn({ spotify }: { spotify: SpotifySession }) {
  const [opened, setOpened] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const finish = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await spotify.finishPastedSignIn(text);
      setValue("");
    } catch (error) {
      setMessage(authErrorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ol className="spotify-steps">
      <li>
        <span>{t("点下面的按钮，在弹出的小窗口里登录 Spotify 并同意授权。")}</span>
        <button
          className="commit-note"
          onClick={() => {
            setMessage("");
            void spotify.signIn().then(
              (result) => {
                setOpened(true);
                setBlockedUrl(result.opened ? "" : result.url);
              },
              (error) => setMessage(authErrorText(error)),
            );
          }}
        >
          <LogIn size={16} />
          {t("登录 Spotify")}
        </button>
        {blockedUrl && (
          <a className="cellar-command" href={blockedUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            {t("浏览器拦住了小窗口：点这里打开 Spotify 登录")}
          </a>
        )}
      </li>
      <li className={opened ? "" : "is-later"}>
        <span>
          {t("授权后小窗口会跳到一个打不开的页面（网址以 {prefix} 开头）——这是正常的。把那个窗口地址栏里的网址整个复制，粘贴到这里：", {
            prefix: new URL(redirectUri()).origin,
          })}
        </span>
        <form
          className="spotify-paste"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void finish(value);
          }}
        >
          <input
            value={value}
            placeholder={`${redirectUri()}?code=…`}
            aria-label={t("粘贴 Spotify 跳转后的网址")}
            onChange={(event) => setValue(event.target.value)}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (/code=/.test(text)) {
                event.preventDefault();
                setValue(text);
                void finish(text);
              }
            }}
          />
          <button className="commit-note" type="submit" disabled={busy || !value.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <ClipboardPaste size={16} />}
            {t("完成登录")}
          </button>
        </form>
      </li>
      {message && (
        <li className="spotify-error" role="alert">
          {message}
        </li>
      )}
    </ol>
  );
}

function AccountLine({ spotify }: { spotify: SpotifySession }) {
  const { account, engine } = spotify;
  const playerText =
    engine.status === "ready"
      ? t("播放器就绪")
      : engine.status === "loading"
        ? t("播放器加载中……")
        : engine.status === "error"
          ? spotifyProblemText(engine.problem)
          : t("播放时自动启动播放器");
  return (
    <div className="integration-status">
      <Music2 size={28} />
      <div>
        <strong>
          {account.status === "ok"
            ? t("已连接 · {name}", { name: account.profile?.name ?? "" })
            : account.status === "checking"
              ? t("正在确认 Spotify 账号……")
              : account.status === "not-registered"
                ? t("这个账号还不能用")
                : t("Spotify 暂时连不上")}
        </strong>
        <small className={engine.status === "error" ? "is-warn" : ""}>
          {account.status === "ok"
            ? playerText
            : account.status === "not-registered"
              ? t("这个 Spotify 账号还不在应用的用户名单里：请在开发者后台的 User Management 里加上它的邮箱。")
              : account.status === "error"
                ? account.message || t("稍后再试")
                : ""}
        </small>
      </div>
    </div>
  );
}

function PlaylistPicker({ model }: { model: TavernController }) {
  const { spotify, playlists, linkSpotifyPlaylist, setSpotifyPanelOpen, setSelectedPlaylistId } = model;
  const me = spotify.account.profile?.id ?? "";
  const [mine, setMine] = useState<SpotifyPlaylistInfo[]>();
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError("");
    setMine(undefined);
    fetchMyPlaylists(me).then(setMine, (reason) => {
      setMine([]);
      setError(
        reason instanceof SpotifyApiError && reason.status === 403
          ? t("Spotify 拒绝了读取歌单：这个账号可能不在应用的用户名单里。")
          : t("没能读到你的歌单，稍后再试。"),
      );
    });
  };
  useEffect(() => {
    if (me) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const linked = (id: string) => playlists.find((item) => item.spotify?.id === id);
  const pour = (info: SpotifyPlaylistInfo) => {
    linkSpotifyPlaylist(info);
    setSpotifyPanelOpen(false);
  };

  const addByLink = async (event: FormEvent) => {
    event.preventDefault();
    const id = parsePlaylistId(link);
    if (!id) {
      setLinkMessage(t("认不出这个链接：在 Spotify 里点歌单的「分享 → 复制链接」再粘贴。"));
      return;
    }
    setBusy(true);
    setLinkMessage("");
    try {
      const info = await fetchPlaylistInfo(id, me);
      if (!info.readable) {
        setLinkMessage(
          t("「{name}」不是你建的歌单，Spotify 不让读取它的曲目。在 Spotify 里把歌全选 →「添加到歌单」→ 新建你自己的歌单，再放上来。", {
            name: info.name,
          }),
        );
        return;
      }
      setLink("");
      pour(info);
    } catch (reason) {
      setLinkMessage(
        reason instanceof SpotifyApiError && reason.status === 404
          ? t("Spotify 上找不到这个歌单（可能是私密的或已删除）。")
          : t("没能读取这个歌单，稍后再试。"),
      );
    } finally {
      setBusy(false);
    }
  };

  const row = (info: SpotifyPlaylistInfo, liked = false) => {
    const page = linked(info.link.id);
    return (
      <li key={info.link.id} className={info.readable ? "" : "is-locked"}>
        {liked ? (
          <span className="spotify-cover liked" aria-hidden="true">
            <Heart size={18} />
          </span>
        ) : info.image ? (
          <img className="spotify-cover" src={info.image} alt="" loading="lazy" />
        ) : (
          <span className="spotify-cover" aria-hidden="true">
            <Music2 size={18} />
          </span>
        )}
        <span className="spotify-row-text">
          <strong>{info.name}</strong>
          <small>
            {liked
              ? t("你在 Spotify 上点过❤的歌")
              : info.readable
                ? t("{n} 首 · {owner}", { n: info.total, owner: info.link.owner ?? "" })
                : t("别人的歌单 · Spotify 不开放曲目")}
          </small>
        </span>
        {page ? (
          <button
            className="cellar-command"
            onClick={() => {
              setSelectedPlaylistId(page.id);
              setSpotifyPanelOpen(false);
            }}
          >
            <Check size={15} />
            {t("已在酒单")}
          </button>
        ) : (
          <button className="commit-note" disabled={!info.readable} onClick={() => pour(info)}>
            <Plus size={15} />
            {t("放上吧台")}
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="spotify-picker" aria-label={t("选一个 Spotify 歌单")}>
      <header>
        <strong>{t("选一个歌单放上吧台")}</strong>
        <button className="ghost-icon" aria-label={t("刷新歌单列表")} data-tip={t("刷新")} onClick={load}>
          <RefreshCw size={14} />
        </button>
      </header>
      <ul className="spotify-list">
        {row({ link: LIKED_LINK, name: t("我喜欢的歌曲"), total: 0, readable: true }, true)}
        {mine === undefined ? (
          <li className="spotify-loading">
            <LoaderCircle size={16} className="spin" />
            {t("正在读取你的歌单……")}
          </li>
        ) : (
          [...mine]
            .sort((a, b) => Number(b.readable) - Number(a.readable))
            .map((info) => row(info))
        )}
      </ul>
      {error && <p className="spotify-error">{error}</p>}
      <form className="spotify-paste" onSubmit={addByLink}>
        <Link2 size={15} />
        <input
          value={link}
          placeholder={t("或粘贴歌单链接 open.spotify.com/playlist/…")}
          aria-label={t("Spotify 歌单链接")}
          onChange={(event) => setLink(event.target.value)}
        />
        <button className="commit-note" type="submit" disabled={busy || !link.trim()}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}
          {t("放上吧台")}
        </button>
      </form>
      {linkMessage && <p className="spotify-error">{linkMessage}</p>}
      <p className="integration-note">
        <AlertTriangle size={16} />
        {t("Spotify 只开放你自己建的、或你参与协作的歌单的曲目。想用别人的歌单：在 Spotify 里把歌全选 →「添加到歌单」→ 新建一个你的歌单。")}
      </p>
    </section>
  );
}

function ClientSetup({ spotify }: { spotify: SpotifySession }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="integration-status">
        <KeyRound size={28} />
        <div>
          <strong>{t("第一次使用：建一个自己的 Spotify 应用")}</strong>
          <small>{t("免费，大约 3 分钟，只需要做一次")}</small>
        </div>
      </div>
      <ol className="spotify-steps">
        <li>
          <span>{t("打开 Spotify 开发者后台，用你的 Spotify 账号登录，点「Create app」。")}</span>
          <a className="cellar-command" href={DASHBOARD} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            Spotify Developer Dashboard
          </a>
        </li>
        <li>
          <span>
            {t("名字和描述随便填。「Redirect URIs」填下面这个地址（一字不差），「Which API/SDKs」勾选 Web API 和 Web Playback SDK，保存。")}
          </span>
          <CopyField value={redirectUri()} label="Redirect URI" />
        </li>
        <li>
          <span>{t("打开应用的 Settings，复制「Client ID」粘贴到这里（不要 Client secret）：")}</span>
          <form
            className="spotify-paste"
            onSubmit={(event) => {
              event.preventDefault();
              if (spotify.saveClientId(value)) setMessage("");
              else setMessage(t("Client ID 应该是 32 位的字母数字，再检查一下。"));
            }}
          >
            <input
              value={value}
              placeholder="Client ID"
              aria-label="Client ID"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setValue(event.target.value.trim())}
            />
            <button className="commit-note" type="submit" disabled={!value}>
              <Check size={15} />
              {t("保存")}
            </button>
          </form>
          {message && <p className="spotify-error">{message}</p>}
        </li>
        <li>
          <span>
            {t("想和朋友一起听：在应用的「User Management」里加上他们 Spotify 账号的名字和邮箱（开发中的应用最多 5 人）。")}
          </span>
        </li>
      </ol>
      <p className="integration-note">
        <ShieldCheck size={16} />
        {t("Client ID 是公开的应用编号，不是密码。酒馆不需要、也不会要你的 Client secret 或 Spotify 密码。")}
      </p>
    </>
  );
}

function Requirements() {
  return (
    <dl className="integration-facts">
      <div>
        <dt>{t("账号")}</dt>
        <dd>{t("Spotify Premium（网页播放的要求）")}</dd>
      </div>
      <div>
        <dt>{t("浏览器")}</dt>
        <dd>{t("电脑上的 Chrome / Edge / Firefox")}</dd>
      </div>
      <div>
        <dt>{t("音频")}</dt>
        <dd>{t("Spotify 直接播到你的浏览器，不下载、不转播")}</dd>
      </div>
    </dl>
  );
}

export function SpotifyPanel({
  model,
  onClose,
}: {
  model: TavernController;
  onClose: () => void;
}) {
  const { spotify, isGuest, room } = model;
  const [message, setMessage] = useState("");
  const { account, engine } = spotify;

  // ------------------------------------------------------------------ guest
  if (isGuest) {
    return (
      <IntegrationDialog title={t("Spotify · 一起听")} eyebrow="SPOTIFY · YOUR OWN ACCOUNT" onClose={onClose}>
        {!spotify.clientId ? (
          <div className="integration-status">
            <Music2 size={28} />
            <div>
              <strong>{t("{host} 还没连上 Spotify", { host: room.hostName || t("房主") })}</strong>
              <small>{t("房主连好之后，这里就能用你自己的 Spotify 登录。")}</small>
            </div>
          </div>
        ) : !spotify.signedIn ? (
          <>
            <div className="integration-status">
              <Music2 size={28} />
              <div>
                <strong>{t("用你自己的 Spotify 一起听")}</strong>
                <small>{t("Spotify 不允许把一个人的音乐转播给别人：每位朋友用自己的账号播放，酒馆负责把大家对齐到同一秒。")}</small>
              </div>
            </div>
            <p className="integration-note">
              <AlertTriangle size={16} />
              {t("先确认 {host} 已经在 Spotify 开发者后台的 User Management 里加上了你的 Spotify 邮箱。", {
                host: room.hostName || t("房主"),
              })}
            </p>
            <PasteSignIn spotify={spotify} />
            <Requirements />
          </>
        ) : (
          <>
            <AccountLine spotify={spotify} />
            {account.status === "ok" && engine.held && (
              <button
                className="commit-note"
                onClick={() => engine.retake()}
              >
                <Play size={15} />
                {t("在酒馆里继续听")}
              </button>
            )}
            <div className="room-actions">
              {account.status === "not-registered" && (
                <button className="cellar-command" onClick={spotify.recheckAccount}>
                  <RefreshCw size={15} />
                  {t("加好了，再试一次")}
                </button>
              )}
              {engine.status === "error" && (
                <button
                  className="cellar-command"
                  onClick={() => {
                    engine.disconnect();
                    void engine.ensure();
                  }}
                >
                  <RefreshCw size={15} />
                  {t("重新加载播放器")}
                </button>
              )}
              <button className="cellar-command" onClick={spotify.signOut}>
                <LogOut size={15} />
                {t("退出 Spotify")}
              </button>
            </div>
            <p className="integration-note">
              <ShieldCheck size={16} />
              {t("歌从 Spotify 直接播到你的浏览器，用的是你自己的账号；房主那边只告诉你现在放哪首、到第几秒。")}
            </p>
          </>
        )}
      </IntegrationDialog>
    );
  }

  // ------------------------------------------------------------------- host
  return (
    <IntegrationDialog title={t("Spotify 酒单")} eyebrow="SPOTIFY · PLAYLISTS ON THE BAR" onClose={onClose}>
      {!spotify.clientId ? (
        <>
          <ClientSetup spotify={spotify} />
          <Requirements />
        </>
      ) : !spotify.signedIn ? (
        <>
          <div className="integration-status">
            <Music2 size={28} />
            <div>
              <strong>{t("应用已就绪，连接你的 Spotify")}</strong>
              <small>
                {t("Client ID ····{tail}", { tail: spotify.clientId.slice(-4) })}
                {spotify.clientSource === "saved" && (
                  <button className="link-button" onClick={() => spotify.saveClientId("")}>
                    {t("更换")}
                  </button>
                )}
              </small>
            </div>
          </div>
          {spotify.signsInHere ? (
            <div className="room-actions">
              <button
                className="commit-note"
                onClick={() => {
                  setMessage("");
                  void spotify.signIn().catch((error) => setMessage(authErrorText(error)));
                }}
              >
                <LogIn size={16} />
                {t("连接 Spotify")}
              </button>
            </div>
          ) : (
            <PasteSignIn spotify={spotify} />
          )}
          {message && <p className="spotify-error">{message}</p>}
          <Requirements />
          <p className="integration-note">
            <ShieldCheck size={16} />
            {t("会弹出 Spotify 的登录窗口，同意后自动回来。登录信息只存在这台电脑的浏览器里，随时可以退出。")}
          </p>
        </>
      ) : (
        <>
          <AccountLine spotify={spotify} />
          {account.status === "ok" && <PlaylistPicker model={model} />}
          <div className="room-actions">
            {account.status === "not-registered" && (
              <button className="cellar-command" onClick={spotify.recheckAccount}>
                <RefreshCw size={15} />
                {t("再检查一次")}
              </button>
            )}
            {engine.status === "error" && (
              <button
                className="cellar-command"
                onClick={() => {
                  engine.disconnect();
                  void engine.ensure();
                }}
              >
                <RefreshCw size={15} />
                {t("重新加载播放器")}
              </button>
            )}
            <button className="cellar-command" onClick={spotify.signOut}>
              <LogOut size={15} />
              {t("退出 Spotify")}
            </button>
          </div>
          <p className="integration-note">
            <ShieldCheck size={16} />
            {t("音乐由 Spotify 提供，直接播到你的浏览器，酒馆不下载、不转播。同席时，朋友用他们自己的 Spotify 账号同步收听。")}
          </p>
        </>
      )}
    </IntegrationDialog>
  );
}
