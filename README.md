# Little Birds for Bedrock

[![checks](https://github.com/gabmaybelle/little-birds-bedrock/actions/workflows/checks.yml/badge.svg)](https://github.com/gabmaybelle/little-birds-bedrock/actions/workflows/checks.yml)

Make your cottage cozier with a bird or two. Little pet birds that make a perch their own and are
glad when you come home.

This is the Bedrock Edition of [Little Birds](https://github.com/gabmaybelle/little-birds): the same
five birds (budgie, cockatiel, lovebird, canary and zebra finch), the same colours, models, sounds
and art, as a behaviour pack and a resource pack. Made by Gabby.

**Not released yet.** It is being built toward 0.1.0, which matches the Java edition's 0.3.0. What
is done and what comes next: [PROGRESS.md](PROGRESS.md).

## Building

You need Node.js 20 or newer and git.

```
npm install
npm run build
```

The build reads the art, the sounds, the names and the model shapes from the Java edition's repo,
at the tag in `java-source.json`, so both editions share one source. It uses `../little-birds` if
you have it next to this folder, and otherwise clones it into `.cache/`. Out come:

- `build/packs/bp` and `build/packs/rp`: the behaviour and resource packs
- `dist/LittleBirds-<version>.mcaddon`: both packs in one file to import

The scripts are TypeScript in `src/`, compiled to the behaviour pack's JavaScript. The pack files
for each bird are generated from one table, `tools/birds.js`, by `tools/packs.js`; the models are
converted from the Java model classes by `tools/java-model-to-geo.js`, box for box.

## Checks

- `npm test`: unit tests of the generated files (the models against the Java classes, sizes,
  colours, health, the component-group rules) and of the rules in `src/*-logic.ts` (the perch, dusk
  and the greeting, the shoulder, lovebird pairs and finch company, breeding and chicks, the songs)
  against the Java edition's.
- `npm run typecheck`: the scripts against the `@minecraft/server` typings the pack asks for.
- `npm run validate`: every pack file against Mojang's schemas and the community
  [Blockception schemas](https://github.com/Blockception/Minecraft-bedrock-json-schemas).
- `node tools/bds-check.js <server folder> --zip <bedrock-server zip>`: loads the packs on a
  Bedrock Dedicated Server with no window and runs the self-test pack (`test/`): every bird
  spawns in each of its colours, its spawn egg works, it tames and it flies; and the perch: a
  tamed bird claims one, sleeps on it at night, goes home when its owner is away, is called to
  it, set down on it, shares it (two finches) or doesn't (two budgies); the greeting, dusk and the
  shoulder; lovebirds pairing and keeping together, finches keeping company, breeding and chicks,
  and the songs. Running the server means accepting Minecraft's EULA.

## Licence

MIT, like the Java edition. See [LICENSE](LICENSE).
