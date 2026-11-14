import { Text as RNText } from "react-native";
import { Button, Card, Screen, Text, useColors } from "@/lib/ui";
import { BriefingPlayer, EventCard, Meter } from "../components";
import { room } from "../components/room";
import { CONNECTING, LIVE_TITLE, SIMULATED_BANNER, STREAM_ERROR, TRY_AGAIN } from "../copy";
import { useLiveDashboard } from "../hooks/useLiveDashboard";

/** Web dashboard for the live demo: relative dB, the labelled spike, and the briefing. */
export function LiveScreen() {
  const colors = useColors();
  const { state, retry } = useLiveDashboard();
  return (
    <Screen>
      <RNText accessibilityRole="header" style={[room.title, { color: colors.text }]}>
        {LIVE_TITLE}
      </RNText>
      {state.source === "simulated" ? (
        <RNText style={[room.banner, { color: colors.text }]}>{SIMULATED_BANNER}</RNText>
      ) : null}
      <Meter db={state.db} samples={state.samples} />
      {state.status === "connecting" ? <Text>{CONNECTING}</Text> : null}
      {state.status === "error" ? (
        <Card>
          <Text>{STREAM_ERROR}</Text>
          <Button label={TRY_AGAIN} onPress={retry} />
        </Card>
      ) : null}
      <EventCard event={state.event} />
      <BriefingPlayer url={state.event?.briefingAudioUrl ?? null} />
    </Screen>
  );
}
