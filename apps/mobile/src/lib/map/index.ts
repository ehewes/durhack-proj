// Metro picks Map.web.tsx on web and Map.native.tsx on iOS. TypeScript resolves the native
// file through `moduleSuffixes`; both files are type-checked. Feature code imports this module
// and does not import mapbox-gl or MapLibre.
export { MapView } from "./Map";
export { MAPBOX_STYLE, NEWCASTLE, OSM_ATTRIBUTION, osmStyle } from "./style";
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
