/**
 * Who is signed in, and what the rest of the app is allowed to assume about it.
 *
 * Supabase owns the session; this exposes it as context, keeps sync connected to match
 * it, and — importantly — distinguishes "still checking" from "signed out". Those look
 * the same in a plain null check, and treating the first as the second bounces a
 * signed-in user to the sign-in screen for a frame on every cold start.
 */

import { createContext, use, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { connectSync, disconnectAndClear } from "../db";
import { supabase } from "../db/supabase";

export type SessionState = {
  session: Session | null;
  /** True until the persisted session has been read from storage. */
  loading: boolean;
  userId: string | null;
};

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const value = use(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}

/**
 * The signed-in user's id, for code below a gate that has already established there is
 * one. Throws rather than returning null so a screen inside `(app)` can index by it
 * without a non-null assertion at every call site.
 */
export function useUserId(): string {
  const { userId } = useSession();
  if (!userId) throw new Error("useUserId called outside an authenticated route");
  return userId;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Which user the local replica currently holds. Sign-out clears it; a *different*
  // user signing in on the same device must clear it too, or the previous account's
  // rows stay readable in a replica the new session has no right to.
  const replicaUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id ?? null;

    if (!userId) {
      if (replicaUserId.current) {
        replicaUserId.current = null;
        void disconnectAndClear();
      }
      return;
    }

    if (replicaUserId.current === userId) return;

    const previous = replicaUserId.current;
    replicaUserId.current = userId;

    void (async () => {
      if (previous) await disconnectAndClear();

      // The `app_user` row is provisioned server-side (a trigger on `auth.users`, see
      // the initial migration), not here — this just waits for it to sync down. Until
      // then, screens that show a display name fall back to a name-less greeting.
      await connectSync();
    })();
  }, [session]);

  const value = useMemo(
    () => ({ session, loading, userId: session?.user.id ?? null }),
    [session, loading],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
