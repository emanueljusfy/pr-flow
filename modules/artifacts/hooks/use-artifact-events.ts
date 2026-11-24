"use client";

import { useEffect, useRef } from "react";
import { getArtifactClientId } from "@/modules/artifacts/lib/artifact-client";
import { artifactEventSchema, type ArtifactEventPayload } from "@/modules/artifacts/lib/artifact-validation";

type Handlers = {
  onEvent: (event: ArtifactEventPayload) => void;
  /** The stream came back after a drop: anything may have changed meanwhile. */
  onReconnect: () => void;
};

/** Follows `/api/artifacts/events` for the life of the component. */
export function useArtifactEvents({ onEvent, onReconnect }: Handlers): void {
  const handlers = useRef<Handlers>({ onEvent, onReconnect });
  useEffect(() => {
    handlers.current = { onEvent, onReconnect };
  });

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return;
    }
    const source = new EventSource(`/api/artifacts/events?clientId=${encodeURIComponent(getArtifactClientId())}`);
    let connections = 0;

    // The server sends `ready` on every (re)connect; the second one means the stream dropped and came back.
    source.addEventListener("ready", () => {
      connections += 1;
      if (connections > 1) {
        handlers.current.onReconnect();
      }
    });
    source.addEventListener("artifact", (message) => {
      let data: unknown;
      try {
        data = JSON.parse((message as MessageEvent<string>).data);
      } catch {
        return;
      }
      const parsed = artifactEventSchema.safeParse(data);
      if (parsed.success) {
        handlers.current.onEvent(parsed.data);
      }
    });

    return () => source.close();
  }, []);
}
