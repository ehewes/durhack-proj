import { rankInput } from "@kip/shared/stays";
import { publicProcedure, router } from "../../trpc/init";
import { rank } from "./service";

export const staysRouter = router({
  rank: publicProcedure.input(rankInput).query(({ input }) => rank(input)),
});
