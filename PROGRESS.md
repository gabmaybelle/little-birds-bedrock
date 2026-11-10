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

**Pairs, company, songs, breeding and chicks (2026-11-09, session 5).** Java's `Lovebird` pairs,
`ZebraFinch` company and songs, `Canary`'s morning song, and `LittleBird`'s breeding and chicks, on
Bedrock. The rules are in `src/pair-logic.ts`, `src/breed-logic.ts` and `src/song-logic.ts` (no game
objects, so the unit tests run them); `src/pairs.ts`, `src/breeding.ts` and `src/songs.ts` apply them.

- Lovebird pairs: two grown lovebirds without partners within 8 blocks of each other pair for good
  (about once a second and a half each looks, as on Java), both ways. A pair keeps together: one
  that drifts off flies back to within 2 blocks of its partner, never to a partner on a shoulder.
  A pair shares a perch side by side (session 3) and breeds only together. A partner's death ends
  the pair, and the one left pairs again. Chicks pair once grown.
- Finch company: a finch keeps near the other finches, flying back to within 2 blocks of one.
- Breeding: seeds from its owner put a tamed grown bird in love for 30 seconds, with hearts (one seed
  eaten, none in Creative). Two in love of a kind within 8 blocks come together, and after 3 seconds
  within 3 blocks a chick appears beside them. Both parents then rest 5 minutes. A lovebird falls
  in love only once it has a partner, and mates only with its partner. Someone else's bird, a wild
  bird (seeds tame it), a chick, a bird already in love or resting: no love. Getting hurt ends it.
- Chicks: half size (as Java's young), tamed to the parents' owner and following them, in one
  parent's colour at random; they grow up in twenty minutes, sooner for seeds, keep near a parent,
  and don't ride a shoulder (session 4). They give no experience.
- The canary's song: once each morning (the first three hours after sunrise), a tamed, grown canary
  that is awake and on its feet or its perch sings its song from where it sits, with its singing
  pose (head up, beak going, tail flicking) for seven seconds. Once a morning, saved with the bird.
- The finch's song: by day a tamed finch on its feet or perch sings a short phrase every 20 to 60
  seconds; finches within 8 blocks (tamed or wild) answer a second or two later, so two or three
  keep up a little back-and-forth. An answer calls for no answers; a finch just after a phrase
  doesn't answer for 5 seconds; an answer waits up to 5 seconds for a finch to land, then is dropped.

Looked at in the game (2026-11-09, 1.26.63): breeding from a player's own seeds, the chicks,
lovebird pairs, finch phrases and the canary's song all work, and sound right.

Differences from Java, each because Bedrock can't do it the Java way:
- Breeding is the script's, not the game's breedable component. With it, two fed budgies fell in
  love and came close, but one climbed far above the other and they never finished (fly navigation),
  and it can't keep a lovebird to its partner. So courting birds close in by the script's straight
  glide, as the flight home does, rather than by path-finding; and breeding gives no experience
  (Java drops 1 to 7).
- Keeping together and keeping company are the game's follow goal. It follows by path-finding as
  Java does, but whenever the bird isn't wandering, not only once it has drifted past 4 blocks; a
  finch follows a finch within reach rather than strictly the nearest. A lovebird's follow goal can
  only tell its partner by a number the pair shares (one of 15, none shared with a pair nearby).
- Wild birds despawn on Bedrock (session 2); a wild lovebird whose partner despawned waits for it
  as a Java lovebird waits for an unloaded one.
- A finch's wait for its next phrase starts afresh when it is loaded (Java saves it).

Checks after session 5:
- `npm test`: 45 unit tests (12 new). Pairs: Java's reach (8), keep-together (4, to 2) and the
  pair-up chance; the nearest lone grown lovebird pairs, not a paired one, a chick or one beyond the
  box; slots no pair nearby has, and only one of two meeting pairs moves; the follow goals (partner
  only by slot, finches, never to a shoulder bird, free birds only). Breeding: vanilla's numbers;
  who falls in love (owner, tamed, grown, not in love or resting, a lovebird only paired); who mates
  (in love, same kind, within 8; a lovebird only with its partner); a chick after 60 ticks within 3;
  the courting step; the chick's colour and owner (Java's getBreedOffspring); the chick body, growing
  up, and no breedable component left. Songs: Java's numbers; the canary once each morning and only
  tamed, grown, awake and settled; the finch's phrases, answers, quiet and patience.
- `npm run typecheck`: clean. `npm run validate`: 43 files, no errors (13 known schema lags).
- Self-test: 48 cases on each server (10 new) and the restart check, on 1.26.63.1 and Preview
  1.26.70.23. Pairs: two lone lovebirds pair within seconds, with the same slot, and a far one and
  a chick don't; two pairs side by side get different slots; a partner's death ends the pair and
  the one left pairs again; a lovebird carried 12 blocks off and a finch 7 blocks from another fly
  back to within 4. Chicks: half size, as quick as a grown bird, full size once grown. Breeding:
  a stranger's seeds do nothing; the owner's put a bird in love, once; two fed budgies have one
  chick within 10 s, tamed, the owner's, in a parent's colour, free to move; then both rest. A
  budgie and a cockatiel don't mate, nor two lovebirds of different pairs side by side; with their
  partners fed, each pair has its own chick; a lovebird on its own doesn't fall in love; getting
  hurt ends love. Songs: a tamed canary is quiet in the afternoon, sings once in the morning (the
  pose held 7 s), not again that morning, again the next; a wild one doesn't. Two finches on their
  shared perch: one sings, the other answers once within 2.5 s, the singer doesn't answer back, a
  finch 16 blocks off doesn't hear; a tamed finch sings a due phrase, a wild one doesn't.
  On the final files every case and the restart check pass on both servers, with no error or
  warning lines, except the soak's worst-moment budget: its nights all pass, but its single worst
  tick and pass go over now and then. The same soak on session 4's code, run on the same PC the
  same hour, did the same (one run at 5 and 10 ms, the next 8 and 16 ms), and one run of the new
  code matched that baseline (0.36 ms a tick and 1.43 ms a pass on average, worst 3 and 6 ms). The
  new pairs and songs loops cost 0.1 to 0.3 ms a second on average. So the budget is noisy here,
  not broken by this session; the averages are the measure to watch.
- A local simulated-player check: a chick hatched with a real player as owner is tamed to them and
  follows them. It also showed the game's own breeding failing with these birds (see above).

**Millet spray, snacks, refused foods and the settings (2026-11-09, session 6).** Java's `Foods`,
the food parts of `LittleBird.mobInteract`, and `Settings` with the spawn check, on Bedrock. The
rules are in `src/food-logic.ts` and `src/settings-logic.ts` (no game objects, so the unit tests run
them); `src/foods.ts` and `src/settings.ts` apply them.

- The millet spray: Java's item, sprite, name and recipe (wheat and two seeds, shapeless, make two;
  it unlocks once you hold wheat), with the foods in the creative inventory. It tames a wild bird on
  the first try, with hearts. For its owner's tamed bird it is a treat: a happy bob (the greeting
  pose without the call), or a song from a canary and a phrase from a finch (whose neighbours
  answer), and half a heart of health back. A treat is not a meal: for half a minute after one the
  bird takes no other and the spray stays in the hand; someone else's bird takes none. Millet in a
  hand within 10 blocks tempts a free bird to follow it, wild or tamed (not one on its perch or a
  shoulder), ahead of wandering and following its owner, as Java's tempt goal is.
- Snacks from the farm (carrot, apple, melon slice, sweet berries, glow berries, beetroot): a tamed
  bird nibbles one from its owner, crumbs of that food fly, it gets half a heart of health back, and
  then it has had enough for five seconds. A wild bird, or someone else's, takes none.
- Refused foods (cocoa beans, a poisonous potato): any bird shakes its head for a second and takes
  nothing (the head shake pose from session 2).
- Chicks: a treat or a snack from its owner grows a chick a little too, as seeds do. Only the game's
  own feeding can change a chick's age, so for a chick the food goes on to it (it takes the item)
  and the script does the rest (health, full, the bob or song).
- Treats and snacks are silent, as on Java (its birds play no eating sound for them), and neither
  makes a tamed bird sit or stand. The bird's food counts and "full" timers aren't saved, as on
  Java.
- The settings, as a form: an operator types `/little_birds:settings` (cheats needn't be on) and
  sets Java's two settings, "Wild birds spawn" and "Spawn chance" (0 to 100). They are kept on the
  world and take effect at once. A spawn rule's weight can't change while the game runs, so they
  work as Java's spawn check does: the herd in the birds' spawn rules marks a natural spawn (an
  event of its own, otherwise the same as any new bird's; the game reports eggs and commands as
  spawned too, so it can't tell them apart), and the script lets it stay only while spawning is
  on and at the chance, else takes it away the moment it appears. Spawn eggs, commands and chicks
  are never marked, so they always work. From a console or a command block the command says to
  open it as a player, with the current values.

Differences from Java, each because Bedrock can't do it the Java way:
- The settings are a form, kept with the world, and apply at once (Java's are a config file read at
  start-up). A turned-down spawn is taken away just after it appears rather than never made.
- Crumbs are bits of Bedrock's own picture of the snack (one particle per snack; a particle can't
  take an item's picture as Java's item particle does).
- A chick's growing for a treat or a snack is the game's feeding, which is Bedrock's own amount for
  a feed item (the same as for seeds since session 5), and it may make the game's eating sound.

Also this session: the soak's budget is judged on its averages (1 ms a tick, 3 ms a once-a-second
pass, 1 ms for each other watch), with a loose cap on a single slow moment (25 ms, a pass 50 ms),
since its worst-moment check failed at random on session 4's code too; and the checks' upload step
moved to version 7 of the upload action.

Checks after session 6:
- `npm test`: 55 unit tests (10 new). Foods: the treat, snacks and refused lists are Java's tags;
  Java's numbers (full 600 and 100 ticks, a 20-tick shake, 1 health); no eating sound on Java; what
  each food does for a wild bird, the owner's bird, someone else's, a full bird and a chick, in
  Java's order; the bob, the canary's song and the finch's phrase; the tempt goal (Java's priority,
  range 10, free birds only), millet on the tame list, millet and snacks growing chicks; the item,
  its sprite and name, the recipe and its unlock read from Java's files; one crumb particle per
  snack with Bedrock's sprite of it. Settings: Java's two, its defaults and its clamp; a natural
  spawn stays only while spawning is on, at the chance; every spawn rule marks its herd, and eggs,
  commands and chicks aren't marked.
- `npm run typecheck`: clean against `@minecraft/server` 2.10.0 and `@minecraft/server-ui` 2.2.0,
  which the pack asks for. `npm run validate`: 51 files, no errors (13 known schema lags); the item
  is checked against Mojang's item schema and the particles against the community one (a broken
  particle on purpose fails it).
- Self-test: 56 cases on each server (8 new) and the restart check, on 1.26.63.1 and Preview
  1.26.70.23, with no error or warning lines. Foods: the millet spray is a known item that stacks
  to 64; it tames each of the five wild birds on the first try, to whoever gave it, which can then
  move; a stranger's treat isn't taken; the owner's treat gives the bob without a greeting and
  half a heart, then nothing for half a minute, then again, never above full health; a canary
  sings for it and a finch sings a phrase; all six snacks are taken by the owner's bird with
  health back, one in five seconds, a treat still taken in between, and not by a stranger's or a
  wild bird; seeds aren't a food here; cocoa and a poisonous potato get a head shake of about a
  second from a wild bird, a stranger and the owner, with nothing taken; a chick takes its owner's
  treat and snack, not a stranger's. Settings: the defaults are on and 100; a natural spawn stays
  and loses its mark; with spawning off a natural spawn goes while an egg-style spawn, a `/summon`
  bird and a chick stay; at chance 0 it goes; at 50, some of 40 stay and some go; 250 reads back as
  100; the command is there (a made-up one fails to parse). The soak, judged on its averages: 0.37
  to 0.40 ms a tick, 1.3 to 1.5 ms a pass, 0.35 ms for the greeting watch, worst 3 to 6 ms.
  Under another program's heavy load one release run went over (0.86 ms a tick, 3.7 ms a pass, one
  30 ms tick); the same files on a quieter PC came in as above. A fresh wild flock still sometimes
  stands still for a whole first try (once, both tries); side by side with and without the new
  tempt goal it happened about as often (3 and 2 of 50 flocks), so it is the old quirk.
  Once, on Preview, the restart setup's lovebird didn't roost; it didn't happen again in three runs.
- A local simulated-player check, with real natural spawns: a simulated player in survival in a
  plains world, vanilla animals cleared, mob spawning on. On 1.26.63.1 a wild zebra finch appeared
  within minutes, marked, and passed the settings' check; with spawning off the next one was taken
  away. On Preview two finches were kept; no new one came in the 5 minutes with spawning off. The
  first try, with the mark set by a spawn condition's event rather than the herd's, found the finch
  unmarked: why the herd carries it. The same check showed that the spawn cause can't tell natural
  spawns from eggs and commands.

## Next

1. Gabby's look in the game at the foods and the settings (local notes have the list), then the
   release session: the `.mcaddon`, the listings and the cross-links.
