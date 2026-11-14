import type { LiveEvent } from "@kip/shared/live";
import { Text as RNText } from "react-native";
import { Card, Text, useColors } from "@/lib/ui";
import {
  baselineLine,
  hoursLine,
  labelTitle,
  peakLine,
  spikeTimeLine,
  WAITING_EVENT,
} from "../copy";
import { room } from "./room";

/** Label and the construction-hours check for the latest spike. */
export function EventCard({ event }: { event: LiveEvent | null }) {
  const colors = useColors();
  if (!event) {
    return (
      <Card>
        <Text>{WAITING_EVENT}</Text>
      </Card>
    );
  }
  const hours = hoursLine(event);
  return (
    <Card>
      <RNText style={[room.event, { color: colors.text }]}>{labelTitle(event.label)}</RNText>
      {hours ? <RNText style={[room.hours, { color: colors.text }]}>{hours}</RNText> : null}
      <RNText style={[room.detail, { color: colors.textSecondary }]}>
        {spikeTimeLine(event.spike.t)}
      </RNText>
      <RNText style={[room.detail, { color: colors.textSecondary }]}>
        {peakLine(event.spike.peakDb)}
      </RNText>
      <RNText style={[room.detail, { color: colors.textSecondary }]}>
        {baselineLine(event.spike.baselineDb)}
      </RNText>
    </Card>
  );
}
