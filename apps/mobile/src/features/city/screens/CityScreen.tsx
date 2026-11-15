import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { hairline, Notice, StatusView, space, Text, useColors } from "@/lib/ui";
import { CoverageLegend, SensorLegend, SensorList, SensorMap } from "../components";
import { LOADING, SAMPLE_LABEL, TITLE } from "../copy";
import { coverageHeat } from "../coverage";
import { useCityCoverage } from "../hooks/useCityCoverage";
import { useCitySensors } from "../hooks/useCitySensors";
import { useShowSimulated } from "../hooks/useShowSimulated";
import { sortSensors } from "../sensors";

/**
 * The Kip Map: Newcastle's sensors shaded by indicative disturbance, with a linked list. The map
 * takes the top of the screen; the grouped panel below scrolls clear of the tab bar.
 */
export function CityScreen() {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const state = useCitySensors();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = useMemo(() => Date.now(), []);
  const sensors = state.kind === "sensors" ? state.sensors : [];
  const sorted = useMemo(() => sortSensors(sensors, now), [sensors, now]);
  const coverage = useCityCoverage();
  const [showSimulated, setShowSimulated] = useShowSimulated();
  const heat = useMemo(
    () => (coverage ? coverageHeat(coverage.cells, showSimulated) : []),
    [coverage, showSimulated],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView
        edges={["top"]}
        style={[
          styles.header,
          { backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <Text variant="title2">{TITLE}</Text>
      </SafeAreaView>
      <SensorMap
        sensors={sensors}
        selectedId={selectedId}
        onSelect={setSelectedId}
        now={now}
        style={{ height: Math.round(height * 0.42), flex: 0 }}
        heat={heat}
      />
      <ScrollView
        style={[styles.panel, { borderTopColor: colors.border }]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.panelContent}
      >
        {state.kind === "loading" && <StatusView kind="loading" message={LOADING} />}
        {state.kind === "sensors" && state.simulated && (
          <Notice message={SAMPLE_LABEL} icon="flask" />
        )}
        <SensorLegend />
        <SensorList sensors={sorted} selectedId={selectedId} now={now} onSelect={setSelectedId} />
        {coverage && coverage.cells.length > 0 && (
          <CoverageLegend
            coverage={coverage}
            showSimulated={showSimulated}
            onShowSimulated={setShowSimulated}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: space.md + space.xs,
    paddingBottom: space.sm,
    borderBottomWidth: hairline,
  },
  panel: { flex: 1, borderTopWidth: hairline },
  panelContent: { padding: space.md, gap: space.lg },
});
