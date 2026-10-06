const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const random = () => encode(crypto.getRandomValues(new Uint8Array(64)));
export interface PkceTransaction {
  state: string;
  verifier: string;
  createdAt: number;
  redirectUri: string;
}
export async function createPkceRequest(
  clientId: string,
  redirectUri: string,
  scopes: string[],
) {
  if (!clientId) throw new Error("Missing Spotify Client ID");
  const redirect = new URL(redirectUri);
  if (
    redirect.hash ||
    redirect.hostname === "localhost" ||
    (redirect.protocol !== "https:" &&
      !(
        redirect.protocol === "http:" &&
        ["127.0.0.1", "[::1]"].includes(redirect.hostname)
      ))
  )
    throw new Error("Use HTTPS or an explicit loopback Redirect URI");
  const transaction: PkceTransaction = {
    state: random(),
    verifier: random(),
    createdAt: Date.now(),
    redirectUri,
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(transaction.verifier),
  );
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state: transaction.state,
    code_challenge_method: "S256",
    code_challenge: encode(new Uint8Array(digest)),
  }).toString();
  return { url: url.href, transaction };
}
/** No network call or token storage is performed. Callers must remove the one-use transaction on consumption. */
export function validatePkceCallback(
  callback: string,
  transaction: PkceTransaction,
) {
  const url = new URL(callback),
    redirect = new URL(transaction.redirectUri);
  if (
    url.origin !== redirect.origin ||
    url.pathname !== redirect.pathname ||
    url.searchParams.get("state") !== transaction.state ||
    Date.now() - transaction.createdAt > 600_000 ||
    transaction.createdAt > Date.now()
  )
    throw new Error("Invalid or expired OAuth callback");
  if (url.searchParams.has("error"))
    throw new Error("Spotify authorization was declined");
  const code = url.searchParams.get("code");
  if (!code) throw new Error("Missing authorization code");
  return {
    code,
    verifier: transaction.verifier,
    redirectUri: transaction.redirectUri,
  };
}
