import { Link } from "expo-router";
import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, ScreenTitle } from "@/components/text";
import { authErrorMessage, signIn } from "@/lib/auth/actions";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn({ email, password });
      // No navigation here. The session listener redirects, and doing it twice races.
    } catch (cause) {
      setError(authErrorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-8 py-12">
        <View className="gap-2">
          <Eyebrow>Movie night, settled</Eyebrow>
          <ScreenTitle>Jar</ScreenTitle>
        </View>

        <View className="gap-6">
          <Field
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
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={error ?? undefined}
          />
        </View>

        <View className="gap-4">
          <Button
            label="Sign in"
            onPress={submit}
            loading={busy}
            disabled={!email || !password}
          />

          <View className="flex-row items-center justify-center gap-1">
            <Body>New here?</Body>
            <Link href="/sign-up" className="type-body text-navy">
              Make an account
            </Link>
          </View>
        </View>
      </View>
    </Screen>
  );
}
