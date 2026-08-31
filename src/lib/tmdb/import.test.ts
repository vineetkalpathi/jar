/**
 * Wiring only: that a fetched Title reaches the right repository calls in the right
 * order, with the right arguments. The fetch itself is covered in tmdb.test.ts and the
 * SQL itself has no test harness in this repo (see db/repositories/library.ts).
 */

const calls: { fn: string; args: unknown[] }[] = [];

jest.mock("../db/repositories/library", () => ({
  upsertTmdbTitleAttributes: jest.fn(
    async (_db: unknown, attrs: unknown, options?: unknown) => {
      calls.push({ fn: "upsertTmdbTitleAttributes", args: [attrs, options] });
      return "title-1";
    },
  ),
  addToLibrary: jest.fn(async (_db: unknown, input: unknown) => {
    calls.push({ fn: "addToLibrary", args: [input] });
  }),
}));

jest.mock("./details", () => ({
  getTitleDetails: jest.fn(async (tmdbId: number, mediaType: string) => ({
    tmdbId,
    mediaType,
    name: "Some Title",
    releaseYear: 2020,
    runtime: 100,
    language: "English",
    overview: "",
    posterPath: null,
    backdropPath: null,
    voteAverage: 7,
    genres: ["Drama"],
    cast: [],
    directors: [],
  })),
}));

import { addTmdbTitleToLibrary, refreshTmdbTitle } from "./import";
import * as library from "../db/repositories/library";

const db = {} as never;

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
});

describe("addTmdbTitleToLibrary", () => {
  it("writes the fetched attributes and the Library entry in one call", async () => {
    const titleId = await addTmdbTitleToLibrary(db, {
      tmdbId: 27205,
      mediaType: "movie",
      householdId: "household-1",
      userId: "user-1",
    });

    expect(titleId).toBe("title-1");

    // One call, not two: the Library entry rides along inside the same transaction, so
    // an import is a single commit rather than a burst of them.
    expect(calls.map((c) => c.fn)).toEqual(["upsertTmdbTitleAttributes"]);
    expect(calls[0].args[0]).toMatchObject({ tmdbId: 27205, mediaType: "movie" });
    expect(calls[0].args[1]).toEqual({
      intoLibrary: { householdId: "household-1", userId: "user-1" },
    });
    expect(library.addToLibrary).not.toHaveBeenCalled();
  });
});

describe("refreshTmdbTitle", () => {
  it("re-fetches and rewrites the attributes without touching the Library", async () => {
    const titleId = await refreshTmdbTitle(db, { tmdbId: 27205, mediaType: "movie" });

    expect(titleId).toBe("title-1");
    expect(calls.map((c) => c.fn)).toEqual(["upsertTmdbTitleAttributes"]);
    expect(library.addToLibrary).not.toHaveBeenCalled();
  });
});
