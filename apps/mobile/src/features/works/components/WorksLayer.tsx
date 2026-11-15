import { toLocalTime } from "@kip/shared/domain";
import type { WorksNearItem } from "@kip/shared/works";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import type { MapPosition } from "@/lib/map";
import { MapView, NEWCASTLE } from "@/lib/map";
import { useTRPC } from "@/lib/trpc";
import { Button, Card, space, Text } from "@/lib/ui";
import {
  NIGHT_NOTE,
  OMITTED_NOTE,
  WORKS_CLOSE,
  WORKS_ERROR,
  WORKS_LOADING,
  WORKS_RETRY,
} from "../copy";
import { describeWork, permitRefOfFeature, worksFeatures } from "../model";

const NO_REFS: readonly string[] = [];

export type WorksLayerProps = {
  /** [longitude, latitude]; defaults to Newcastle. Also the centre of the permit search. */
  center?: MapPosition;
  zoom?: number;
  /** Search radius in metres. */
  radiusM?: number;
  /** Inclusive Europe/London dates, `YYYY-MM-DD`. Default: today. */
  from?: string;
  to?: string;
  /** Permit references to mark, e.g. the works behind a Quiet Stay score. */
  selectedPermitRefs?: readonly string[];
  style?: StyleProp<ViewStyle>;
  onSelect?: (permitRef: string | null) => void;
};

/**
 * Roadworks on the map, with a details card for the selected permit. The same component
 * renders on web and iOS because it draws through `lib/map`.
 */
export function WorksLayer({
  center = NEWCASTLE,
  zoom,
  radiusM = 2000,
  from,
  to,
  selectedPermitRefs = NO_REFS,
  style,
  onSelect,
}: WorksLayerProps) {
  const trpc = useTRPC();
  const today = toLocalTime(new Date()).date;
  const works = useQuery({
    ...trpc.works.near.queryOptions({
      lat: center[1],
      lon: center[0],
      radiusM,
      from: from ?? to ?? today,
      to: to ?? from ?? today,
    }),
    retry: 1,
  });
  const [selected, setSelected] = useState<string | null>(null);

  const select = (ref: string | null) => {
    setSelected(ref);
    onSelect?.(ref);
  };

  const items = works.data?.works;
  const features = useMemo(
    () => (items ? worksFeatures(items, selectedPermitRefs) : undefined),
    [items, selectedPermitRefs],
  );
  const work = items?.find((w) => w.permitReferenceNumber === selected);
  useEffect(() => {
    // The selected permit left the results (new radius or dates): clear it for the parent too.
    if (selected && items && !work) {
      setSelected(null);
      onSelect?.(null);
    }
  }, [selected, items, work, onSelect]);
  const omitted = works.data
    ? works.data.omitted.absentGeometry + works.data.omitted.malformedGeometry
    : 0;

  return (
    <View style={[styles.root, style]}>
      <MapView
        style={StyleSheet.absoluteFill}
        center={center}
        zoom={zoom}
        features={features}
        selectedId={selected}
        onSelect={(selection) => select(selection ? permitRefOfFeature(selection.id) : null)}
      />
      <View style={styles.panel}>
        {works.isPending ? (
          <Card>
            <Text variant="caption">{WORKS_LOADING}</Text>
          </Card>
        ) : null}
        {works.isError ? (
          <Card>
            <Text>{WORKS_ERROR}</Text>
            <Button label={WORKS_RETRY} onPress={() => void works.refetch()} />
          </Card>
        ) : null}
        {work ? <WorkCard work={work} onClose={() => select(null)} /> : null}
        {!work && omitted > 0 ? (
          <Card>
            <Text variant="caption">{OMITTED_NOTE}</Text>
          </Card>
        ) : null}
      </View>
    </View>
  );
}

function WorkCard({ work, onClose }: { work: WorksNearItem; onClose: () => void }) {
  const details = describeWork(work);
  return (
    <Card>
      <Text variant="title">{details.title}</Text>
      {details.rows.map((row) => (
        <Text key={row.label}>{`${row.label}: ${row.value}`}</Text>
      ))}
      {details.notes.map((note) => (
        <Text key={note} variant="caption">
          {note}
        </Text>
      ))}
      <Text variant="caption">{NIGHT_NOTE}</Text>
      <Button label={WORKS_CLOSE} variant="secondary" onPress={onClose} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // The card floats over the map's lower edge and lets touches through around it.
  panel: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: space.md,
    gap: space.sm,
    pointerEvents: "box-none",
  },
});
