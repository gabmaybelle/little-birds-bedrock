# Progress

Little Birds for Bedrock, toward 0.1.0: everything in the Java edition's 0.3.0 (five birds, the
perch as a home, the greeting, the shoulder, pairs and songs, chicks, millet spray and snacks, and
the settings, as a form). Locked: new ideas go to a later version.

## Done

**The birds (2026-11-08).** Repo and pack skeleton; the build; all five birds.

- The build reads the art (entity textures, the perch texture, the item sprites, the pack icon),
  the 61 sound files, the names and the model shapes from the Java repo at `v0.3.0`, and never
  from copies here. Models go through `tools/java-model-to-geo.js`, box for box; the budgie's
  output is the same geometry that was checked against a vanilla parrot in the game.
- Budgie, cockatiel, lovebird, canary and zebra finch, each with Java's size, health and colours.
  The colour is an entity property (`little_birds:colour`) picked at random when a bird appears,
  so chicks can inherit it later; a render controller picks the texture.
- Poses from each Java model: flying (wing beat, legs tucked), standing (little steps, head bob),
  sitting, asleep on a perch (head tucked), the greeting bob, the head shake, the cockatiel's crest
  and the canary's and finch's singing pose. The greeting, shake, song and roost poses wait for the
  scripts that turn them on (later sessions); they are there and load.
- The wing beat keeps its own flap timing, as Java's `LittleBird` does: the game's wing-flap
  queries stay at 0 for add-on mobs, which left the wings still in the first in-game look.
- On Bedrock the birds get about the way the vanilla parrot does: short hopping flights, then a
  rest on the ground. They rarely walk, so the little steps and head bob seldom show (a test
  added a wander-on-foot goal: with fly navigation the birds still took off rather than walked).
- Sounds: each bird's own chatter as its ambient sound, every bird sound defined with its subtitle;
  hurt, death, steps and flapping are the parrot's, as on Java.
- Seeds tame a wild bird a third of the time, as on Java; a tamed bird sits when told, follows its
  owner and wanders; birds fly; wild birds spawn by biome (budgies in savannas and jungles,
  cockatiels and lovebirds in savannas, canaries in flower forests, meadows and cherry groves,
  zebra finches in plains); each has a spawn egg with its Java sprite.
- Wild spawn weights: a third of Java's (Java's 15 for budgies filled a savanna on Bedrock), with
  flocks of 2 to 3 (lovebirds 2, finches 3). Still to be tuned by eye in a real world.

Checks, all passing:
- `npm test`: 7 unit tests (no component both in the base and in a group; events name real groups;
  the budgie geometry is unchanged; every Java part is a bone and every animated bone exists;
  colours, sizes and health match Java).
- `npm run typecheck`: clean against `@minecraft/server` 2.10.0, which the pack asks for.
- `npm run validate`: 38 files, no errors against Mojang's and the community schemas (13 known
  schema lags, each explained in `tools/validate.js`). Breaking a client entity, a model and a
  render controller on purpose makes it fail, so it does catch resource-pack mistakes.
- Self-test on Bedrock Dedicated Server 1.26.63.1 and Preview 1.26.70.23: for each bird, 30 wild
  birds show every colour and only those; health, flying and taming components are right; the
  spawn egg is a known item and `/summon` works; the tame event tames it and keeps its colour;
  wild birds take to the air. No error or warning lines in the server log or content log.
  On 1.26.63.1 a freshly spawned wild flock sometimes sits perfectly still: it is being ticked
  (a push lifts it) but its wandering doesn't start for the whole 15 s, while a fresh flock flies
  at once. The fly check nudges and retries, and prints a note when it needed the second try. Not
  seen on Preview. Worth watching for in the game: wild birds that stand still for a long time.

## Next

1. A look in the game (models side on beside a parrot, colours, poses, sounds, eggs), and the
   spawn weights by eye in a new world.
2. Session 3: the perch block, home and roost script, seats and sharing, calling and setting
   down, owner away.
