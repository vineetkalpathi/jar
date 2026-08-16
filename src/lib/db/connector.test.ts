/**
 * How the upload queue talks to PostgREST.
 *
 * The test that matters here is about the *shape* of the request, not the data in it.
 * A PUT must be a plain insert. Both `ON CONFLICT` — what `upsert` compiles to — and
 * `RETURNING` — what `return=representation` asks for — make Postgres apply the
 * table's SELECT policy to the row being written, and a Household is invisible to its
 * own creator until the membership row exists. The write comes back 42501, the
 * connector classifies it as permanent and drops it, and creating a household silently
 * never syncs while the app looks fine.
 *
 * `@powersync/react-native` is mocked because it ships ESM the node preset does not
 * transform, and only the UpdateType constants are needed here.
 */

const mockCalls: { method: string; table: string }[] = [];
let mockNextError: { code?: string; message: string } | null = null;

jest.mock("@powersync/react-native", () => ({
  UpdateType: { PUT: "PUT", PATCH: "PATCH", DELETE: "DELETE" },
}));

jest.mock("./supabase", () => ({
  supabase: {
    from: (table: string) => {
      const record = (method: string) => {
        mockCalls.push({ method, table });
        return Promise.resolve({ error: mockNextError });
      };
      return {
        insert: () => record("insert"),
        upsert: () => record("upsert"),
        update: () => ({ eq: () => record("update") }),
        delete: () => ({ eq: () => record("delete") }),
      };
    },
  },
}));

import { UpdateType } from "@powersync/react-native";
import type { AbstractPowerSyncDatabase, CrudEntry } from "@powersync/react-native";
import { SupabaseConnector } from "./connector";

function crud(op: UpdateType, overrides: Partial<CrudEntry> = {}): CrudEntry {
  return {
    op,
    table: "household",
    id: "11111111-1111-4111-8111-111111111111",
    opData: { name: "The Sofa" },
    ...overrides,
  } as CrudEntry;
}

function databaseWith(ops: CrudEntry[]) {
  let served = false;
  const complete = jest.fn(async () => {});
  const database = {
    getNextCrudTransaction: async () => {
      if (served) return null;
      served = true;
      return { crud: ops, complete };
    },
  } as unknown as AbstractPowerSyncDatabase;
  return { database, complete };
}

beforeEach(() => {
  mockCalls.length = 0;
  mockNextError = null;
});

describe("uploadData", () => {
  it("sends a PUT as a plain insert, never an upsert", async () => {
    const { database, complete } = databaseWith([crud(UpdateType.PUT)]);

    await new SupabaseConnector().uploadData(database);

    expect(mockCalls).toEqual([{ method: "insert", table: "household" }]);
    expect(complete).toHaveBeenCalled();
  });

  it("drops a duplicate insert rather than retrying it", async () => {
    // Two devices adding the same Title offline converge here: same natural key,
    // different surrogate ids, and the second upload means "already applied".
    mockNextError = { code: "23505", message: "duplicate key value" };
    const { database, complete } = databaseWith([crud(UpdateType.PUT)]);

    await expect(new SupabaseConnector().uploadData(database)).resolves.toBeUndefined();
    expect(complete).toHaveBeenCalled();
  });

  it("retries the whole transaction on a transient failure", async () => {
    mockNextError = { code: "57014", message: "statement timeout" };
    const { database, complete } = databaseWith([crud(UpdateType.PUT)]);

    await expect(new SupabaseConnector().uploadData(database)).rejects.toMatchObject({
      code: "57014",
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("sends a PATCH as an update and a DELETE as a delete", async () => {
    const { database } = databaseWith([
      crud(UpdateType.PATCH, { opData: { name: "renamed" } }),
      crud(UpdateType.DELETE, { opData: undefined }),
    ]);

    await new SupabaseConnector().uploadData(database);

    expect(mockCalls.map((c) => c.method)).toEqual(["update", "delete"]);
  });

  it("skips a PATCH carrying no columns", async () => {
    const { database } = databaseWith([crud(UpdateType.PATCH, { opData: {} })]);

    await new SupabaseConnector().uploadData(database);

    expect(mockCalls).toEqual([]);
  });
});
