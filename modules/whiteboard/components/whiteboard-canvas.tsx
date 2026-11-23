"use client";

import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import "../whiteboard.css";
import { WHITEBOARD_PERSISTENCE_KEY, whiteboardThemes } from "../lib/whiteboard-theme";

export default function WhiteboardCanvas() {
  return (
    <Tldraw
      persistenceKey={WHITEBOARD_PERSISTENCE_KEY}
      themes={whiteboardThemes}
      colorScheme="dark"
      onMount={(editor) => {
        // A stored "light" preference would override the prop; the app is dark-only.
        editor.user.updateUserPreferences({ colorScheme: "dark" });
      }}
    />
  );
}
