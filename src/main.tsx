import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { guardAgainstPageTranslation } from "./translateGuard";
import { handleSpotifyCallback } from "./integrations/spotify/callback";
import "./assets/fonts/fonts.css";
import "./tavern.css";
import "./entrance/entrance.css";

guardAgainstPageTranslation();

// Spotify's sign-in comes back to this page first; finish that before the bar opens.
void handleSpotifyCallback()
  .catch(() => false)
  .then((handled) => {
    if (handled) return;
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </React.StrictMode>,
    );
  });
