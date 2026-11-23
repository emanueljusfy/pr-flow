import {
  getPortainerStatus,
  type PortainerStatus
} from "@/modules/local-docker/lib/local-docker-portainer-service";
import { createServerCache } from "@/modules/server-cache/lib/server-cache";

// Each status check spawns `docker compose ps`; overlapping polls (several tabs,
// focus refetch) share one process and a short-lived result.
const portainerStatusCache = createServerCache<PortainerStatus>({
  name: "local-docker:portainer-status",
  ttlMs: 3_000
});

export function getCachedPortainerStatus(): Promise<PortainerStatus> {
  return portainerStatusCache.get("default", () => getPortainerStatus());
}

export function invalidatePortainerStatus(): void {
  portainerStatusCache.invalidate("default");
}
