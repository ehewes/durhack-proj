import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { useTRPC } from "@/lib/trpc";
import { Button, Card, Text } from "@/lib/ui";
import { briefingAudioSrc } from "../audio-url";
import {
  BRIEFING_AUDIO_ERROR,
  BRIEFING_ERROR,
  BRIEFING_LOADING,
  BRIEFING_TITLE,
  PLAY_BRIEFING,
  PLAY_BRIEFING_AGAIN,
  TRY_AGAIN,
} from "../copy";
import { playBriefing, stopBriefing } from "../playback";

/** Shows a night's briefing text and plays its audio (system player on iOS, in-page on web). */
export function BriefingPlayer({ nightId }: { nightId: string }) {
  const trpc = useTRPC();
  const briefing = useQuery({ ...trpc.briefing.get.queryOptions({ nightId }), retry: false });
  const [played, setPlayed] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => stopBriefing, []);

  if (briefing.isPending) return <Text>{BRIEFING_LOADING}</Text>;
  if (briefing.isError) {
    return (
      <Card>
        <Text>{BRIEFING_ERROR}</Text>
        <Button label={TRY_AGAIN} variant="secondary" onPress={() => void briefing.refetch()} />
      </Card>
    );
  }

  const { text, audioUrl } = briefing.data;
  const play = () => {
    playBriefing(briefingAudioSrc(apiUrl(), audioUrl)).then(
      () => {
        setPlayed(true);
        setFailed(false);
      },
      () => setFailed(true),
    );
  };

  return (
    <Card>
      <Text variant="title">{BRIEFING_TITLE}</Text>
      <Text>{text}</Text>
      <Button label={played ? PLAY_BRIEFING_AGAIN : PLAY_BRIEFING} onPress={play} />
      {failed ? <Text>{BRIEFING_AUDIO_ERROR}</Text> : null}
    </Card>
  );
}
