import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button } from "./Button";
import { Text } from "./Text";
import { space, useColors } from "./theme";

type Props =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string; retryLabel?: string; onRetry?: () => void }
  | { kind: "empty"; title: string; message: string; actionLabel?: string; onAction?: () => void };

/** One look for loading, error and empty states: text first, one clear next action. */
export function StatusView(props: Props) {
  const colors = useColors();
  if (props.kind === "loading") {
    return (
      <View style={styles.inline} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.textSecondary} />
        <Text variant="subheadline" tone="secondary">
          {props.message}
        </Text>
      </View>
    );
  }
  if (props.kind === "error") {
    return (
      <View style={styles.block} accessibilityLiveRegion="polite">
        <Text variant="subheadline">{props.message}</Text>
        {props.onRetry ? (
          <Button
            label={props.retryLabel ?? "Try again"}
            variant="secondary"
            onPress={props.onRetry}
          />
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.block}>
      <Text variant="headline">{props.title}</Text>
      <Text variant="subheadline" tone="secondary">
        {props.message}
      </Text>
      {props.actionLabel && props.onAction ? (
        <Button label={props.actionLabel} variant="secondary" onPress={props.onAction} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  block: { gap: space.sm, paddingVertical: space.sm },
});
