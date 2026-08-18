/**
 * The TMDB v3 fetch wrapper every other file in this module goes through.
 *
 * Every request is pinned to `language=en-US`: ADR-0008 stores genre and language as
 * TMDB's display names rather than ids or codes, and that only converges to one
 * spelling per fact if every device asks TMDB in the same locale.
 */

const BASE_URL = "https://api.themoviedb.org/3";

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Read per-call rather than cached at module load, so a test (or a build with the var
// injected late) doesn't get stuck with whatever was set — or unset — at import time.
function token(): string {
  const value = process.env.EXPO_PUBLIC_TMDB_API_TOKEN;
  if (!value) {
    throw new Error("EXPO_PUBLIC_TMDB_API_TOKEN must be set — see .env.example");
  }
  return value;
}

export async function tmdbGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new TmdbError(
      body?.status_message ?? `TMDB request failed with ${response.status}`,
      response.status,
    );
  }

  return response.json();
}
