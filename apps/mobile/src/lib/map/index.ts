// Metro picks Map.web.tsx on web and Map.native.tsx on iOS. TypeScript resolves the native
// file through `moduleSuffixes`; both files are type-checked.
export { MapView } from "./Map";
export { NEWCASTLE, OSM_ATTRIBUTION, osmStyle } from "./style";
export type { MapProps } from "./types";
