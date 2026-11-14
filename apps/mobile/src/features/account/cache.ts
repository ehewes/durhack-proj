import type { AccountView } from "@kip/shared/account";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** How account writes touch the shared query cache. `meKey` is the `account.me` query key. */
export function accountCache(queryClient: QueryClient, meKey: QueryKey) {
  return {
    /**
     * Stores what a write returned. A fetch of `account.me` still in flight may carry the answers
     * from before the write, and the next edit sends all three answers back, so it is cancelled.
     */
    async write(view: AccountView): Promise<void> {
      await queryClient.cancelQueries({ queryKey: meKey });
      queryClient.setQueryData(meKey, view);
    },
    /** After a delete: every cached query goes back to empty, and the ones on screen refetch. */
    forget(): Promise<void> {
      return queryClient.resetQueries();
    },
  };
}
