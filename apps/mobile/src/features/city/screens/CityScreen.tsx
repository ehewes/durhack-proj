import { StyleSheet, View } from "react-native";
import { MapView } from "@/lib/map";
import { Screen, Text } from "@/lib/ui";

export function CityScreen() {
  return (
    <Screen>
      <Text variant="title">City sleep map</Text>
      <Text>
        Each Observatory noise sensor, shaded by an indicative estimate of residents highly sleep
        disturbed.
      </Text>
      <View style={styles.map}>
        <MapView />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ map: { height: 360 } });
