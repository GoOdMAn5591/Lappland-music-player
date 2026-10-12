import { useSyncExternalStore } from "react";
import {
  beginSignIn,
  clientIdSource,
  completeSignIn,
  forget,
  getClientId,
  isSignedIn,
  redirectUri,
  saveClientId,
  subscribeAuth,
  SpotifyAuthError,
} from "./auth";
import { fetchProfile, SpotifyApiError, type SpotifyProfile } from "./api";
import { spotifyEngine, useSpotifyEngine, type EngineProblem } from "./player";
import { t } from "../../i18n";

/**
 * Who is signed in to Spotify in this tab, for the UI: the account check
 * (Development Mode apps only answer users on their list), sign-in and
 * sign-out. Playback lives in player.ts.
 */

export type AccountStatus = "signed-out" | "checking" | "ok" | "not-registered" | "error";
interface Account {
  status: AccountStatus;
  profile?: SpotifyProfile;
  message?: string;
  clientId?: string;
}

const listeners = new Set<() => void>();
let version = 0;
let account: Account = { status: "signed-out" };
let checking = 0;

function emit() {
  version++;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

async function checkAccount() {
  const run = ++checking;
  account = { status: "checking", clientId: getClientId() };
  emit();
  try {
    const profile = await fetchProfile();
    if (run !== checking) return;
    account = { status: "ok", profile, clientId: getClientId() };
  } catch (error) {
    if (run !== checking) return;
    if (error instanceof SpotifyAuthError) account = { status: "signed-out" };
    else if (error instanceof SpotifyApiError && error.status === 403)
      account = { status: "not-registered", message: error.message, clientId: getClientId() };
    else
      account = {
        status: "error",
        message: (error as Error)?.message || "",
        clientId: getClientId(),
      };
  }
  emit();
}

function follow() {
  if (!isSignedIn()) {
    if (account.status !== "signed-out") {
      checking++;
      account = { status: "signed-out" };
      spotifyEngine.disconnect();
    }
  } else if (account.status === "signed-out" || account.clientId !== getClientId()) {
    void checkAccount();
    return;
  }
  emit();
}
subscribeAuth(follow);
if (typeof window !== "undefined") queueMicrotask(follow);

/** Spotify sends sign-ins back to 127.0.0.1:5173 — is that this page? */
export function signsInHere() {
  try {
    return new URL(redirectUri()).origin === location.origin;
  } catch {
    return false;
  }
}

/**
 * Opens Spotify's sign-in in a small window. On the host's own bar the
 * window finishes by itself; elsewhere (a friend at a shared table) Spotify
 * lands on an address that doesn't load, and that address gets pasted back.
 */
export async function signIn(): Promise<{ mode: "popup" | "paste" | "redirect"; url: string; opened: boolean }> {
  spotifyEngine.activate();
  const here = signsInHere();
  const popup = window.open("about:blank", "tavern-spotify", "popup,width=480,height=760");
  const mode = here ? (popup ? "popup" : "redirect") : "paste";
  try {
    const url = await beginSignIn(mode);
    if (popup && !popup.closed) {
      popup.location.href = url;
      popup.focus?.();
      return { mode, url, opened: true };
    }
    if (here) {
      location.assign(url);
      return { mode, url, opened: true };
    }
    // the browser blocked the small window: the panel offers the link instead
    return { mode, url, opened: Boolean(window.open(url, "_blank")) };
  } catch (error) {
    popup?.close();
    throw error;
  }
}

/** A friend pastes the address Spotify sent them to. */
export async function finishPastedSignIn(text: string) {
  spotifyEngine.activate();
  await completeSignIn(text);
}

export function signOut() {
  forget();
  spotifyEngine.disconnect();
}

/** What went wrong with Spotify playback, in words for the status line / panel. */
export function spotifyProblemText(problem?: EngineProblem) {
  switch (problem) {
    case "premium":
      return t("网页里播放 Spotify 需要 Premium 账号（Spotify 的规定）。");
    case "not-registered":
      return t("这个 Spotify 账号还不在房主应用的用户名单里：请房主在 Spotify 开发者后台的 User Management 里加上你的邮箱。");
    case "auth":
      return t("Spotify 登录失效了，请重新连接。");
    case "unsupported":
      return t("这个浏览器放不了 Spotify（需要受保护音频支持）：请用电脑上的 Chrome、Edge 或 Firefox。");
    case "device":
      return t("Spotify 暂时找不到酒馆这台播放器，稍等几秒再试。");
    case "sdk":
      return t("Spotify 播放器没加载出来：检查网络，或暂时关掉拦截广告 / 隐私类扩展。");
    default:
      return t("Spotify 没能开始播放，再试一次。");
  }
}

/** Re-check the account (after the host adds this friend to the app's user list). */
export const recheckAccount = () => void checkAccount();

export function useSpotify() {
  useSyncExternalStore(subscribe, () => version);
  useSyncExternalStore(subscribeAuth, () => (isSignedIn() ? getClientId() : ""));
  const engine = useSpotifyEngine();
  return {
    clientId: getClientId(),
    clientSource: clientIdSource(),
    signedIn: isSignedIn(),
    account,
    engine,
    signsInHere: signsInHere(),
    saveClientId,
    signIn,
    finishPastedSignIn,
    signOut,
    recheckAccount,
  };
}
export type SpotifySession = ReturnType<typeof useSpotify>;
