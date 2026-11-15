import type { TravellerProfile } from "@kip/shared/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, type ScrollViewInstance, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { space, Text, useColors } from "@/lib/ui";
import { HotelMap } from "../components/HotelMap";
import { HotelRow } from "../components/HotelRow";
import { ProfilePicker } from "../components/ProfilePicker";
import { StayDates } from "../components/StayDates";
import {
  DATES_TITLE,
  EMPTY,
  INTRO,
  LIST_TITLE,
  LOADING,
  NO_SELECTION,
  PROFILE_TITLE,
  SAMPLE_LABEL,
  SAMPLE_STATION_NOTE,
  TITLE,
} from "../copy";
import { useRank } from "../hooks/useRank";
import {
  DEFAULT_CHECK_IN,
  DEFAULT_NIGHTS,
  DEFAULT_PROFILE,
  rankInputFor,
  resolveSelection,
} from "../model";

/** Quiet Stays: hotels ranked for a traveller profile and stay dates, listed and mapped together. */
export function StaysScreen() {
  const colors = useColors();
  const [profile, setProfile] = useState<TravellerProfile>(DEFAULT_PROFILE);
  const [stay, setStay] = useState({ checkIn: DEFAULT_CHECK_IN, nights: DEFAULT_NIGHTS });
  const [pickedId, setPickedId] = useState<string | null>(null);
  const input = useMemo(
    () => rankInputFor(profile, stay.checkIn, stay.nights),
    [profile, stay.checkIn, stay.nights],
  );
  const state = useRank(input);
  const hotels = useMemo(() => (state.kind === "ranked" ? state.result.hotels : []), [state]);
  // Derived, so a hotel that leaves the result can never stay selected.
  const selectedId = resolveSelection(hotels, pickedId);

  const panel = useRef<ScrollViewInstance>(null);
  const rowY = useRef(new Map<string, number>());
  useEffect(() => {
    const y = selectedId === null ? undefined : rowY.current.get(selectedId);
    if (y !== undefined) panel.current?.scrollTo({ y, animated: true });
  }, [selectedId]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <Text variant="title">{TITLE}</Text>
        <Text variant="caption">{INTRO}</Text>
        {state.kind === "ranked" && state.sample && <Text variant="caption">{SAMPLE_LABEL}</Text>}
        {state.kind === "ranked" && state.leavesOutStation && (
          <Text variant="caption">{SAMPLE_STATION_NOTE}</Text>
        )}
        {state.kind === "loading" && <Text variant="caption">{LOADING}</Text>}
      </View>
      <HotelMap hotels={hotels} selectedId={selectedId} onSelect={setPickedId} style={styles.map} />
      <ScrollView ref={panel} style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Text variant="caption">{PROFILE_TITLE}</Text>
        <ProfilePicker profile={profile} onChange={setProfile} />
        <Text variant="caption">{DATES_TITLE}</Text>
        <StayDates checkIn={stay.checkIn} nights={stay.nights} onChange={setStay} />
        <Text variant="caption">{LIST_TITLE}</Text>
        {state.kind === "ranked" && hotels.length === 0 && <Text variant="caption">{EMPTY}</Text>}
        {hotels.length > 0 && selectedId === null && <Text variant="caption">{NO_SELECTION}</Text>}
        {hotels.map((hotel, index) => (
          <HotelRow
            key={hotel.hotelId}
            hotel={hotel}
            rank={index + 1}
            selected={hotel.hotelId === selectedId}
            onPress={() => setPickedId(hotel.hotelId === selectedId ? null : hotel.hotelId)}
            onLayoutY={(y) => rowY.current.set(hotel.hotelId, y)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.xs },
  map: { flex: 2 },
  panel: { flex: 3 },
  panelContent: { padding: space.md, gap: space.md },
});
