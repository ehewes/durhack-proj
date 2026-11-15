import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { space, Text, useColors } from "@/lib/ui";
import { CoverageLegend, SensorLegend, SensorList, SensorMap } from "../components";
import { LIST_TITLE, LOADING, SAMPLE_LABEL, TITLE } from "../copy";
import { coverageHeat } from "../coverage";
import { useCityCoverage } from "../hooks/useCityCoverage";
import { useCitySensors } from "../hooks/useCitySensors";
import { useShowSimulated } from "../hooks/useShowSimulated";
import { sortSensors } from "../sensors";

/** The Kip Map: Newcastle's sensors shaded by indicative disturbance, with a linked list. */
export function CityScreen() {
  const colors = useColors();
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
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <Text variant="title">{TITLE}</Text>
        {state.kind === "sensors" && state.simulated && (
          <Text variant="caption">{SAMPLE_LABEL}</Text>
        )}
        {state.kind === "loading" && <Text variant="caption">{LOADING}</Text>}
      </View>
      <SensorMap
        sensors={sensors}
        selectedId={selectedId}
        onSelect={setSelectedId}
        now={now}
        style={styles.map}
        heat={heat}
      />
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <SensorLegend />
        {coverage && coverage.cells.length > 0 && (
          <CoverageLegend
            coverage={coverage}
            showSimulated={showSimulated}
            onShowSimulated={setShowSimulated}
          />
        )}
        <Text variant="caption">{LIST_TITLE}</Text>
        <SensorList sensors={sorted} selectedId={selectedId} now={now} onSelect={setSelectedId} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.xs },
  map: { flex: 3 },
  panel: { flex: 2 },
  panelContent: { padding: space.md, gap: space.md },
});
