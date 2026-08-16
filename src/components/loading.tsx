/**
 * The screen shown while the app works out where to send you.
 *
 * Deliberately near-empty. It appears for a frame or two on a warm start and for as
 * long as the first sync takes on a fresh install, and anything more elaborate would
 * flash. The ground is the paper colour so it reads as continuous with the splash.
 */

import { View } from "react-native";
import { Meta } from "./text";

export function Loading({ note }: { note?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-paper">
      {note ? <Meta>{note}</Meta> : null}
    </View>
  );
}
