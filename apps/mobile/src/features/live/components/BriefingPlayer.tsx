import { useEffect, useState } from "react";
import { Text as RNText } from "react-native";
import { Button, Card, Text, useColors } from "@/lib/ui";
import {
  BRIEFING_TITLE,
  BRIEFING_UNAVAILABLE,
  BRIEFING_WAITING,
  BRIEFING_WEB_ONLY,
  PLAY_BRIEFING,
  PLAY_BRIEFING_AGAIN,
} from "../copy";
import { briefingPlaybackSupported, playBriefing, stopBriefing } from "../playback";
import { room } from "./room";

/** Plays `briefingAudioUrl` from the live event. On iOS, points at the web dashboard. */
export function BriefingPlayer({ url }: { url: string | null }) {
  const colors = useColors();
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url || !briefingPlaybackSupported()) {
      stopBriefing();
      setPlaying(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    playBriefing(url).then(
      () => {
        if (!cancelled) {
          setPlaying(true);
          setFailed(false);
        }
      },
      () => {
        if (!cancelled) {
          setPlaying(false);
          setFailed(true);
        }
      },
    );
    return () => {
      cancelled = true;
      stopBriefing();
    };
  }, [url]);

  if (!url) return <Text>{BRIEFING_WAITING}</Text>;
  if (!briefingPlaybackSupported()) return <Text>{BRIEFING_WEB_ONLY}</Text>;

  const replay = () => {
    playBriefing(url).then(
      () => {
        setPlaying(true);
        setFailed(false);
      },
      () => {
        setPlaying(false);
        setFailed(true);
      },
    );
  };

  return (
    <Card>
      <RNText style={[room.detail, { color: colors.text, fontWeight: "600" }]}>
        {BRIEFING_TITLE}
      </RNText>
      <Button label={playing ? PLAY_BRIEFING_AGAIN : PLAY_BRIEFING} onPress={replay} />
      {failed ? <Text>{BRIEFING_UNAVAILABLE}</Text> : null}
    </Card>
  );
}
