import type { AppRouter } from "@kip/server/trpc/router";
import { liveStreamItem } from "@kip/shared/live";
import { createTRPCClient, httpSubscriptionLink } from "@trpc/client";
import superjson from "superjson";
import { apiUrl } from "@/lib/api-url";
import { STREAM_ERROR } from "./copy";
import type { LiveSubscription, StreamFailure } from "./dashboard";

/** Reads a tRPC error code. Anything else is a dropped connection. */
export function toStreamFailure(error: unknown): StreamFailure {
  return { code: readCode(error), message: STREAM_ERROR };
}

function readCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("data" in error)) return undefined;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object" || !("code" in data)) return undefined;
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export type StreamSubscribe = (
  input: undefined,
  opts: {
    onStarted?: () => void;
    onData: (data: unknown) => void;
    onError: (error: unknown) => void;
  },
) => { unsubscribe: () => void };

/**
 * `live.stream` over SSE. The shared app client has no subscription link, so the
 * viewer opens its own. Payloads are checked against the shared `liveStreamItem` contract.
 */
export function createServerSubscription(
  subscribe: StreamSubscribe = sharedSubscribe(),
): LiveSubscription {
  return {
    start(handlers) {
      let unsubscribe = () => {};
      try {
        const sub = subscribe(undefined, {
          onStarted: () => handlers.onStarted(),
          onData: (data) => {
            const parsed = liveStreamItem.safeParse(data);
            if (!parsed.success) {
              handlers.onError({
                message: "The live stream sent a reading Kip could not read.",
              });
              return;
            }
            handlers.onItem(parsed.data);
          },
          onError: (error) => handlers.onError(toStreamFailure(error)),
        });
        unsubscribe = () => sub.unsubscribe();
      } catch (error) {
        handlers.onError(toStreamFailure(error));
      }
      return () => unsubscribe();
    },
  };
}

let cached: StreamSubscribe | undefined;

function sharedSubscribe(): StreamSubscribe {
  cached ??= connectLiveStream();
  return cached;
}

function connectLiveStream(): StreamSubscribe {
  const client = createTRPCClient<AppRouter>({
    links: [
      httpSubscriptionLink({
        url: () => `${apiUrl()}/trpc`,
        transformer: superjson,
      }),
    ],
  });
  return (input, opts) =>
    client.live.stream.subscribe(input, {
      onStarted: () => opts.onStarted?.(),
      onData: (data) => opts.onData(data),
      onError: (error) => opts.onError(error),
    });
}
