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
 */

import { useQuery } from "@powersync/react";
import Storage from "expo-sqlite/kv-store";
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { households } from "@/lib/db";
import type { HouseholdRow } from "@/lib/db";
import { useUserId } from "@/lib/auth/session";

const STORAGE_KEY = "jar.activeHouseholdId";

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
  const [storedId, setStoredId] = useState<string | null>(null);
  const [storageRead, setStorageRead] = useState(false);

  const { data: all, isLoading } = useQuery<HouseholdRow>(
    households.HOUSEHOLDS_FOR_USER,
    [userId],
  );

  useEffect(() => {
    let active = true;
    void Storage.getItem(STORAGE_KEY).then((value) => {
      if (!active) return;
      setStoredId(value);
      setStorageRead(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const select = useCallback((householdId: string) => {
    setStoredId(householdId);
    void Storage.setItem(STORAGE_KEY, householdId);
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
