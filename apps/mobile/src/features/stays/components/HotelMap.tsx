import type { HotelScore } from "@kip/shared/stays";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { MapView, NEWCASTLE } from "@/lib/map";
import { hotelFeatures, hotelPosition } from "../model";

const OVERVIEW_ZOOM = 13;
const FOCUS_ZOOM = 15;

type Props = {
  hotels: readonly HotelScore[];
  selectedId: string | null;
  onSelect: (hotelId: string | null) => void;
  style?: StyleProp<ViewStyle>;
};

/** One marker per ranked hotel, shaded by score. The selected hotel is outlined and centred. */
export function HotelMap({ hotels, selectedId, onSelect, style }: Props) {
  const features = useMemo(() => hotelFeatures(hotels), [hotels]);
  const selected = hotels.find((hotel) => hotel.hotelId === selectedId);
  const center = useMemo(() => (selected ? hotelPosition(selected) : NEWCASTLE), [selected]);
  return (
    <MapView
      style={style}
      features={features}
      center={center}
      zoom={selected ? FOCUS_ZOOM : OVERVIEW_ZOOM}
      selectedId={selectedId}
      onSelect={(selection) => onSelect(selection?.id ?? null)}
    />
  );
}
