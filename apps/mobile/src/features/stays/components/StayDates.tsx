import { StyleSheet, View } from "react-native";
import { Button, space, Text } from "@/lib/ui";
import { addDays, dateLabel, MAX_NIGHTS } from "../model";

type Props = {
  checkIn: string;
  nights: number;
  onChange: (next: { checkIn: string; nights: number }) => void;
};

/** Check-in and length of stay, moved a step at a time so no date is ever typed. */
export function StayDates({ checkIn, nights, onChange }: Props) {
  const checkOut = addDays(checkIn, nights);
  return (
    <View style={styles.root}>
      <Text>{`${dateLabel(checkIn)} to ${dateLabel(checkOut)}, ${nights} ${nights === 1 ? "night" : "nights"}`}</Text>
      <View style={styles.row}>
        <Button
          label="Check in a day earlier"
          variant="secondary"
          onPress={() => onChange({ checkIn: addDays(checkIn, -1), nights })}
        />
        <Button
          label="Check in a day later"
          variant="secondary"
          onPress={() => onChange({ checkIn: addDays(checkIn, 1), nights })}
        />
      </View>
      <View style={styles.row}>
        <Button
          label="Stay one night less"
          variant="secondary"
          disabled={nights <= 1}
          onPress={() => onChange({ checkIn, nights: nights - 1 })}
        />
        <Button
          label="Stay one night more"
          variant="secondary"
          disabled={nights >= MAX_NIGHTS}
          onPress={() => onChange({ checkIn, nights: nights + 1 })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
