import type { LiveEvent } from "@kip/shared/live";
import { Text as RNText } from "react-native";
import { Section, Text, useColors } from "@/lib/ui";
import {
  baselineLine,
  hoursLine,
  labelTitle,
  peakLine,
  spikeTimeLine,
  WAITING_EVENT,
} from "../copy";
import { useRoom } from "./room";

/** Label and the construction-hours check for the latest spike. */
export function EventCard({ event }: { event: LiveEvent | null }) {
  const colors = useColors();
  const room = useRoom();
  if (!event) {
    return (
      <Section inset>
        <Text tone="secondary">{WAITING_EVENT}</Text>
      </Section>
    );
  }
  const hours = hoursLine(event);
  return (
    <Section inset>
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
    </Section>
  );
}
