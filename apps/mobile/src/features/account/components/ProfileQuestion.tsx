import type { TravellerProfile } from "@kip/shared/domain";
import { StyleSheet, View } from "react-native";
import { space } from "@/lib/ui";
import { PROFILE_HEADING, PROFILE_OPTIONS } from "../copy";
import { Choice } from "./Choice";

type Props = {
  value: TravellerProfile | null;
  onChange: (profile: TravellerProfile) => void;
  disabled?: boolean;
};

/** The Quiet Stays profile: one of four, each with what Kip ranks first. */
export function ProfileQuestion({ value, onChange, disabled = false }: Props) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={PROFILE_HEADING} style={styles.list}>
      {PROFILE_OPTIONS.map((option) => (
        <Choice
          key={option.profile}
          label={option.label}
          detail={option.detail}
          selected={value === option.profile}
          onPress={() => onChange(option.profile)}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
});
