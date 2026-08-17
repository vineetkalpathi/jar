import { tmdbGet, TmdbError } from "./client";
import { posterUrl, backdropUrl } from "./images";
import { searchTitles } from "./search";
import { getMovieDetails, getTvDetails } from "./details";

const originalFetch = global.fetch;
const originalToken = process.env.EXPO_PUBLIC_TMDB_API_TOKEN;

beforeEach(() => {
  process.env.EXPO_PUBLIC_TMDB_API_TOKEN = "test-token";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.EXPO_PUBLIC_TMDB_API_TOKEN = originalToken;
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("tmdbGet", () => {
  it("pins language=en-US and sends the bearer token, per ADR-0008", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await tmdbGet("/movie/1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("language=en-US");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-token",
    });
  });

  it("throws without a token rather than sending an unauthenticated request", async () => {
    delete process.env.EXPO_PUBLIC_TMDB_API_TOKEN;
    global.fetch = jest.fn();

    await expect(tmdbGet("/movie/1")).rejects.toThrow("EXPO_PUBLIC_TMDB_API_TOKEN");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("raises TmdbError with TMDB's own message on a non-ok response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ status_message: "Invalid API key" }, false, 401));

    await expect(tmdbGet("/movie/1")).rejects.toThrow(TmdbError);
    await expect(tmdbGet("/movie/1")).rejects.toThrow("Invalid API key");
  });
});

describe("searchTitles", () => {
  it("returns nothing for a blank query without calling TMDB", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await searchTitles("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("merges movies and tv shows, ranked by popularity", async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes("/search/movie")) {
        return Promise.resolve(
          jsonResponse({
            page: 1,
            total_pages: 1,
            total_results: 1,
            results: [
              {
                id: 1,
                title: "A Movie",
                release_date: "2020-05-01",
                overview: "",
                poster_path: "/movie.jpg",
                popularity: 10,
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: 2,
              name: "A Show",
              first_air_date: "2019-01-01",
              overview: "",
              poster_path: null,
              popularity: 50,
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;

    const results = await searchTitles("test");

    expect(results.map((r) => r.name)).toEqual(["A Show", "A Movie"]);
    expect(results[1]).toMatchObject({
      tmdbId: 1,
      mediaType: "movie",
      releaseYear: 2020,
      posterPath: "/movie.jpg",
    });
    expect(results[0]).toMatchObject({ tmdbId: 2, mediaType: "tv", releaseYear: 2019 });
  });
});

describe("getMovieDetails", () => {
  it("normalises runtime, language, genres and credits", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 42,
        title: "Some Film",
        release_date: "2018-03-01",
        runtime: 0, // TMDB's "unknown", not zero minutes
        overview: "overview",
        poster_path: "/poster.jpg",
        backdrop_path: null,
        vote_average: 7.5,
        genres: [{ id: 1, name: "Drama" }],
        original_language: "fr",
        spoken_languages: [{ iso_639_1: "fr", english_name: "French" }],
        credits: {
          cast: [
            { id: 2, name: "Second", character: "B", order: 1 },
            { id: 1, name: "First", character: "A", order: 0 },
          ],
          crew: [
            { id: 9, name: "Director Person", job: "Director" },
            { id: 8, name: "Writer Person", job: "Writer" },
          ],
        },
      }),
    );

    const details = await getMovieDetails(42);

    expect(details.runtime).toBeNull();
    expect(details.language).toBe("French");
    expect(details.genres).toEqual(["Drama"]);
    expect(details.cast.map((c) => c.name)).toEqual(["First", "Second"]);
    expect(details.directors).toEqual([{ tmdbPersonId: 9, name: "Director Person" }]);
  });
});

describe("getTvDetails", () => {
  it("falls back to created_by when series credits carry no Director job", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 7,
        name: "Some Show",
        first_air_date: "2021-01-01",
        episode_run_time: [45],
        overview: "overview",
        poster_path: null,
        backdrop_path: null,
        vote_average: 8,
        genres: [],
        original_language: "en",
        spoken_languages: [{ iso_639_1: "en", english_name: "English" }],
        created_by: [{ id: 5, name: "Creator Person" }],
        credits: { cast: [], crew: [] },
      }),
    );

    const details = await getTvDetails(7);

    expect(details.runtime).toBe(45);
    expect(details.directors).toEqual([{ tmdbPersonId: 5, name: "Creator Person" }]);
  });
});

describe("image URLs", () => {
  it("returns null for a missing path instead of a broken URL", () => {
    expect(posterUrl(null)).toBeNull();
    expect(backdropUrl(null)).toBeNull();
  });

  it("composes the base, size and path", () => {
    expect(posterUrl("/x.jpg", "w185")).toBe("https://image.tmdb.org/t/p/w185/x.jpg");
  });
});
