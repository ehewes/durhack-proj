// Metro picks Map.web.tsx (Mapbox GL JS) on web and Map.native.tsx (@rnmapbox/maps) on iOS.
// TypeScript resolves the native file through `moduleSuffixes`; both files are type-checked.
// Feature code imports this module and does not import either Mapbox SDK.
export { MapView } from "./Map";
export { MAPBOX_STYLE, NEWCASTLE } from "./style";
export type {
  MapCamera,
  MapFeature,
  MapFeatureCollection,
  MapFeatureProperties,
  MapGeometry,
  MapPosition,
  MapProps,
  MapSelection,
} from "./types";
