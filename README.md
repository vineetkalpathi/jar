# Jar

A movie and TV log with customizable ratings, and **jars** — groupings of titles a watch
group draws from at random when it's time to pick something to watch. Pull a few
candidates out, knock them out one at a time, watch whatever survives.

Built with [Expo](https://expo.dev) SDK 57 and React Native.

## Documentation

The design is complete and written down; application code is not yet started.
**[docs/README.md](./docs/README.md)** is the entry point — it gives the reading order
and a summary of the model.

- **[CONTEXT.md](./CONTEXT.md)** — the glossary. Every domain term, precisely defined.
- **[docs/data-model.md](./docs/data-model.md)** — entities, scoping, and the constraints that carry meaning.
- **[docs/filter-leaves.md](./docs/filter-leaves.md)** — the closed catalogue of jar filter predicates.
- **[docs/adr/](./docs/adr/)** — architecture decision records, with the reasoning behind each choice.

## Get started

```bash
pnpm install
pnpm start
```

From there you can open the app in a
[development build](https://docs.expo.dev/develop/development-builds/introduction/), an
[Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/), an
[iOS simulator](https://docs.expo.dev/workflow/ios-simulator/), or
[Expo Go](https://expo.dev/go).

Platform-specific builds:

```bash
pnpm ios      # expo run:ios
pnpm android  # expo run:android
pnpm web      # expo start --web
```

Source lives in `src/`, which uses [file-based routing](https://docs.expo.dev/router/introduction)
via `expo-router`.

## Attribution

This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise
approved by TMDB. The TMDB logo and this notice must appear in the app's About or
Credits section — see [ADR-0003](./docs/adr/0003-tmdb-is-a-cached-enrichment-source.md).
