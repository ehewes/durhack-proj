import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { MAP_CANVAS, MAP_EDGE, MAP_INK } from "./style";

/**
 * Stands in for the map on web and iOS when its public token is missing. It keeps the light map
 * canvas, so the message and any text drawn over the map read the same in light and dark mode.
 */
export function MissingMapToken({
  message,
  style,
}: {
  message: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.box, style]}>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    minHeight: 240,
    padding: 16,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: MAP_EDGE,
    backgroundColor: MAP_CANVAS,
  },
  message: { color: MAP_INK, fontSize: 16, lineHeight: 24 },
});
