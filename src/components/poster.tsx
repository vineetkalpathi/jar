/**
 * A TMDB poster, or the placeholder for one.
 *
 * The design language's placeholder is a diagonal-striped block (CSS
 * `repeating-linear-gradient`), which React Native has no primitive for and this app has
 * no gradient library for. A flat tile with a caption is the honest substitute — and
 * moot whenever `uri` is set, which is the common case now that search and details
 * return real poster paths.
 */

import { Image } from "expo-image";
import { Text, View } from "react-native";

type Register = "paper" | "dark";

const grounds: Record<Register, string> = {
  paper: "bg-chip border-hairline",
  dark: "bg-dark-surface border-dark-hairline",
};

const captions: Record<Register, string> = {
  paper: "text-ink-faint",
  dark: "text-dark-ink-faint",
};

export function Poster({
  uri,
  width,
  height,
  register = "paper",
}: {
  uri: string | null;
  width: number;
  height: number;
  register?: Register;
}) {
  return (
    <View
      style={{ width, height }}
      className={`items-end justify-end overflow-hidden rounded-card border ${grounds[register]}`}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width, height }} contentFit="cover" />
      ) : (
        <Text className={`type-meta-small p-1 ${captions[register]}`}>TMDB</Text>
      )}
    </View>
  );
}
