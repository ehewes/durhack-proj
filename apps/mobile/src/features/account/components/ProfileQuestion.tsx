import type { TravellerProfile } from "@kip/shared/domain";
import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import { hairline, space, useColors } from "@/lib/ui";
import { PROFILE_HEADING, PROFILE_OPTIONS } from "../copy";
import { Choice } from "./Choice";

type Props = {
  value: TravellerProfile | null;
  onChange: (profile: TravellerProfile) => void;
  disabled?: boolean;
};

/** The Quiet Stays profile: one of four, each with what Kip ranks first. Sits inside a Section. */
export function ProfileQuestion({ value, onChange, disabled = false }: Props) {
  const colors = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={PROFILE_HEADING}>
      {PROFILE_OPTIONS.map((option, i) => (
        <Fragment key={option.profile}>
          {i > 0 ? (
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
          ) : null}
          <Choice
            label={option.label}
            detail={option.detail}
            selected={value === option.profile}
            onPress={() => onChange(option.profile)}
            disabled={disabled}
          />
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  separator: { height: hairline, marginLeft: space.md },
});
