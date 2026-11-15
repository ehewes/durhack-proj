import type { AttributionForNightOutput } from "@kip/shared/attribution";
import { Text } from "@/lib/ui";
import { attributionSummaryText } from "../copy";

/** Counts for this night against random moments from the same night. */
export function AttributionSummary({
  result,
}: {
  result: Pick<AttributionForNightOutput, "night" | "randomWindowRate">;
}) {
  return <Text>{attributionSummaryText(result)}</Text>;
}
