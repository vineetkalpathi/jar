import { tmdbGet, TmdbError } from "./client";
import { posterUrl, backdropUrl } from "./images";
import { imdbUrl, tmdbUrl } from "./links";
import { getPersonCredits, searchPeople } from "./people";
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
            { id: 2, name: "Second", character: "B", order: 1, profile_path: null },
            { id: 1, name: "First", character: "A", order: 0, profile_path: "/first.jpg" },
          ],
          crew: [
            { id: 9, name: "Director Person", job: "Director" },
            { id: 8, name: "Writer Person", job: "Writer" },
          ],
        },
        "watch/providers": { results: {} },
        external_ids: { imdb_id: null },
      }),
    );

    const details = await getMovieDetails(42);

    expect(details.runtime).toBeNull();
    expect(details.language).toBe("French");
    expect(details.genres).toEqual(["Drama"]);
    expect(details.cast.map((c) => c.name)).toEqual(["First", "Second"]);
    // profile_path rides along on credits.cast for free — no per-person request needed.
    expect(details.cast.map((c) => c.profilePath)).toEqual(["/first.jpg", null]);
    expect(details.directors).toEqual([{ tmdbPersonId: 9, name: "Director Person" }]);
  });

  it("resolves US flatrate watch providers, ordered by display priority", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 42,
        title: "Some Film",
        release_date: "2018-03-01",
        runtime: 100,
        overview: "",
        poster_path: null,
        backdrop_path: null,
        vote_average: 7.5,
        genres: [],
        original_language: "en",
        spoken_languages: [],
        credits: { cast: [], crew: [] },
        "watch/providers": {
          results: {
            US: {
              link: "https://www.themoviedb.org/movie/42/watch",
              flatrate: [
                { provider_id: 2, provider_name: "Second", logo_path: "/b.jpg", display_priority: 5 },
                { provider_id: 1, provider_name: "First", logo_path: "/a.jpg", display_priority: 1 },
              ],
              // Present in the real API but not something this app surfaces yet.
              rent: [{ provider_id: 9, provider_name: "Rentable", logo_path: "/c.jpg", display_priority: 1 }],
            },
            CA: {
              link: "https://www.themoviedb.org/movie/42/watch?locale=CA",
              flatrate: [
                { provider_id: 3, provider_name: "Canadian", logo_path: "/d.jpg", display_priority: 1 },
              ],
            },
          },
        },
        external_ids: { imdb_id: "tt1234567" },
      }),
    );

    const details = await getMovieDetails(42);

    expect(details.watchProviders).toEqual({
      region: "US",
      link: "https://www.themoviedb.org/movie/42/watch",
      flatrate: [
        { providerId: 1, name: "First", logoPath: "/a.jpg" },
        { providerId: 2, name: "Second", logoPath: "/b.jpg" },
      ],
    });
    expect(details.imdbId).toBe("tt1234567");
  });

  it("is null when nothing streams it in the US, even if another region has providers", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 42,
        title: "Some Film",
        release_date: "2018-03-01",
        runtime: 100,
        overview: "",
        poster_path: null,
        backdrop_path: null,
        vote_average: 7.5,
        genres: [],
        original_language: "en",
        spoken_languages: [],
        credits: { cast: [], crew: [] },
        "watch/providers": {
          results: {
            CA: {
              link: "https://www.themoviedb.org/movie/42/watch?locale=CA",
              flatrate: [
                { provider_id: 3, provider_name: "Canadian", logo_path: "/d.jpg", display_priority: 1 },
              ],
            },
          },
        },
        external_ids: { imdb_id: null },
      }),
    );

    const details = await getMovieDetails(42);

    expect(details.watchProviders).toBeNull();
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
        "watch/providers": { results: {} },
        external_ids: { imdb_id: null },
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

describe("external links", () => {
  it("builds a TMDB page from the id and media type, no slug required", () => {
    expect(tmdbUrl(27205, "movie")).toBe("https://www.themoviedb.org/movie/27205");
    expect(tmdbUrl(1399, "tv")).toBe("https://www.themoviedb.org/tv/1399");
  });

  it("returns null for imdbUrl when there's no IMDB match, rather than a broken link", () => {
    expect(imdbUrl(null)).toBeNull();
    expect(imdbUrl("tt1375666")).toBe("https://www.imdb.com/title/tt1375666/");
  });
});

describe("searchPeople", () => {
  it("returns nothing for a blank query without calling TMDB", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await searchPeople("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalises a person result", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 31, name: "Tom Hanks", profile_path: "/hanks.jpg" }],
      }),
    );

    expect(await searchPeople("tom hanks")).toEqual([
      { tmdbPersonId: 31, name: "Tom Hanks", profilePath: "/hanks.jpg" },
    ]);
  });
});

describe("getPersonCredits", () => {
  it("merges movie and tv credits, using title/character or name/first_air_date as the shape needs", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 31,
        cast: [
          {
            id: 13,
            media_type: "movie",
            title: "Forrest Gump",
            release_date: "1994-06-23",
            poster_path: "/gump.jpg",
            popularity: 30,
            character: "Forrest Gump",
          },
          {
            id: 496,
            media_type: "tv",
            name: "Family Ties",
            first_air_date: "1982-09-22",
            poster_path: "/ties.jpg",
            popularity: 5,
            character: "Ned Donnelly",
          },
        ],
        crew: [],
      }),
    );

    const credits = await getPersonCredits(31);

    expect(credits).toEqual([
      {
        tmdbId: 13,
        mediaType: "movie",
        name: "Forrest Gump",
        releaseYear: 1994,
        posterPath: "/gump.jpg",
        popularity: 30,
        role: "Forrest Gump",
        selfAppearance: false,
      },
      {
        tmdbId: 496,
        mediaType: "tv",
        name: "Family Ties",
        releaseYear: 1982,
        posterPath: "/ties.jpg",
        popularity: 5,
        role: "Ned Donnelly",
        selfAppearance: false,
      },
    ]);
  });

  it("prefers the cast credit's character over the crew credit's job for the same title", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 1,
        cast: [
          {
            id: 100,
            media_type: "movie",
            title: "Actor-Director Film",
            release_date: "2010-01-01",
            poster_path: null,
            popularity: 10,
            character: "The Lead",
          },
        ],
        crew: [
          {
            id: 100,
            media_type: "movie",
            title: "Actor-Director Film",
            release_date: "2010-01-01",
            poster_path: null,
            popularity: 10,
            job: "Director",
          },
        ],
      }),
    );

    const credits = await getPersonCredits(1);

    expect(credits).toHaveLength(1);
    expect(credits[0].role).toBe("The Lead");
  });

  it("ranks by popularity, most popular first", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 1,
        cast: [
          {
            id: 1,
            media_type: "movie",
            title: "Obscure",
            release_date: "2001-01-01",
            poster_path: null,
            popularity: 2,
            character: "Extra",
          },
          {
            id: 2,
            media_type: "movie",
            title: "Blockbuster",
            release_date: "2002-01-01",
            poster_path: null,
            popularity: 50,
            character: "Lead",
          },
        ],
        crew: [],
      }),
    );

    const credits = await getPersonCredits(1);

    expect(credits.map((c) => c.name)).toEqual(["Blockbuster", "Obscure"]);
  });

  it("demotes 'Self' cast credits below real roles, even less-popular ones", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 1,
        cast: [
          // A talk show appearance more popular than the film below it — ranked on
          // popularity alone this would come first, which is exactly the noise a
          // prolific person's real filmography needs demoted out of the way.
          {
            id: 10,
            media_type: "tv",
            name: "The Tonight Show Starring Jimmy Fallon",
            first_air_date: "2014-02-17",
            poster_path: null,
            popularity: 80,
            character: "Self - Guest",
          },
          {
            id: 11,
            media_type: "tv",
            name: "Some Documentary",
            first_air_date: "2020-01-01",
            poster_path: null,
            popularity: 40,
            character: "Himself",
          },
          {
            id: 12,
            media_type: "movie",
            title: "A Real Supporting Role",
            release_date: "2015-01-01",
            poster_path: null,
            popularity: 3,
            character: "The Neighbor",
          },
        ],
        crew: [],
      }),
    );

    const credits = await getPersonCredits(1);

    expect(credits.map((c) => c.name)).toEqual([
      "A Real Supporting Role",
      "The Tonight Show Starring Jimmy Fallon",
      "Some Documentary",
    ]);
    expect(credits.map((c) => c.selfAppearance)).toEqual([false, true, true]);
  });

  it("never treats a crew job as a self-appearance", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 1,
        cast: [],
        crew: [
          {
            id: 20,
            media_type: "movie",
            title: "Self Portrait",
            release_date: "2018-01-01",
            poster_path: null,
            popularity: 5,
            job: "Director",
          },
        ],
      }),
    );

    const credits = await getPersonCredits(1);

    expect(credits[0].selfAppearance).toBe(false);
  });
});
