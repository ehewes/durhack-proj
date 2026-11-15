import type { TravellerProfile } from "@kip/shared/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { hairline, Notice, radius, StatusView, space, Text, useColors } from "@/lib/ui";
import { HotelMap } from "../components/HotelMap";
import { HotelRow } from "../components/HotelRow";
import { ProfilePicker } from "../components/ProfilePicker";
import { StayDates } from "../components/StayDates";
import {
  EMPTY,
  EMPTY_ACTION,
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
  const { height } = useWindowDimensions();
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
  const listY = useRef(0);
  const rowY = useRef(new Map<string, number>());
  const scrollTo = useCallback((id: string) => {
    const y = rowY.current.get(id);
    // Rows report y inside the list; the list sits under its title in the scroll content.
    if (y !== undefined) panel.current?.scrollTo({ y: listY.current + y, animated: true });
  }, []);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  useEffect(() => {
    if (selectedId !== null) scrollTo(selectedId);
  }, [selectedId, scrollTo]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView
        edges={["top"]}
        style={[
          styles.header,
          { backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <Text variant="title2">{TITLE}</Text>
        <Text variant="footnote">{INTRO}</Text>
      </SafeAreaView>
      <HotelMap
        hotels={hotels}
        selectedId={selectedId}
        onSelect={setPickedId}
        style={{ height: Math.round(height * 0.42), flex: 0 }}
      />
      <ScrollView
        ref={panel}
        style={[styles.panel, { borderTopColor: colors.border }]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.panelContent}
      >
        {state.kind === "ranked" && state.sample && <Notice message={SAMPLE_LABEL} icon="flask" />}
        {state.kind === "ranked" && state.leavesOutStation && (
          <Notice message={SAMPLE_STATION_NOTE} />
        )}
        <View style={styles.group}>
          <Text variant="footnote" accessibilityRole="header" style={styles.groupTitle}>
            {PROFILE_TITLE}
          </Text>
          <ProfilePicker profile={profile} onChange={setProfile} />
        </View>
        <StayDates checkIn={stay.checkIn} nights={stay.nights} onChange={setStay} />
        <View
          style={styles.group}
          onLayout={(event) => {
            listY.current = event.nativeEvent.layout.y;
          }}
        >
          <Text variant="footnote" accessibilityRole="header" style={styles.groupTitle}>
            {LIST_TITLE}
          </Text>
          {state.kind === "loading" ? <StatusView kind="loading" message={LOADING} /> : null}
          {state.kind === "ranked" && hotels.length === 0 ? (
            <StatusView
              kind="empty"
              title={EMPTY}
              message={NO_SELECTION}
              actionLabel={EMPTY_ACTION}
              onAction={() => setStay({ checkIn: DEFAULT_CHECK_IN, nights: DEFAULT_NIGHTS })}
            />
          ) : null}
          {hotels.length > 0 ? (
            <View
              style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {hotels.map((hotel, index) => (
                <HotelRow
                  key={hotel.hotelId}
                  hotel={hotel}
                  rank={index + 1}
                  separated={index > 0}
                  selected={hotel.hotelId === selectedId}
                  onPress={() => setPickedId(hotel.hotelId === selectedId ? null : hotel.hotelId)}
                  onLayoutY={(y) => {
                    rowY.current.set(hotel.hotelId, y);
                    // The old selection collapsing moves this row; follow it to its new place.
                    if (hotel.hotelId === selectedRef.current) scrollTo(hotel.hotelId);
                  }}
                />
              ))}
            </View>
          ) : null}
          {hotels.length > 0 && selectedId === null ? (
            <Text variant="footnote" style={styles.groupTitle}>
              {NO_SELECTION}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: space.md + space.xs,
    paddingBottom: space.sm,
    gap: 2,
    borderBottomWidth: hairline,
  },
  panel: { flex: 1, borderTopWidth: hairline },
  panelContent: { padding: space.md, gap: space.lg },
  group: { gap: space.xs + 2 },
  groupTitle: { paddingHorizontal: space.md },
  list: { borderRadius: radius.md, borderWidth: hairline, overflow: "hidden" },
});
