import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { hairline, radius, space, useColors } from "./theme";

type Props = {
  /** Short label above the group, sentence case. */
  title?: string;
  /** Explanation under the group. */
  footer?: ReactNode;
  /** Pad the group's content (for charts and free text) instead of letting rows reach the edges. */
  inset?: boolean;
  children: ReactNode;
};

/** An inset-grouped section: white surface, rounded corners, hairline separators between rows. */
export function Section({ title, footer, inset = false, children }: Props) {
  const colors = useColors();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.root}>
      {title ? (
        <Text variant="footnote" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      ) : null}
      <View
        style={[
          styles.group,
          inset && styles.inset,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {inset
          ? children
          : items.map((child, index) => (
              <Fragment key={child.key ?? index}>
                {index > 0 ? (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                ) : null}
                {child}
              </Fragment>
            ))}
      </View>
      {typeof footer === "string" ? (
        <Text variant="footnote" style={styles.footer}>
          {footer}
        </Text>
      ) : (
        (footer ?? null)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs + 2 },
  title: { paddingHorizontal: space.md },
  group: { borderRadius: radius.md, borderWidth: hairline, overflow: "hidden" },
  inset: { padding: space.md, gap: space.md },
  separator: { height: hairline, marginLeft: space.md },
  footer: { paddingHorizontal: space.md },
});
