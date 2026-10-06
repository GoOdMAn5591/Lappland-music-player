export const features = {
  spotify: import.meta.env.VITE_ENABLE_SPOTIFY === "true",
  multiplayer: import.meta.env.VITE_ENABLE_MULTIPLAYER === "true",
};
export const spotifyConfig = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID || "",
  redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI || "",
};
export const assetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
