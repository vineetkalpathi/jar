import { Link } from "expo-router";
import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, ScreenTitle } from "@/components/text";
import { authErrorMessage, signUp } from "@/lib/auth/actions";

export default function SignUp() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signUp({ email, password, displayName });
      if (result.status === "needs-confirmation") {
        setAwaitingConfirmation(true);
        setBusy(false);
      }
      // On "signed-in" the session listener navigates; leave `busy` set so the form
      // stays inert for the frame or two before this screen unmounts.
    } catch (cause) {
      setError(authErrorMessage(cause));
      setBusy(false);
    }
  };

  if (awaitingConfirmation) {
    return (
      <Screen>
        <View className="flex-1 justify-center gap-4">
          <Eyebrow>Almost there</Eyebrow>
          <ScreenTitle>Check your email</ScreenTitle>
          <Body>
            We sent a confirmation link to {email.trim()}. Open it, then come back and
            sign in.
          </Body>
          <Link href="/sign-in" className="type-body text-navy">
            Back to sign in
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-8 py-12">
        <View className="gap-2">
          <Eyebrow>Start here</Eyebrow>
          <ScreenTitle>Make an account</ScreenTitle>
        </View>

        <View className="gap-6">
          <Field
            label="Your name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            submitBehavior="submit"
            hint="What the rest of your household sees."
          />

          <Field
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            submitBehavior="submit"
          />

          <Field
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={error ?? undefined}
            hint="At least 6 characters."
          />
        </View>

        <View className="gap-4">
          <Button
            label="Create account"
            onPress={submit}
            loading={busy}
            disabled={!displayName.trim() || !email || !password}
          />

          <View className="flex-row items-center justify-center gap-1">
            <Body>Already have one?</Body>
            <Link href="/sign-in" className="type-body text-navy">
              Sign in
            </Link>
          </View>
        </View>
      </View>
    </Screen>
  );
}
