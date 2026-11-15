import { StyleSheet, View } from "react-native";
import { Notice, Screen, Section, StatusView, space } from "@/lib/ui";
import { BriefingPlayer, EventCard, Meter } from "../components";
import { CONNECTING, SIMULATED_BANNER, STREAM_ERROR, TRY_AGAIN } from "../copy";
import { useLiveDashboard } from "../hooks/useLiveDashboard";

/** The live demo: relative dB, the labelled spike, and the briefing. The title is the nav header. */
export function LiveScreen() {
  const { state, retry } = useLiveDashboard();
  return (
    <Screen underHeader>
      {state.source === "simulated" ? <Notice message={SIMULATED_BANNER} icon="flask" /> : null}
      <Section inset>
        <Meter db={state.db} samples={state.samples} />
      </Section>
      {state.status === "connecting" ? <StatusView kind="loading" message={CONNECTING} /> : null}
      {state.status === "error" ? (
        <Section>
          <View style={styles.pad}>
            <StatusView
              kind="error"
              message={STREAM_ERROR}
              retryLabel={TRY_AGAIN}
              onRetry={retry}
            />
          </View>
        </Section>
      ) : null}
      <EventCard event={state.event} />
      <BriefingPlayer url={state.event?.briefingAudioUrl ?? null} />
    </Screen>
  );
}

const styles = StyleSheet.create({ pad: { paddingHorizontal: space.md } });
