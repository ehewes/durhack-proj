import { Pressable, StyleSheet, View } from "react-native";
import { hairline, haptics, Icon, Section, space, Text, useColors } from "@/lib/ui";
import { DATES_TITLE } from "../copy";
import { addDays, dateLabel, MAX_NIGHTS } from "../model";

type Props = {
  checkIn: string;
  nights: number;
  onChange: (next: { checkIn: string; nights: number }) => void;
};

/** A minus/plus pair, 44pt each, like a UIStepper. */
function Stepper({
  label,
  onMinus,
  onPlus,
  minusDisabled = false,
  plusDisabled = false,
}: {
  label: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  const colors = useColors();
  const half = (name: "minus" | "plus", onPress: () => void, disabled: boolean, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.half, pressed && { backgroundColor: colors.border }]}
    >
      <Icon name={name} size={15} tone={disabled ? "textTertiary" : "text"} weight="medium" />
    </Pressable>
  );
  return (
    <View style={[styles.stepper, { backgroundColor: colors.fill }]}>
      {half("minus", onMinus, minusDisabled, `${label}, less`)}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      {half("plus", onPlus, plusDisabled, `${label}, more`)}
    </View>
  );
}

/** Check-in and length of stay, moved a step at a time so no date is ever typed. */
export function StayDates({ checkIn, nights, onChange }: Props) {
  const checkOut = addDays(checkIn, nights);
  return (
    <Section title={DATES_TITLE} footer={`Check out ${dateLabel(checkOut)}`}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="footnote">Check in</Text>
          <Text numeric>{dateLabel(checkIn)}</Text>
        </View>
        <Stepper
          label="Check-in date"
          onMinus={() => onChange({ checkIn: addDays(checkIn, -1), nights })}
          onPlus={() => onChange({ checkIn: addDays(checkIn, 1), nights })}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="footnote">Length of stay</Text>
          <Text numeric>{`${nights} ${nights === 1 ? "night" : "nights"}`}</Text>
        </View>
        <Stepper
          label="Nights"
          minusDisabled={nights <= 1}
          plusDisabled={nights >= MAX_NIGHTS}
          onMinus={() => onChange({ checkIn, nights: nights - 1 })}
          onPlus={() => onChange({ checkIn, nights: nights + 1 })}
        />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.md,
  },
  text: { flex: 1, gap: 1 },
  stepper: { flexDirection: "row", alignItems: "center", borderRadius: 8, overflow: "hidden" },
  half: { width: 48, height: 36, alignItems: "center", justifyContent: "center" },
  divider: { width: hairline, height: 18 },
});
