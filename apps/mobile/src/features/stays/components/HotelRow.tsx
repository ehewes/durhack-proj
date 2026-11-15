import type { HotelScore } from "@kip/shared/stays";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Button, hairline, haptics, Icon, space, Text, useColors } from "@/lib/ui";
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
  /** Draw a separator above this row (every row but the first). */
  separated?: boolean;
};

function Breakdown({ hotel }: { hotel: HotelScore }) {
  const colors = useColors();
  const penalty = worksPenalty(hotel);
  const { sensors, permits, realNights } = hotel.sources;
  return (
    <View style={[styles.details, { borderTopColor: colors.separator }]}>
      <Text variant="footnote">{ESTIMATE_LABEL}</Text>
      {breakdownRows(hotel).map((row) => (
        <View key={row.key} style={styles.input}>
          <View style={styles.inputHead}>
            <Text variant="subheadline">{row.label}</Text>
            <Text variant="subheadline" numeric tone="secondary">
              {`${row.value} of 100 · ${row.weightPct}% · ${row.points} pts`}
            </Text>
          </View>
          <View
            style={[styles.track, { backgroundColor: colors.fill }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.max(0, Math.min(100, row.value))}%`,
                  backgroundColor: colors.accent,
                },
              ]}
            />
          </View>
        </View>
      ))}
      {penalty && (
        <Text variant="footnote">
          {`Works penalty: ${penalty.points} points lost to ${penalty.permits} ${penalty.permits === 1 ? "permit" : "permits"} overlapping your dates.`}
        </Text>
      )}
      {hotel.simulated && <Text variant="footnote">{SIMULATED_NIGHTS}</Text>}
      <Text variant="footnote" tone="primary" style={styles.sourcesTitle}>
        {SOURCES_TITLE}
      </Text>
      {sensors.length === 0 && <Text variant="footnote">{NO_SENSORS}</Text>}
      {sensors.map((sensor) => (
        <Text key={sensor.id} variant="footnote" numeric>
          {`Sensor ${sensor.id}, ${Math.round(sensor.distanceM)} m away`}
        </Text>
      ))}
      {permits.map((permit) => (
        <Text key={permit.ref} variant="footnote" numeric>
          {`Permit ${permit.ref}, ${Math.round(permit.distanceM)} m away${permit.nightWork ? ", night work" : ""}${permit.overlapsStay ? ", overlaps your dates" : ""}`}
        </Text>
      ))}
      <Text variant="footnote" numeric>
        {`${realNights.count} ${realNights.simulated ? "simulated " : ""}nights nearby`}
      </Text>
      <Text variant="footnote">{BOOKING_NOTE}</Text>
      <Button
        label={BOOKING_ACTION}
        variant="secondary"
        onPress={() => void Linking.openURL(hotel.bookingUrl)}
      />
    </View>
  );
}

/** One ranked hotel. Selecting it expands the per-input breakdown, the same hotel the map outlines. */
export function HotelRow({ hotel, rank, selected, onPress, onLayoutY, separated = false }: Props) {
  const colors = useColors();
  const price = hotel.pricePerNightGbp ? `, £${hotel.pricePerNightGbp} a night` : "";
  return (
    <View
      onLayout={(event) => onLayoutY?.(event.nativeEvent.layout.y)}
      style={[
        styles.row,
        separated && { borderTopWidth: hairline, borderTopColor: colors.separator },
        selected && { backgroundColor: colors.fill },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected, expanded: selected }}
        accessibilityLabel={`${rank}. ${hotel.name}, estimated score ${hotel.score}${price}`}
        onPress={() => {
          haptics.selection();
          onPress();
        }}
        style={styles.head}
      >
        <Text variant="footnote" numeric style={styles.rank}>
          {String(rank)}
        </Text>
        <View style={styles.name}>
          <Text variant="headline" numberOfLines={2}>
            {hotel.name}
          </Text>
          <Text variant="footnote">{`Estimate${price}${hotel.simulated ? ", includes simulated data" : ""}`}</Text>
        </View>
        <Text variant="title2" tone="accent" numeric>
          {String(hotel.score)}
        </Text>
        <Icon
          name={selected ? "chevron.up" : "chevron.down"}
          size={12}
          tone="textTertiary"
          weight="semibold"
        />
      </Pressable>
      {selected && <Breakdown hotel={hotel} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.md, paddingVertical: space.sm + 3, gap: space.sm },
  head: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space.md - 4 },
  rank: { width: 18 },
  name: { flex: 1, gap: 2 },
  details: { gap: space.sm, borderTopWidth: hairline, paddingTop: space.sm, marginLeft: 30 },
  input: { gap: space.xs },
  inputHead: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4 },
  sourcesTitle: { fontWeight: "600", marginTop: space.xs },
});
