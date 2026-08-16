import { useQuery } from "@powersync/react";
import { Link, router } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, Meta, ScreenTitle } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { households, users, type AppUserRow } from "@/lib/db";

/**
 * The fork after signing up: start a household, or join one.
 *
 * Also the one screen that surfaces a join which never resolved — a membership row with
 * no Household behind it. It is left visible rather than cleaned up automatically,
 * because on a slow connection the same state is simply "not yet".
 */
export default function Welcome() {
  const userId = useUserId();

  const { data: user } = useQuery<AppUserRow>(users.USER_BY_ID, [userId]);
  const { data: pending } = useQuery<{ household_id: string }>(
    households.PENDING_HOUSEHOLD_IDS,
    [userId],
  );

  const name = user[0]?.display_name;

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-8 py-12">
        <View className="gap-2">
          <Eyebrow>{name ? `Hello, ${name}` : "Hello"}</Eyebrow>
          <ScreenTitle>Who do you watch with?</ScreenTitle>
          <Body>
            A household is any group who watch together — a family, a couple, a friend
            group. It holds the library you draw from.
          </Body>
        </View>

        <View className="gap-3">
          <Button
            label="Start a household"
            onPress={() => router.push("/create-household")}
          />
          <Button
            label="Join one"
            variant="secondary"
            onPress={() => router.push("/join-household")}
          />
        </View>

        {pending.length > 0 ? (
          <View className="gap-1 border-t border-hairline pt-4">
            <Meta>
              {pending.length === 1
                ? "You joined a household that hasn't arrived yet."
                : `${pending.length} households you joined haven't arrived yet.`}
            </Meta>
            <Meta>
              It'll appear once you're online. If the code was wrong, it never will —
              you can leave and try again.
            </Meta>
            <Link href="/join-household" className="type-meta text-navy">
              Try another code
            </Link>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
