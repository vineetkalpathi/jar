/**
 * A labelled text field.
 *
 * Underline rather than a box: a filled input on paper reads as a form, and the design
 * language wants edges, not containers. The label sits above in tracked caps, which is
 * one of the two places the eyebrow style is allowed.
 *
 * On focus it asks the enclosing `Screen` (if it has a scroll body) to lift it clear of
 * the keyboard with room to spare, so an action row just beneath — the filter editor's
 * Add / Update — isn't left hidden behind the keyboard.
 */

import { forwardRef, useRef } from "react";
import {
  findNodeHandle,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { ink } from "@/theme";
import { useScreenScroll } from "./screen";

type Props = Omit<TextInputProps, "className"> & {
  /** Omitted: no label row at all — for a field packed into a tighter layout. */
  label?: string;
  /** Shown beneath in rust. Also marks the underline. */
  error?: string;
  /** Shown beneath in muted ink when there is no error. */
  hint?: string;
};

export const Field = forwardRef<TextInput, Props>(function Field(
  { label, error, hint, onFocus, ...props },
  ref,
) {
  const screenScroll = useScreenScroll();
  const innerRef = useRef<TextInput | null>(null);

  const setRef = (node: TextInput | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: TextInput | null }).current = node;
  };

  const handleFocus: TextInputProps["onFocus"] = (e) => {
    onFocus?.(e);
    if (!screenScroll) return;
    // A beat, so the keyboard frame is known before we measure against it.
    setTimeout(() => screenScroll.revealInput(findNodeHandle(innerRef.current)), 50);
  };

  return (
    <View className="gap-1.5">
      {label ? <Text className="type-eyebrow text-ink-muted">{label}</Text> : null}

      <TextInput
        ref={setRef}
        placeholderTextColor={ink.faint}
        // Warm, not the platform blue — the amber is reserved and the forest is the
        // one accent that means "active" outside the draw.
        selectionColor={ink.secondary}
        className={`
          type-body pb-2 text-ink border-b
          ${error ? "border-rust" : "border-hairline"}
        `}
        {...props}
        onFocus={handleFocus}
      />

      {error ? (
        <Text className="type-meta-small text-rust">{error}</Text>
      ) : hint ? (
        <Text className="type-meta-small text-ink-muted">{hint}</Text>
      ) : null}
    </View>
  );
});
