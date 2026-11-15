import { rankResult } from "@kip/shared/stays";
import lightSleeper from "../../../../../../packages/shared/src/stays/fixtures/rank-light-sleeper.json";
import nightOut from "../../../../../../packages/shared/src/stays/fixtures/rank-night-out.json";
import type { RankSamples } from "../model";

/** Offline fallback for `stays.rank`: the shared samples, shown labelled as simulated. */
export const rankSamples: RankSamples = {
  lightSleeper: rankResult.parse(lightSleeper),
  nightOut: rankResult.parse(nightOut),
};
