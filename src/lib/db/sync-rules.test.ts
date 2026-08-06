/**
 * Checks that `powersync/sync-rules.yaml` and `schema.ts` agree.
 *
 * They are two halves of one decision and nothing else forces them to match. The
 * failure mode is silent in both directions: a table synced under a name the client
 * does not declare arrives and is discarded, and a table the client declares but
 * nothing syncs is simply always empty. Neither raises an error — the app looks like a
 * new account rather than a broken one.
 *
 * This is the cheap half of the problem. The expensive half — whether the sync rules
 * and the RLS policies grant the *same visibility* — has no automated check, and
 * docs/powersync.md calls a mismatch there the most likely serious bug in the project.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const SQL_KEYWORDS = new Set(["INNER", "JOIN", "LEFT", "ON", "WHERE"]);

type SourceTable = { query: string; prefix: string | null; table: string; alias: string | null };

function parseSyncRules(): SourceTable[] {
  const yaml = readFileSync(
    resolve(__dirname, "../../../powersync/sync-rules.yaml"),
    "utf8",
  );

  // Strip comments, then take each SELECT up to the start of the next one. Every query
  // here is a single statement with no subqueries, which keeps this honest.
  const body = yaml
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

  return [...body.matchAll(/SELECT[\s\S]*?(?=SELECT|$)/g)].map((match) => {
    // A query runs to the next SELECT, which may be in the next stream — so cut at the
    // first YAML key. No query here contains a colon, which keeps this unambiguous.
    const query = match[0].replace(/\s+/g, " ").split(/\s\w+:/)[0].trim();
    const parts = /^SELECT (?:(\w+)\.\*|\*) FROM (\w+)(?: (\w+))?/.exec(query);
    if (!parts) throw new Error(`Could not parse: ${query}`);

    const [, prefix, table, maybeAlias] = parts;
    const alias =
      maybeAlias && !SQL_KEYWORDS.has(maybeAlias.toUpperCase()) ? maybeAlias : null;

    return { query, prefix: prefix ?? null, table, alias };
  });
}

function declaredTables(): string[] {
  const source = readFileSync(resolve(__dirname, "schema.ts"), "utf8");
  return [...source.matchAll(/^const (\w+) = new Table\(/gm)].map((m) => m[1]);
}

describe("sync rules", () => {
  const sources = parseSyncRules();

  it("parses every stream query", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("never aliases the table being selected from", () => {
    // A row is published under the name it is selected as, so `SELECT h.* FROM
    // household h` syncs into a local table called `h`. The dashboard validator warns
    // about this; it would otherwise sync perfectly into somewhere nothing reads.
    const aliased = sources.filter((s) => s.alias !== null);
    expect(aliased.map((s) => s.query)).toEqual([]);
  });

  it("selects columns from the source table itself", () => {
    // PowerSync requires a single table's columns per query, and the prefix has to be
    // that table — `SELECT le.* FROM library_entry` would publish nothing useful.
    const mismatched = sources.filter((s) => s.prefix !== null && s.prefix !== s.table);
    expect(mismatched.map((s) => s.query)).toEqual([]);
  });

  it("publishes only tables the client declares", () => {
    const declared = new Set(declaredTables());
    const published = [...new Set(sources.map((s) => s.table))].sort();
    expect(published.filter((t) => !declared.has(t))).toEqual([]);
  });

  it("syncs every table the client declares", () => {
    // A declared table nothing syncs is permanently empty, which reads as missing data
    // rather than as a configuration mistake.
    const published = new Set(sources.map((s) => s.table));
    expect(declaredTables().filter((t) => !published.has(t))).toEqual([]);
  });
});
