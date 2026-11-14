import type { AppRouter } from "@kip/server/trpc/router";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import { getUserId } from "./user-id";

/** Empty on the web build served by the API, so calls stay same-origin. */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
}

export function createClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        headers: async () => ({ "x-kip-user": await getUserId() }),
      }),
    ],
  });
}
