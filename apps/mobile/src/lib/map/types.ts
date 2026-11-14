import type { StyleProp, ViewStyle } from "react-native";

export type MapProps = {
  /** [longitude, latitude]; defaults to Newcastle */
  center?: [number, number];
  zoom?: number;
  style?: StyleProp<ViewStyle>;
};
