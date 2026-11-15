import type { HotelScore } from "@kip/shared/stays";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Button, radius, space, Text, useColors } from "@/lib/ui";
import {
  BOOKING_ACTION,
  BOOKING_NOTE,
  ESTIMATE_LABEL,
  NO_SENSORS,
  SIMULATED_NIGHTS,
  SOURCES_TITLE,
} from "../copy";
import { breakdownRows, worksPenalty } from "../model";

type Props = {
  hotel: HotelScore;
  rank: number;
  selected: boolean;
  onPress: () => void;
  onLayoutY?: (y: number) => void;
};

function Breakdown({ hotel }: { hotel: HotelScore }) {
  const penalty = worksPenalty(hotel);
  const { sensors, permits, realNights } = hotel.sources;
  return (
    <View style={styles.details}>
      <Text variant="caption">{ESTIMATE_LABEL}</Text>
      {breakdownRows(hotel).map((row) => (
        <Text key={row.key} variant="caption">
          {`${row.label}: ${row.value} of 100, weight ${row.weightPct}%, ${row.points} points`}
        </Text>
      ))}
      {penalty && (
        <Text variant="caption">
          {`Works penalty: ${penalty.points} points lost to ${penalty.permits} ${penalty.permits === 1 ? "permit" : "permits"} overlapping your dates.`}
        </Text>
      )}
      {hotel.simulated && <Text variant="caption">{SIMULATED_NIGHTS}</Text>}
      <Text variant="caption">{SOURCES_TITLE}</Text>
      {sensors.length === 0 && <Text variant="caption">{NO_SENSORS}</Text>}
      {sensors.map((sensor) => (
        <Text key={sensor.id} variant="caption">
          {`Sensor ${sensor.id}, ${Math.round(sensor.distanceM)} m away`}
        </Text>
      ))}
      {permits.map((permit) => (
        <Text key={permit.ref} variant="caption">
          {`Permit ${permit.ref}, ${Math.round(permit.distanceM)} m away${permit.nightWork ? ", night work" : ""}${permit.overlapsStay ? ", overlaps your dates" : ""}`}
        </Text>
      ))}
      <Text variant="caption">
        {`${realNights.count} ${realNights.simulated ? "simulated " : ""}nights nearby`}
      </Text>
      <Text variant="caption">{BOOKING_NOTE}</Text>
      <Button
        label={BOOKING_ACTION}
        variant="secondary"
        onPress={() => void Linking.openURL(hotel.bookingUrl)}
      />
    </View>
  );
}

/** One ranked hotel. Selecting it expands the per-input breakdown, the same hotel the map outlines. */
export function HotelRow({ hotel, rank, selected, onPress, onLayoutY }: Props) {
  const colors = useColors();
  const price = hotel.pricePerNightGbp ? `, £${hotel.pricePerNightGbp} a night` : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${rank}. ${hotel.name}, estimated score ${hotel.score}${price}`}
      onPress={onPress}
      onLayout={(event) => onLayoutY?.(event.nativeEvent.layout.y)}
      style={[
        styles.row,
        { borderColor: selected ? colors.accent : colors.border, backgroundColor: colors.surface },
      ]}
    >
      <View style={styles.head}>
        <Text variant="caption">{String(rank)}</Text>
        <View style={styles.name}>
          <Text>{hotel.name}</Text>
          <Text variant="caption">{`Estimate${price}${hotel.simulated ? ", includes simulated data" : ""}`}</Text>
        </View>
        <Text>{String(hotel.score)}</Text>
      </View>
      {selected && <Breakdown hotel={hotel} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { flex: 1, gap: 2 },
  details: { gap: space.xs },
});
