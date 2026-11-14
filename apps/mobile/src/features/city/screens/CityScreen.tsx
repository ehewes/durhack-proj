import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MAP_INK, MapView } from "@/lib/map";
import { space, type as typeScale } from "@/lib/ui";

/** The Kip Map: Newcastle full screen, with the title floating over it. */
export function CityScreen() {
  return (
    <View style={styles.root}>
      <MapView style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Text style={[typeScale.title, styles.title]}>Kip Map</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // The title floats over the map and lets touches through to it.
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.md,
    pointerEvents: "box-none",
  },
  // Map ink, not the theme's text colour: the basemap stays light in dark mode too.
  title: { color: MAP_INK },
});
