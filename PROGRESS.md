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
  perch, hops down at your feet); a sneak-use on any block sets it down there (the shoulder came
  in session 4).
- Owners: the game keeps no owner a script can read once a bird is tame, so the player who tames it
  with seeds is written down on the bird. A bird tamed before this (no owner on record) takes the
  first player who uses it, and answers anyone's call until then.
- A bird on its way home or on its seat is moved by the script alone (a held body: no movement, no
  pushing, no following) and watched every tick, as Java's goal is; the rest runs once a second.
  Perches are found from a list the world keeps of placed perches, not by scanning blocks.

Looked at in the game (2026-11-09, 1.26.63, a laptop): the perch and everything above work as
they should. Pictures from the game also show the birds facing back toward where the placer stood.

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

**The greeting, dusk and the shoulder (2026-11-09, session 4).** Java's `Shoulder`, the greeting
and shoulder parts of `LittleBird`, and the dusk its `RoostGoal` keys on, on Bedrock. The rules are
in `src/day-logic.ts` and `src/shoulder-logic.ts` (no game objects, so the unit tests run them);
`src/sky.ts`, `src/greeting.ts` and `src/shoulder.ts` apply them.

- Dusk: when a bird goes home to sleep is now Java's own "dark outside", worked out the same way:
  the overworld's sky light (full until 11867, down to its night level by 13670, back up from
  22330), dark once it is 4 or more down. In clear weather that is from about 12523 to 23477
  (session 3 used 13000 to 23000); rain brings dusk on at about 12000; a thunderstorm is dark all
  day, so the birds go home and sleep through one, as on Java. Never dark in the Nether or the End.
  The script can't ask the weather, only hear it change, so the last change is kept on the world.
  On its perch after dark it goes quiet (session 3's asleep body), with its settle murmur.
- The greeting: a tamed bird keeps the day-clock time its owner was last within 8 blocks, looking
  every half second. When its owner comes back within reach after an hour of the day clock or more
  away, it says hello once: its greeting call and the greeting pose (a bob of the head, a flutter
  of the wings; the cockatiel's crest up) for a second and a half, two for a cockatiel. A bird on
  its owner's shoulder is never away; a clock turned back starts the count again.
- The shoulder: sneak-use a tamed budgie, cockatiel or lovebird with an empty hand and it sits on
  your right shoulder, held there every tick facing your way, chattering. Sneak-use it again, or
  sneak-use a block, to set it down; use a perch to put it on the bar. One bird to a shoulder;
  canaries and zebra finches keep to their perches (a sneak-use asks nothing of them); someone
  else's bird doesn't come; a bird on its perch can be taken off it. It comes with you through
  portals, straight onto the shoulder on the other side. If you leave the game, die or turn
  spectator it is set down where it is. A bird left marked as on a shoulder with nothing holding it
  (a world saved with it there) goes back to its owner if they are within 32 blocks, else is set
  down: never left hanging in the air.
- On the shoulder the bird's collision box shrinks to 0.1 (its hit box stays its own size, so it
  is as easy to sneak-use off), and it sits 0.51 out instead of Java's 0.42: Bedrock pushes a
  player out of any box overlapping theirs, and in the spike that lifted a Creative player into
  flight and stopped crouching. Together they clear the player's box at every angle (the unit test
  turns all the way round). It can't suffocate in a wall beside you, as on Java.
- The bird's size stays in the entity's base, so a new bird gets no size from a component group as
  it spawns. With the size in the groups, new wild flocks stood still far more often (Preview: a
  flock stuck in 7 runs of 10, two of them through both tries, against none in 5).

Looked at in the game (2026-11-09, 1.26.63): the shoulder, the greeting and dusk all work well.

Differences from Java:
- A bird told to sit and then taken onto the shoulder sits again when set down (Java's pick-up
  stands it up; the script API can't).
- The shoulder bird is placed by the server each tick, so on a server it may trail a little when
  you run, and nothing hides it in first person (Gabby judged the spike's "close enough").
- The greeting looks every half second, as Java does, and the weather is known only from its last
  change since the pack was added.

Not built, by choice: the first-roost message. Java 0.3.0 has no "A friend at the window"
advancement (it was in the first plan, not in any release), so a Bedrock message would be new, not
a match; Gabby (2026-11-09): skip it for 0.1.0.

Checks after session 4:
- `npm test`: 33 unit tests (8 new). Dusk: dark from about 12523 to 23477 in clear weather, at 12000
  in rain, all day in a thunderstorm, and the Java roost goal and roosting are keyed to it. The
  greeting: Java's reach (8), wait (1000), how often it looks (10 ticks) and pose lengths (30, the
  cockatiel 40), read from the Java classes and matching the bird table; hello once after an hour
  away, none after 999 ticks, none on first sight, the clock turned back, never away on a shoulder,
  the next morning a hello. The shoulder: Java's seat sums (up 1.2, out to the right) at four
  angles; clear of the player's box at every angle; the shoulder body's size, hit box, no
  suffocating, chatter; canaries and finches don't ride, read from the Java classes; what a
  sneak-use does (on, off, one to a shoulder, someone else's, wild, a chick, a song bird); every
  event that takes the shoulder body off gives the size back, and no group sets it at spawn.
- `npm run typecheck`: clean. `npm run validate`: 43 files, no errors (13 known schema lags).
- Self-test: 38 cases on each server (7 new) and the restart check. Dusk: a thunderstorm by day
  sends a bird home asleep, and it wakes when the storm clears. The greeting: no hello while its
  owner is away, one hello on coming home after an hour and a half (the pose on, then off), none
  while they stay, none after half an hour, one the next morning. The shoulder: on and off by
  sneak-use, held at the seat as its owner walks and turns, facing their way, still there after
  3 s, its box 0.1 on the shoulder and 0.4 after; a second bird, a canary and a stranger's bird
  don't come on; taken from its perch and the perch lets it go; set down where it is when its owner
  dies or leaves; through to the Nether and back on the shoulder; a stray shoulder bird rejoins its
  owner or is set down; the perch's set-down cases with the real shoulder. Across a server restart
  a shoulder budgie whose owner is gone is set down, not left hanging.
  On the final files, Preview 1.26.70.23 and release 1.26.63.1 both pass all 38 and the restart
  check, with no error or warning lines. The soak's cost is as in session 3 (about 0.3 to 0.4 ms a
  tick on average, 1.2 to 1.4 ms a pass, 0.3 to 0.4 ms for the greeting watch, worst 3 to 7 ms).
  Its worst-moment budget is close: one earlier release run on the same files came to 6 ms for a
  single tick against the 5 ms budget, while its averages were unchanged.
  Wild flocks: as in session 3, a fresh flock sometimes waits for the second try before flying.

## Next

1. Session 5: lovebird pairs, finch company, songs; breeding and chicks.
