import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, haptics, Row, Section, StatusView, space, Text } from "@/lib/ui";
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
import type { DeleteMutation } from "../hooks/useAccount";
import { Heading } from "./Heading";

type Props = {
  remove: DeleteMutation;
  /** True while another account change saves: the delete waits for it */
  disabled: boolean;
};

/**
 * "Delete everything" behind a confirmation step. The step is inline rather than an Alert,
 * which the web build cannot show.
 */
export function DeleteEverything({ remove, disabled }: Props) {
  const [confirming, setConfirming] = useState(false);
  const busy = remove.isPending;

  return (
    <Section title={DELETE_HEADING} footer={DELETE_SOLANA}>
      <View style={styles.pad}>
        <Text variant="subheadline">{DELETE_BODY}</Text>
        {/* Stays after Cancel: a delete that stopped partway may have removed data and paused
            uploads on the server, so the user should know it did not finish. */}
        {remove.isError ? <Text tone="danger">{DELETE_ERROR}</Text> : null}
      </View>
      {confirming ? (
        <View style={styles.pad}>
          <Heading>{DELETE_CONFIRM_TITLE}</Heading>
          <Text variant="subheadline">{DELETE_CONFIRM_BODY}</Text>
          {busy ? <StatusView kind="loading" message={DELETING} /> : null}
          <Button
            label={DELETE_CONFIRM}
            variant="destructive"
            onPress={() => {
              haptics.warning();
              remove.mutate();
            }}
            disabled={busy || disabled}
          />
          <Button
            label={DELETE_CANCEL}
            variant="plain"
            onPress={() => setConfirming(false)}
            disabled={busy}
          />
        </View>
      ) : (
        <Row
          title={DELETE_BUTTON}
          tone="danger"
          leading="trash"
          onPress={disabled ? undefined : () => setConfirming(true)}
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, gap: space.sm },
});
