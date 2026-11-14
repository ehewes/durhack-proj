import type { LiveSample } from "@kip/shared/live";
import { Text as RNText, View } from "react-native";
import { useColors } from "@/lib/ui";
import { formatLevel, levelLine, METER_CAPTION, meterFraction, WAITING_LEVEL } from "../copy";
import { meterStyle, room } from "./room";

/** Current relative dB, large enough to read from the back of the room. */
export function Meter({ db, samples }: { db: number | null; samples: readonly LiveSample[] }) {
  const colors = useColors();
  const fraction = db === null ? 0 : meterFraction(db);
  const latest = samples.at(-1);
  return (
    <View accessibilityLabel={db === null ? WAITING_LEVEL : levelLine(db)} style={meterStyle.block}>
      {db === null ? (
        <RNText style={[room.waiting, { color: colors.text }]}>{WAITING_LEVEL}</RNText>
      ) : (
        <RNText accessibilityLiveRegion="polite" style={[room.level, { color: colors.text }]}>
          {formatLevel(db)}
        </RNText>
      )}
      <RNText style={[room.unit, { color: colors.text }]}>{METER_CAPTION}</RNText>
      <View
        style={[meterStyle.track, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View
          style={{ width: `${fraction * 100}%`, height: "100%", backgroundColor: colors.accent }}
        />
      </View>
      {samples.length > 0 ? (
        <View accessibilityLabel="Recent relative dB" style={meterStyle.history}>
          {samples.map((sample) => (
            <View key={String(sample.t)} style={meterStyle.column}>
              <View
                style={{
                  height: `${Math.max(meterFraction(sample.db) * 100, 4)}%`,
                  backgroundColor: sample === latest ? colors.accent : colors.textSecondary,
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
