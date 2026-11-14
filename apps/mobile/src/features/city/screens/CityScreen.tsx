import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MAP_INK, MapView } from "@/lib/map";
import { space, type as typeScale } from "@/lib/ui";

/** The Kip Map: Newcastle full screen, with the title floating over it. */
export function CityScreen() {
  const focused = useIsFocused();
  return (
    <View style={styles.root}>
      {/* The map stays light in dark mode, so the status bar over it needs dark content. */}
      {focused ? <StatusBar style="dark" /> : null}
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
  // Map ink, not the theme's text colour: the map, and its missing-token stand-in, stay light.
  title: { color: MAP_INK },
});
