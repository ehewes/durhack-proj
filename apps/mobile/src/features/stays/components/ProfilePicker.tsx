import { TRAVELLER_PROFILES, type TravellerProfile } from "@kip/shared/domain";
import { Pressable, StyleSheet, View } from "react-native";
import { radius, space, Text, useColors } from "@/lib/ui";
import { PROFILE_LABEL } from "../copy";

type Props = {
  profile: TravellerProfile;
  onChange: (profile: TravellerProfile) => void;
};

/** Four profiles, one selected. The ranking below re-sorts when this changes. */
export function ProfilePicker({ profile, onChange }: Props) {
  const colors = useColors();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {TRAVELLER_PROFILES.map((option) => {
        const selected = option === profile;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[
              styles.option,
              {
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.surface : colors.background,
              },
            ]}
          >
            <Text>{PROFILE_LABEL[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: "center",
  },
});
