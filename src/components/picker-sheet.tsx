/**
 * The shared shell for the two vocabulary pickers — `TagPicker` (a Household's tags)
 * and `CategoryPicker` (the Rating axes). Both are the same paper bottom sheet: a
 * heading, a search field that filters, and a scrolling list of existing entries with
 * a "Create …" row when the text matches none of them.
 *
 * Keyboard handling is why this is one component. The search field autofocuses, so the
 * keyboard is up the moment the sheet opens. Rather than lift the whole sheet onto the
 * keyboard — a half-height panel floating on a grey slab — the sheet stays anchored to
 * the screen bottom, its paper running *under* the keyboard, and grows from half the
 * screen to nine-tenths as the keyboard shows, so the list keeps its room and the
 * entries stay visible while you type. `paddingBottom` tracks the keyboard so the last
 * row clears it.
 *
 * The sheet stays paper wherever it opens — over the paper Household screen and over
 * the dark Title screen both — because a Household's own vocabulary is paper, never the
 * dark TMDB register.
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type TextInputProps,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SearchField } from "./search-field";
import { Eyebrow, Meta } from "./text";
import { accent, font, ink } from "@/theme";

export function PickerSheet({
  visible,
  heading,
  note,
  query,
  onChangeText,
  placeholder,
  autoCapitalize,
  searchAccessibilityLabel,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  heading: string;
  note?: string;
  query: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoCapitalize: TextInputProps["autoCapitalize"];
  searchAccessibilityLabel: string;
  onClose: () => void;
  /** The scroll content — the "Create …" row, the matches, any empty/loading state. */
  children: ReactNode;
  /** Pinned below the list, above the keyboard — the multi-select "Save" action. */
  footer?: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const [kb, setKb] = useState(0);
  const kbHeight = useSharedValue(0);
  const raised = useSharedValue(0);

  useEffect(() => {
    // `keyboardWillShow` fires on iOS with the frame ahead of time; Android only has
    // the `did` events, and they still fire inside a Modal.
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    kbHeight.value = kb;
    raised.value = withTiming(kb > 0 ? 1 : 0, { duration: 200 });
  }, [kb, kbHeight, raised]);

  const sheetStyle = useAnimatedStyle(() => ({
    height: height * (0.5 + 0.4 * raised.value),
    // 40 at rest matches the old `pb-10`; grows to sit above the keyboard.
    paddingBottom: 40 + kbHeight.value * raised.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        onPress={onClose}
      >
        <Animated.View
          className="bg-paper"
          style={[
            { borderTopLeftRadius: 10, borderTopRightRadius: 10, overflow: "hidden" },
            sheetStyle,
          ]}
        >
          {/* Catches the touch so a tap on the sheet doesn't dismiss it. */}
          <Pressable className="flex-1 px-6 pt-5" onPress={() => {}}>
            <View className="mb-4 gap-1">
              <Eyebrow>{heading}</Eyebrow>
              {note ? <Meta>{note}</Meta> : null}
            </View>

            <SearchField
              value={query}
              onChangeText={onChangeText}
              placeholder={placeholder}
              autoCapitalize={autoCapitalize}
              autoFocus
              accessibilityLabel={searchAccessibilityLabel}
            />

            <ScrollView
              className="mt-4 flex-1"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? <View className="pt-3">{footer}</View> : null}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export function PickerRow({
  label,
  trailing,
  added,
  accent: isAccent,
  disabled,
  onPress,
}: {
  label: string;
  trailing?: string;
  /** Already applied/active — shows the quiet checkmark pill instead of a tappable row. */
  added?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      className="flex-row items-center justify-between border-b border-hairline py-3 active:opacity-60"
    >
      <Text
        className="type-body"
        style={{ color: added ? ink.muted : isAccent ? accent.forest : ink.primary }}
      >
        {label}
      </Text>
      {added ? (
        <AddedPill />
      ) : trailing ? (
        <Text className="type-meta-small text-ink-faint">{trailing}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Quiet sibling of the round "in your library" badge — same forest + checkmark, but a
 * low-contrast tinted pill, since "already on the list" is a state to note, not an
 * action to celebrate.
 */
function AddedPill() {
  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
      style={{ backgroundColor: "rgba(63,91,74,0.12)" }}
      accessibilityLabel="Added"
    >
      <Text style={{ fontFamily: font.uiBold, fontSize: 10, lineHeight: 12, color: accent.forest }}>
        ✓
      </Text>
      <Text
        style={{
          fontFamily: font.uiMedium,
          fontSize: 11,
          letterSpacing: 0.3,
          color: accent.forest,
        }}
      >
        Added
      </Text>
    </View>
  );
}
