import { spotifyConfig } from "../../config";
import { createPkceRequest, validatePkceCallback, type PkceTransaction } from "./pkce";

/**
 * Spotify sign-in for the tavern: Authorization Code with PKCE, entirely in
 * the browser. There is no Client Secret anywhere — the Client ID is public
 * by design, and every listener signs in with their own account.
 *
 * The host's bar always runs at http://127.0.0.1:5173, so that page is the
 * one Redirect URI to register. A friend at a shared table opens the tavern
 * from a changing trycloudflare address that can't be registered; their
 * sign-in lands on the same 127.0.0.1 address (which doesn't exist on their
 * computer), and they paste that address back into the tavern.
 */

export const SPOTIFY_SCOPES = [
  "streaming", // Web Playback SDK
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state", // start a song on the tavern's own player
  "user-read-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read", // 「我喜欢的歌曲」
];

export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:5173/callback";
export const redirectUri = () => spotifyConfig.redirectUri || DEFAULT_REDIRECT_URI;
export const CLIENT_ID_PATTERN = /^[0-9a-f]{32}$/i;

const CLIENT_KEY = "tavern-spotify-client";
const TOKEN_KEY = "tavern-spotify-token";
const PKCE_KEY = "tavern-spotify-pkce";

export interface SpotifyToken {
  access: string;
  refresh?: string;
  /** ms since epoch */
  expiresAt: number;
  scope: string;
  clientId: string;
}

interface StoredTransaction extends PkceTransaction {
  clientId: string;
  /** popup: the 127.0.0.1 callback page finishes sign-in and closes itself. */
  mode: "popup" | "paste" | "redirect";
}

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* this sign-in only lasts the page */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing stored */
    }
  },
};

// ------------------------------------------------------------------ state
const listeners = new Set<() => void>();
let version = 0;
/** A guest borrows the host's (public) Client ID from the room. */
let roomClientId = "";
let token: SpotifyToken | undefined;

function emit() {
  version++;
  listeners.forEach((listener) => listener());
}
export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const authVersion = () => version;

export function getClientId() {
  if (roomClientId) return roomClientId;
  if (CLIENT_ID_PATTERN.test(spotifyConfig.clientId)) return spotifyConfig.clientId;
  const saved = store.get(CLIENT_KEY) ?? "";
  return CLIENT_ID_PATTERN.test(saved) ? saved : "";
}
export function clientIdSource(): "room" | "env" | "saved" | "none" {
  if (roomClientId) return "room";
  if (CLIENT_ID_PATTERN.test(spotifyConfig.clientId)) return "env";
  return getClientId() ? "saved" : "none";
}

/** Host: the Client ID pasted from the Spotify dashboard (never a secret). */
export function saveClientId(value: string) {
  const id = value.trim();
  if (id && !CLIENT_ID_PATTERN.test(id)) return false;
  const before = getClientId();
  if (id) store.set(CLIENT_KEY, id.toLowerCase());
  else store.remove(CLIENT_KEY);
  if (getClientId() !== before) forget();
  else emit();
  return true;
}

/** Guest: use the host's app. */
export function setRoomClientId(id: string | undefined) {
  const clean = id && CLIENT_ID_PATTERN.test(id) ? id.toLowerCase() : "";
  if (clean === roomClientId) return;
  roomClientId = clean;
  token = readToken();
  emit();
}

function readToken(): SpotifyToken | undefined {
  try {
    const raw = JSON.parse(store.get(TOKEN_KEY) || "null") as SpotifyToken | null;
    if (
      !raw ||
      typeof raw.access !== "string" ||
      typeof raw.expiresAt !== "number" ||
      raw.clientId !== getClientId()
    )
      return undefined;
    return raw;
  } catch {
    return undefined;
  }
}
token = readToken();

// another tab (the sign-in popup) finished signing in, or signed out
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key !== TOKEN_KEY && event.key !== CLIENT_KEY && event.key !== null) return;
    token = readToken();
    emit();
  });

export const isSignedIn = () => Boolean(token);
export const grantedScopes = () => token?.scope.split(" ") ?? [];

function keep(next: SpotifyToken) {
  token = next;
  store.set(TOKEN_KEY, JSON.stringify(next));
  emit();
}

/** Sign out: drop the tokens (Spotify's policy: delete the user's data on disconnect). */
export function forget() {
  token = undefined;
  store.remove(TOKEN_KEY);
  store.remove(PKCE_KEY);
  emit();
}

// ---------------------------------------------------------------- sign-in
export type AuthErrorCode =
  | "no-client"
  | "declined"
  | "expired"
  | "mismatch"
  | "exchange"
  | "signed-out"
  | "network";

export class SpotifyAuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

export async function beginSignIn(mode: StoredTransaction["mode"]) {
  const clientId = getClientId();
  if (!clientId) throw new SpotifyAuthError("no-client");
  const { url, transaction } = await createPkceRequest(clientId, redirectUri(), SPOTIFY_SCOPES);
  const stored: StoredTransaction = { ...transaction, clientId, mode };
  store.set(PKCE_KEY, JSON.stringify(stored));
  return url;
}

function pendingTransaction(): StoredTransaction | undefined {
  try {
    const raw = JSON.parse(store.get(PKCE_KEY) || "null") as StoredTransaction | null;
    return raw && typeof raw.state === "string" ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** Is this page Spotify sending the browser back with a code? */
export function isCallbackUrl(href: string) {
  try {
    const url = new URL(href);
    const redirect = new URL(redirectUri());
    return (
      url.origin === redirect.origin &&
      url.pathname === redirect.pathname &&
      (url.searchParams.has("code") || url.searchParams.has("error"))
    );
  } catch {
    return false;
  }
}

/** The transaction that callback belongs to, if this browser started it. */
export function callbackTransaction(href: string) {
  const transaction = pendingTransaction();
  try {
    const state = new URL(href).searchParams.get("state");
    return transaction && state === transaction.state ? transaction : undefined;
  } catch {
    return undefined;
  }
}

async function tokenRequest(body: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
  } catch {
    throw new SpotifyAuthError("network");
  }
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token)
    throw new SpotifyAuthError(
      (data.error === "invalid_grant" ? "signed-out" : "exchange") as AuthErrorCode,
      data.error_description || data.error || String(response.status),
    );
  return data as Required<Pick<typeof data, "access_token">> & typeof data;
}

/**
 * Finish sign-in from the address Spotify sent the browser to — this page's
 * own URL (host) or the address a friend pasted back in.
 */
export async function completeSignIn(callbackHref: string) {
  let href = callbackHref.trim();
  if (!/^https?:\/\//i.test(href) && /code=/.test(href))
    href = `${redirectUri()}${href.startsWith("?") ? "" : "?"}${href}`;
  const transaction = pendingTransaction();
  if (!transaction) throw new SpotifyAuthError("expired");
  let params: { code: string; verifier: string; redirectUri: string };
  try {
    params = validatePkceCallback(href, transaction);
  } catch (error) {
    const message = String((error as Error).message);
    throw new SpotifyAuthError(
      (/declined/.test(message)
        ? "declined"
        : Date.now() - transaction.createdAt > 600_000
          ? "expired"
          : "mismatch") as AuthErrorCode,
      message,
    );
  }
  store.remove(PKCE_KEY); // one use only
  const data = await tokenRequest({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: transaction.clientId,
    code_verifier: params.verifier,
  });
  keep({
    access: data.access_token,
    refresh: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? SPOTIFY_SCOPES.join(" "),
    clientId: transaction.clientId,
  });
  return transaction.mode;
}

let refreshing: Promise<string> | undefined;

/** A fresh access token, refreshed a minute before it runs out. */
export async function getAccessToken(force = false): Promise<string> {
  const current = token;
  if (!current) throw new SpotifyAuthError("signed-out");
  if (!force && current.expiresAt - 60_000 > Date.now()) return current.access;
  if (!current.refresh) {
    forget();
    throw new SpotifyAuthError("signed-out");
  }
  refreshing ??= (async () => {
    try {
      const data = await tokenRequest({
        grant_type: "refresh_token",
        refresh_token: current.refresh!,
        client_id: current.clientId,
      });
      keep({
        access: data.access_token,
        refresh: data.refresh_token || current.refresh,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
        scope: data.scope ?? current.scope,
        clientId: current.clientId,
      });
      return data.access_token;
    } catch (error) {
      if (error instanceof SpotifyAuthError && error.code === "signed-out") forget();
      throw error;
    } finally {
      refreshing = undefined;
    }
  })();
  return refreshing;
}
