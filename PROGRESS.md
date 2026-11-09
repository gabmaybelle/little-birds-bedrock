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
  rest on the ground (kept on purpose). They rarely walk, so the little steps and head bob seldom show (a test
  added a wander-on-foot goal: with fly navigation the birds still took off rather than walked).
- Sounds: each bird's own chatter as its ambient sound, every bird sound defined with its subtitle;
  hurt, death, steps and flapping are the parrot's, as on Java.
- Seeds tame a wild bird a third of the time, as on Java; a tamed bird sits when told, follows its
  owner and wanders; birds fly; wild birds spawn by biome (budgies in savannas and jungles,
  cockatiels and lovebirds in savannas, canaries in flower forests, meadows and cherry groves,
  zebra finches in plains); each has a spawn egg with its Java sprite.
- Wild spawn weights: a third of Java's (Java's 15 for budgies filled a savanna on Bedrock), with
  flocks of 2 to 3 (lovebirds 2, finches 3). Kept as they are for now.

Looked at in the game (1.26.63): shapes beside a parrot, colours, wing beat, sounds, spawn eggs
and taming all good.

**The perch as a home (2026-11-08, session 3).** Java's `PerchBlock`, `FindPerchGoal`,
`RoostGoal` and the perch parts of `LittleBird`, on Bedrock. The rules are in
`src/perch-logic.ts` (no game objects, so the unit tests run them); `src/perch.ts` applies them.

- The perch block: Java's block model converted by the build (the same geometry the spike's perch
  showed in the game), Java's texture, recipe (string over a stick over any planks, unlocked by
  string) and name. It faces whoever placed it, turns its bar for east and west as Java's
  blockstates do, goes only on top of a block and pops off when that block goes, breaks in half a
  second, sounds like wood. Its collision box is the base's footprint up to the bar (Bedrock takes
  one box), so a bird stands on the bar.
- Home: a tamed bird makes the nearest perch within 8 blocks (4 up or down) with a seat for it its
  home. It goes there every night, whenever its owner is away (more than 16 blocks from the perch,
  in another world, or offline), now and then by day (Java's odds, about once a minute), and when
  called. It flies to the air above the bar, comes down onto the seat, turns to face the way the
  perch faces (back at whoever placed it), and stays: all night asleep (head tucked, quiet, a soft
  settle murmur as it settles), while its owner is away (awake, sitting, chattering), or 20 to 60
  seconds by day. A bird more than 32 blocks from its perch is any pet until it is near again;
  a broken perch frees it at once; a bird told to sit stays where it is.
- Seats and sharing: one bird to a perch, except two zebra finches, or a lovebird and its partner
  (pairs come in session 5), who sit either side of the middle of the bar, 0.2 out each way.
- Calling: using a perch with an empty hand calls your bird to it: the perch's own bird first, else
  your nearest bird within 16 blocks the perch has a seat for, which makes it home. Someone else's
  birds don't answer.
- Setting down: a bird on your shoulder goes onto the perch you use (or, if it's another bird's
  perch, hops down at your feet); a sneak-use on any block sets it down there. This waits on the
  shoulder itself (session 4) to have a bird to set down.
- Owners: the game keeps no owner a script can read once a bird is tame, so the player who tames it
  with seeds is written down on the bird. A bird tamed before this (no owner on record) takes the
  first player who uses it, and answers anyone's call until then.
- A bird on its way home or on its seat is moved by the script alone (a held body: no movement, no
  pushing, no following) and watched every tick, as Java's goal is; the rest runs once a second.
  Perches are found from a list the world keeps of placed perches, not by scanning blocks.

Differences from Java, each because Bedrock can't do it the Java way:
- A bird told to sit is not called: the script API can't stand a bird up (Java's call does).
- A bird's wandering isn't kept within 8 blocks of its perch (Java's home restriction): Bedrock has
  no way to set it from a script. A bird with its owner home follows the owner anyway, and one with
  its owner away is on its perch, so this shows little.
- The flight home is the script's (a straight glide to above the bar, then down), not the game's
  path-finding, so it can pass through leaves or a wall on the way. It is what the spike showed.
- A perch placed by a command or a structure, not by a player, isn't known to the birds.

Checks, all passing (after session 3):
- `npm test`: 25 unit tests. The birds: no component both in the base and in a group; events name
  real groups; the budgie geometry is unchanged; every Java part is a bone and every animated bone
  exists; colours, sizes and health match Java. The perch: the seat height, call reach, daytime sit,
  fly-home range and visit odds read from the Java classes; the bird faces back at the placer for
  each of the four ways; seats along the bar; who shares (two finches, a lovebird pair, nobody
  else) and which side each takes; finding the nearest free perch within reach; owner away at 16
  blocks, any pet past 32; when a bird goes home and how long it stays; which bird a call picks
  (its own first, then the nearest with a seat; not someone else's, a sitting or a shoulder bird);
  the flight comes down onto the seat from above; the perch model is Java's block model and the
  same as the spike's, its turn for east and west matches Java's blockstates, the recipe is Java's;
  each perch event leaves a bird in exactly one body; every bird has its settle sound.
- `npm run typecheck`: clean against `@minecraft/server` 2.10.0, which the pack asks for.
- `npm run validate`: 43 files, no errors against Mojang's and the community schemas (13 known
  schema lags, each explained in `tools/validate.js`). Breaking a client entity, a model and a
  render controller on purpose makes it fail, so it does catch resource-pack mistakes.
- Self-test on Bedrock Dedicated Server 1.26.63.1 and Preview 1.26.70.23, 31 cases each, and a
  restart check (two more cases across a server restart). The
  birds: for each, 30 wild birds show every colour and only those; health, flying and taming
  components are right; the spawn egg is a known item and `/summon` works; the tame event tames it
  and keeps its colour; wild birds take to the air. The perch: it places facing each of the four
  ways; with its owner home a bird claims a perch by day, roosts at night on the seat facing the
  perch's way, asleep and held still for 3 s, wakes in the morning and gets up after its sit; with
  its owner away it goes home by day and sits awake (an east perch, facing 90), asleep at night;
  carried 40 blocks off it lets go and doesn't fly back; a broken perch frees it at once; two
  budgies, one perch: one sleeps on it; two finches share it at -0.2 and 0.2 along the bar and a
  third doesn't fit; a call by the owner brings the bird to the seat and it stays a while, a
  stranger's call does nothing; a shoulder bird goes onto a used perch, and a sneak-use on the
  ground sets one down there; a sleeping bird's chunk unloads and loads again and it is still
  asleep on its seat and watched again; 16 birds on 16 perches for three nights: all asleep on
  their own seats each night, all up each morning, none lost, and the perch script's cost inside
  its budget (per tick about 0.4 ms on average, 3 to 5 ms at worst; the once-a-second pass about
  1.4 ms, 4 to 5 ms at worst). Across a server restart a lovebird asleep on a west-facing perch is
  still there, still owned, still home, asleep on the seat facing -90, and awake on it in the
  morning. No error or warning lines in the server log or content log.
  On 1.26.63.1 a freshly spawned wild flock sometimes sits perfectly still: it is being ticked
  (a push lifts it) but its wandering doesn't start for the whole 15 s, while a fresh flock flies
  at once. The fly check nudges and retries, and prints a note when it needed the second try.
  Session 3's last Preview run showed it too (two flocks, each flew on the second try), so it is
  not only the release. Worth watching for in the game: wild birds that stand still for a long time.

## Next

1. A look at the perch in the game. Already seen in pictures from the game (1.26.63): the perch's
   shape and texture; birds on it face back toward where the placer stood (north and east
   perches); two finches side by side; the finches asleep with their heads tucked. Still to see:
   placing it and the recipe, a bird landing, the budgie's pose on the bar (it stands taller than
   the finches), calling it by day, and the flight home.
2. Session 4: greeting, dusk, shoulder (with portals, logout, death), the first-roost message.
