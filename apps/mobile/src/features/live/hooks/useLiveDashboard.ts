import { useEffect, useState } from "react";
import { attachLiveDashboard, type DashboardState, emptyDashboard } from "../dashboard";
import { createDemoSubscription } from "../demo-stream";
import { createServerSubscription } from "../server-stream";

/** Expo sets this to production for an export, and development for `expo start`. */
function isDevelopmentBuild(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Subscribes to `live.stream`, and to the labelled demo when that stream is not built yet. */
export function useLiveDashboard(): { state: DashboardState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DashboardState>(emptyDashboard);
  useEffect(() => {
    // `attempt` is the retry token. Try again bumps it and opens a fresh subscription.
    const token = attempt;
    return attachLiveDashboard({
      server: createServerSubscription(),
      mock: createDemoSubscription(),
      mockWhenDevConnectionFails: isDevelopmentBuild(),
      onChange: (next) => {
        if (token === attempt) setState(next);
      },
    });
  }, [attempt]);
  return { state, retry: () => setAttempt((n) => n + 1) };
}
