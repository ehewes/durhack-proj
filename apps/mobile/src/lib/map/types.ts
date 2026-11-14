import type { StyleProp, ViewStyle } from "react-native";

/** [longitude, latitude] */
export type MapPosition = [number, number];

export type MapPointGeometry = {
  type: "Point";
  coordinates: MapPosition;
};

export type MapLineGeometry = {
  type: "LineString";
  coordinates: MapPosition[];
};

/** Rings are [longitude, latitude] positions. The first ring is the outer boundary. */
export type MapPolygonGeometry = {
  type: "Polygon";
  coordinates: MapPosition[][];
};

export type MapGeometry = MapPointGeometry | MapLineGeometry | MapPolygonGeometry;

export type MapFeatureProperties = Record<string, string | number | boolean | null>;

/**
 * One drawn feature. `id` is what selection reports.
 * Feature code builds these values. It does not import Mapbox or MapLibre.
 */
export type MapFeature = {
  type: "Feature";
  id: string;
  geometry: MapGeometry;
  properties?: MapFeatureProperties | null;
};

export type MapFeatureCollection = {
  type: "FeatureCollection";
  features: MapFeature[];
};

export type MapCamera = {
  center: MapPosition;
  zoom: number;
};

export type MapSelection = {
  id: string;
};

export type MapProps = {
  /** [longitude, latitude]; defaults to Newcastle */
  center?: MapPosition;
  zoom?: number;
  style?: StyleProp<ViewStyle>;
  /** Points, lines and polygons drawn on top of the basemap. */
  features?: MapFeatureCollection;
  /** Cluster point features. Lines and polygons are never clustered. */
  cluster?: boolean;
  /** Feature id to draw as selected. */
  selectedId?: string | null;
  onSelect?: (selection: MapSelection | null) => void;
  onCameraChange?: (camera: MapCamera) => void;
};
