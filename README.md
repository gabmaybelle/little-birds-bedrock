# Little Birds for Bedrock

[![checks](https://github.com/gabmaybelle/little-birds-bedrock/actions/workflows/checks.yml/badge.svg)](https://github.com/gabmaybelle/little-birds-bedrock/actions/workflows/checks.yml)

Make your cottage cozier with a bird or two. Little pet birds that make a perch their own and are
glad when you come home.

This is the Bedrock Edition of [Little Birds](https://github.com/gabmaybelle/little-birds), the
Java mod for Fabric and NeoForge: the same five birds (budgie, cockatiel, lovebird, canary and
zebra finch), the same colours, models, sounds and art, as a behaviour pack and a resource pack.
Version 0.1.0 has everything in the Java edition's 0.3.0. Made by Gabby.

Minecraft Bedrock 1.26.60 or newer, no experiments. Download the `.mcaddon` from the
[releases](https://github.com/gabmaybelle/little-birds-bedrock/releases), open it to import it,
then turn on the Little Birds behaviour pack for your world (the resource pack comes with it).
It works in single player, on Realms and on servers that carry the packs.

## Playing

Tame a wild bird with seeds (or a millet spray, crafted from wheat and two seeds, on the first
try). A tamed bird makes the nearest perch its home (string over a stick over a plank): it sleeps
there at night, stays home when you go out, and says hello when you come back after a while.
Sneak and use a tamed budgie, cockatiel or lovebird with an empty hand to put it on your shoulder;
use a perch with an empty hand to call your bird to it. Feed two tamed birds of a kind seeds and
they make a chick.

**On a phone or tablet:** to use a bird, press the interact button that appears above the hotbar
when you look at it. Tapping the bird itself attacks it. For the shoulder, crouch first, then press
the interact button.

## How it differs from the Java edition

Bedrock can't do a few things the Java way:

- Birds get about in short hops and flights, like Bedrock's own parrot, and rarely walk.
- The flight home to the perch is a straight glide, so it can pass through leaves or a wall.
- A bird told to sit stays sitting: it doesn't come when called, and sits again after a shoulder
  ride.
- The bird on your shoulder can trail a little when you run on a server, and shows in first person.
- Wild birds despawn far from players, as Bedrock's parrots do. Tamed birds never do.
- The settings are a form (below), not a config file. Breeding gives no experience.
- A perch placed by a command or a structure isn't known to the birds; place it by hand.

What was built and how it was checked: [PROGRESS.md](PROGRESS.md).

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
  and the greeting, the shoulder, lovebird pairs and finch company, breeding and chicks, the songs,
  the foods and the settings) against the Java edition's.
- `npm run typecheck`: the scripts against the `@minecraft/server` and `@minecraft/server-ui`
  typings the pack asks for.
- `npm run validate`: every pack file against Mojang's schemas and the community
  [Blockception schemas](https://github.com/Blockception/Minecraft-bedrock-json-schemas).
- `node tools/bds-check.js <server folder> --zip <bedrock-server zip>`: loads the packs on a
  Bedrock Dedicated Server with no window and runs the self-test pack (`test/`): every bird
  spawns in each of its colours, its spawn egg works, it tames and it flies; and the perch: a
  tamed bird claims one, sleeps on it at night, goes home when its owner is away, is called to
  it, set down on it, shares it (two finches) or doesn't (two budgies); the greeting, dusk and the
  shoulder; lovebirds pairing and keeping together, finches keeping company, breeding and chicks,
  the songs, the millet spray, snacks and refused foods, and the settings. Running the server means
  accepting Minecraft's EULA.

## Settings

The Java edition's two settings, as a form: an operator types `/little_birds:settings` in chat.
"Wild birds spawn" turns natural spawning on or off (spawn eggs always work), and "Spawn chance"
(0 to 100) makes wild birds rarer. They are kept with the world and take effect at once.

## Credits and licence

The birds' voices are the Java edition's, cut from public-domain (CC0) recordings of real birds on
Freesound: budgies by much_username, tomattka and squashy555, a cockatiel by Tairblenn, lovebirds
by 5ro4, bowlingballout and xv920, canaries by DaniloSFX, ReadeOnly and brfindla, zebra finches by
TheKingOfGeeks360 and petebuchwald.

MIT, like the Java edition. See [LICENSE](LICENSE).
