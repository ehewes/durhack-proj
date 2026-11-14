import { livePushInput } from "@kip/shared/live";
import { publicProcedure, router, userProcedure } from "../../trpc/init";
import { pushLiveSamples, streamLive } from "./service";

// `push` is the phone (it sends `x-kip-user`). `stream` is public so the
// dashboard can subscribe without that id. One in-memory session feeds every viewer.
export const liveRouter = router({
  push: userProcedure.input(livePushInput).mutation(({ input }) => pushLiveSamples(input)),
  stream: publicProcedure.subscription(async function* ({ signal }) {
    yield* streamLive(signal);
  }),
});
