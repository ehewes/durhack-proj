import { worksNearInput } from "@kip/shared/works";
import { publicProcedure, router } from "../../trpc/init";
import { worksNear } from "./near";

export const worksRouter = router({
  near: publicProcedure.input(worksNearInput).query(({ input }) => worksNear(input)),
});
