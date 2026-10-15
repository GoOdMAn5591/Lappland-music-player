export const features = {
  multiplayer: import.meta.env.VITE_ENABLE_MULTIPLAYER === "true",
};
export const spotifyConfig = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID || "",
  redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI || "",
};
export const assetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

/** This computer is a Mac (the launcher there is 「启动酒馆.command」). */
export const onMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
/** The file that starts the tavern on this computer. */
export const launcherName = onMac ? "启动酒馆.command" : "启动酒馆.bat";
