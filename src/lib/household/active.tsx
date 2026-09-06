/**
 * Which Household the app is currently showing.
 *
 * A User can belong to several, and almost every screen is scoped to one — the Jars
 * grid, the Library, the Log. Rather than threading an id through every route, the
 * choice is held here and persisted, so relaunching lands where the user left off.
 *
 * The stored id is treated as a hint, not a fact. It can name a Household the user has
 * since left, or one whose row has not synced to this device yet, so it is resolved
 * against live membership on every read and falls back to the first Household rather
 * than leaving the app pointed at nothing.
 *
 * ## Why the choice lives in a module, not just in the provider's state
 *
 * Creating and joining happen in `(onboarding)`, which is a sibling of `(app)` in the
 * root Stack — outside this provider, so those screens cannot call `select`. They are
 * also *above* a still-mounted `(app)`, so writing to storage alone would not be seen:
 * the provider read that key once, on mount, and is not going to read it again.
 *
 * So the current choice is module state with a subscription, and `select` is a thin
 * wrapper over `rememberHousehold`. A screen anywhere in the app can name the household
 * to land in, and the provider hears about it wherever it happens to be mounted.
 */

import { useQuery } from "@powersync/react";
import Storage from "expo-sqlite/kv-store";
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { households } from "@/lib/db";
import type { HouseholdRow } from "@/lib/db";
import { useUserId } from "@/lib/auth/session";

const STORAGE_KEY = "jar.activeHouseholdId";

let chosenId: string | null = null;
let hasRead = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Names the Household to show, from anywhere in the app — including the onboarding
 * screens, which sit outside the provider. Persisted, so it survives a relaunch.
 */
export function rememberHousehold(householdId: string) {
  chosenId = householdId;
  // A later-landing initial read must not clobber a deliberate choice.
  hasRead = true;
  void Storage.setItem(STORAGE_KEY, householdId);
  emit();
}

/** Reads the persisted choice once per launch. Safe to call from every provider mount. */
let loading: Promise<void> | null = null;
function loadRememberedHousehold(): Promise<void> {
  loading ??= Storage.getItem(STORAGE_KEY)
    .then((value) => {
      if (!hasRead) chosenId = value;
      hasRead = true;
      emit();
    })
    .catch(() => {
      // An unreadable store is not worth failing a launch over — fall back to the
      // first household, which is what a null `chosenId` already means.
      hasRead = true;
      emit();
    });
  return loading;
}

export type ActiveHousehold = {
  /** Households the user belongs to, by name. */
  all: HouseholdRow[];
  /** The one in view, or null while loading or if the user belongs to none. */
  active: HouseholdRow | null;
  /** True until membership has been read from the local replica. */
  loading: boolean;
  select: (householdId: string) => void;
};

const ActiveHouseholdContext = createContext<ActiveHousehold | null>(null);

export function useActiveHousehold(): ActiveHousehold {
  const value = use(ActiveHouseholdContext);
  if (!value) {
    throw new Error("useActiveHousehold must be used within ActiveHouseholdProvider");
  }
  return value;
}

/**
 * The Household in view, for screens below a gate that has already established there is
 * one. Throws rather than returning null, so scoped queries need no null check.
 */
export function useHousehold(): HouseholdRow {
  const { active } = useActiveHousehold();
  if (!active) throw new Error("useHousehold called outside a household-scoped route");
  return active;
}

export function ActiveHouseholdProvider({ children }: { children: React.ReactNode }) {
  const userId = useUserId();
  const [storedId, setStoredId] = useState(chosenId);
  const [storageRead, setStorageRead] = useState(hasRead);

  const { data: all, isLoading } = useQuery<HouseholdRow>(
    households.HOUSEHOLDS_FOR_USER,
    [userId],
  );

  useEffect(() => {
    const listener = () => {
      setStoredId(chosenId);
      setStorageRead(hasRead);
    };
    listeners.add(listener);
    void loadRememberedHousehold();
    // The read may have completed before this mount, in which case no event is coming.
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const select = useCallback((householdId: string) => {
    rememberHousehold(householdId);
  }, []);

  const value = useMemo<ActiveHousehold>(() => {
    const active = all.find((h) => h.id === storedId) ?? all[0] ?? null;
    return {
      all,
      active,
      loading: isLoading || !storageRead,
      select,
    };
  }, [all, storedId, isLoading, storageRead, select]);

  return <ActiveHouseholdContext value={value}>{children}</ActiveHouseholdContext>;
}
