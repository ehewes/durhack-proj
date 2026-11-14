import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, space, Text, useColors } from "@/lib/ui";
import {
  DELETE_BODY,
  DELETE_BUTTON,
  DELETE_CANCEL,
  DELETE_CONFIRM,
  DELETE_CONFIRM_BODY,
  DELETE_CONFIRM_TITLE,
  DELETE_ERROR,
  DELETE_HEADING,
  DELETE_SOLANA,
  DELETING,
} from "../copy";
import { useDeleteEverything } from "../hooks/useAccount";
import { Heading } from "./Heading";

/**
 * "Delete everything" behind a confirmation step. The step is inline rather than an Alert,
 * which the web build cannot show.
 */
export function DeleteEverything() {
  const colors = useColors();
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteEverything();
  const busy = remove.isPending;

  const cancel = () => {
    setConfirming(false);
    remove.reset();
  };

  return (
    <Card>
      <Heading>{DELETE_HEADING}</Heading>
      <Text>{DELETE_BODY}</Text>
      <Text variant="caption">{DELETE_SOLANA}</Text>
      {confirming ? (
        <View style={[styles.confirm, { borderTopColor: colors.border }]}>
          <Heading>{DELETE_CONFIRM_TITLE}</Heading>
          <Text>{DELETE_CONFIRM_BODY}</Text>
          {busy ? <Text variant="caption">{DELETING}</Text> : null}
          {remove.isError ? <Text>{DELETE_ERROR}</Text> : null}
          <Button label={DELETE_CONFIRM} onPress={() => remove.mutate()} disabled={busy} />
          <Button label={DELETE_CANCEL} variant="secondary" onPress={cancel} disabled={busy} />
        </View>
      ) : (
        <Button label={DELETE_BUTTON} variant="secondary" onPress={() => setConfirming(true)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: space.sm, borderTopWidth: 1, paddingTop: space.md, marginTop: space.xs },
});
