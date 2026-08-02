/**
 * Draws: pulling Candidates out of a Jar and knocking them out until one remains.
 *
 * A Draw is recorded rather than ephemeral. Past Draws are what stop a Jar serving the
 * same title three Fridays running, via Cooldown — so the record is not history for its
 * own sake, it feeds back into the next Draw.
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import { cooldownWeight, weightedSample, type Weighted } from "../../draw/cooldown";
import { newId } from "../ids";
import type { DrawRow, TitleRow } from "../schema";
import { parseTimestamp, timestamp } from "../time";
import { recordViewing } from "./annotations";
import { jarContentsQuery } from "./jars";

export type DrawOutcome = "in_progress" | "watched" | "abandoned" | "no_pick";

export class EmptyJarError extends Error {}

/** The slate of one Draw, in the order it was served. Parameters: `[drawId]`. */
export const CANDIDATES_FOR_DRAW = `
  select t.*, dc.knocked_out_at
  from draw_candidate dc
  join title t on t.id = dc.title_id
  where dc.draw_id = ?
  order by t.name
`;

/** A Jar's Draws, most recent first. Parameters: `[jarId]`. */
export const DRAWS_FOR_JAR = `
  select * from draw where jar_id = ? order by drawn_at desc
`;

/** The Draw still in progress for a Jar, if there is one. Parameters: `[jarId]`. */
export const ACTIVE_DRAW_FOR_JAR = `
  select * from draw where jar_id = ? and outcome = 'in_progress'
  order by drawn_at desc limit 1
`;

/**
 * Serves `n` Candidates from a Jar and records the Draw.
 *
 * Candidates are frozen at this moment: changing the Library mid-Draw cannot alter
 * what is on the table.
 *
 * Selection is weighted by Cooldown rather than uniform, so something drawn or watched
 * recently is unlikely to reappear — but never impossible, which is what stops a small
 * Jar deadlocking. `random` is injected only so a Draw is reproducible under test.
 */
export async function startDraw(
  db: AbstractPowerSyncDatabase,
  input: {
    jarId: string;
    n: number;
    participantIds: string[];
    now?: Date;
    random?: () => number;
  },
): Promise<string> {
  if (!Number.isInteger(input.n) || input.n < 1) {
    throw new Error(`A draw serves at least one candidate, got ${input.n}`);
  }
  if (input.participantIds.length === 0) {
    throw new Error("A draw needs at least one participant");
  }

  const now = input.now ?? new Date();
  const eligible = await weighUp(db, input.jarId, now);

  if (eligible.length === 0) {
    // Distinct from "the jar is small": nothing at all matches, so there is nothing to
    // weight. Worth its own error because the fix is editing the Filter.
    throw new EmptyJarError(`Jar ${input.jarId} has no titles to draw from`);
  }

  // Fewer titles than asked for is fine — a Jar with two serves two.
  const candidates = weightedSample(eligible, input.n, input.random);

  const drawId = newId();
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into draw (id, jar_id, drawn_at, n, outcome, result_title_id)
       values (?, ?, ?, ?, 'in_progress', null)`,
      [drawId, input.jarId, timestamp(now), candidates.length],
    );

    for (const userId of input.participantIds) {
      // A participant who is not a household member is a Guest, and that is allowed:
      // they take part in the knock-outs without touching the Household's vocabulary.
      await tx.execute(
        `insert into draw_participant (id, draw_id, user_id) values (?, ?, ?)`,
        [newId(), drawId, userId],
      );
    }

    for (const titleId of candidates) {
      await tx.execute(
        `insert into draw_candidate (id, draw_id, title_id, knocked_out_at)
         values (?, ?, ?, null)`,
        [newId(), drawId, titleId],
      );
    }
  });

  return drawId;
}

/**
 * The Jar's contents paired with their Cooldown weights.
 *
 * Exported because "why did this come up again?" is a fair question, and showing the
 * weights is the only honest answer.
 */
export async function weighUp(
  db: AbstractPowerSyncDatabase,
  jarId: string,
  now: Date = new Date(),
): Promise<Weighted<string>[]> {
  const contents = await jarContentsQuery(db, jarId);

  // Last drawn is scoped to this Jar, matching the default scope of the `lastDrawn`
  // filter leaf: another Jar serving it says nothing about this one's rhythm. Last
  // watched is scoped to the Household instead — "we have seen this recently" is a
  // fact about the group, not about which Jar it came out of (ADR-0006).
  const rows = await db.getAll<{
    id: string;
    last_drawn_at: string | null;
    last_watched_on: string | null;
  }>(
    `select
       t.id,
       (select max(d.drawn_at) from draw_candidate dc
          join draw d on d.id = dc.draw_id
          where dc.title_id = t.id and d.jar_id = ?)          as last_drawn_at,
       (select max(v.watched_on) from viewing v
          join household_member hm on hm.user_id = v.user_id
          join jar j on j.household_id = hm.household_id
          where v.title_id = t.id and j.id = ?)               as last_watched_on
     from title t
     where t.id in (${contents.sql})`,
    [jarId, jarId, ...contents.params],
  );

  return rows.map((row) => ({
    item: row.id,
    weight: cooldownWeight({
      now,
      lastDrawnAt: parseTimestamp(row.last_drawn_at),
      lastWatchedAt: parseTimestamp(row.last_watched_on),
    }),
  }));
}

/**
 * Knocks a Candidate out. Means "not tonight" and is scoped to this Draw alone —
 * unlike an Exclusion, which keeps a Title out of a Jar permanently.
 */
export async function knockOut(
  db: AbstractPowerSyncDatabase,
  drawId: string,
  titleId: string,
  at: Date = new Date(),
): Promise<void> {
  await db.execute(
    `update draw_candidate set knocked_out_at = ?
     where draw_id = ? and title_id = ? and knocked_out_at is null`,
    [timestamp(at), drawId, titleId],
  );
}

/** Puts a knocked-out Candidate back in play. */
export async function restoreCandidate(
  db: AbstractPowerSyncDatabase,
  drawId: string,
  titleId: string,
): Promise<void> {
  await db.execute(
    `update draw_candidate set knocked_out_at = null where draw_id = ? and title_id = ?`,
    [drawId, titleId],
  );
}

/** Candidates still in play, in the order served. */
export async function survivors(
  db: AbstractPowerSyncDatabase,
  drawId: string,
): Promise<TitleRow[]> {
  return db.getAll<TitleRow>(
    `select t.* from draw_candidate dc
     join title t on t.id = dc.title_id
     where dc.draw_id = ? and dc.knocked_out_at is null
     order by t.name`,
    [drawId],
  );
}

/**
 * Ends the Draw as watched, recording a Viewing for every participant.
 *
 * Guests get one too. They own nothing in the Household, but they did watch the film,
 * and a Viewing belongs to a User rather than to a group.
 */
export async function finishAsWatched(
  db: AbstractPowerSyncDatabase,
  drawId: string,
  titleId: string,
  watchedOn: Date = new Date(),
): Promise<void> {
  const participants = await db.getAll<{ user_id: string }>(
    `select user_id from draw_participant where draw_id = ?`,
    [drawId],
  );

  await db.execute(
    `update draw set outcome = 'watched', result_title_id = ? where id = ?`,
    [titleId, drawId],
  );

  for (const participant of participants) {
    await recordViewing(db, {
      userId: participant.user_id,
      titleId,
      watchedOn,
    });
  }
}

/**
 * Ends the Draw without a Viewing.
 *
 * `abandoned` is "we stopped watching"; `no_pick` is "we never chose". Both still feed
 * Cooldown — the titles were served, so they should be less likely next Friday whether
 * or not the night went anywhere.
 */
export async function finishWithoutWatching(
  db: AbstractPowerSyncDatabase,
  drawId: string,
  outcome: "abandoned" | "no_pick",
): Promise<void> {
  await db.execute(
    `update draw set outcome = ?, result_title_id = null where id = ?`,
    [outcome, drawId],
  );
}

export async function getDraw(
  db: AbstractPowerSyncDatabase,
  drawId: string,
): Promise<DrawRow | null> {
  return db.getOptional<DrawRow>(`select * from draw where id = ?`, [drawId]);
}

export async function activeDraw(
  db: AbstractPowerSyncDatabase,
  jarId: string,
): Promise<DrawRow | null> {
  return db.getOptional<DrawRow>(ACTIVE_DRAW_FOR_JAR, [jarId]);
}
