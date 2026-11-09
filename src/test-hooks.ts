// Hooks for the self-test pack (test/main.ts), which runs on a dedicated server with no player and
// can't read this pack's saved values. Each is a /scriptevent, so it needs cheats, and none of them
// does anything a player could notice in a world without the self-test:
//
//   little_birds:debug own <bird id> <owner id>          record a bird's owner
//   little_birds:debug stand_in <owner id> <x> <y> <z> [yaw] [dimension]
//                                                        an owner "standing" there (overworld unless named)
//   little_birds:debug stand_in <owner id> none          that owner gone (offline)
//   little_birds:debug perch_added <x> <y> <z>           a perch placed by command (overworld)
//   little_birds:debug use <owner id> <x> <y> <z> [sneak] [face]
//                                                        that owner uses the block with an empty hand
//   little_birds:debug bird_use <owner id> <bird id> [plain]
//                                                        that owner sneak-uses the bird with an empty hand (plain: no sneak)
//   little_birds:debug owner_travelled <owner id>        that owner changed worlds (move the stand-in first)
//   little_birds:debug owner_gone <owner id>             that owner died or left
//   little_birds:debug sing <bird id>                    the bird sings now (a finch's phrase calls for answers)
//   little_birds:debug song_due <bird id>                a finch's own phrase falls due now
//   little_birds:debug feed <owner id> <bird id>         that owner feeds the bird seeds
//   little_birds:debug hatch <bird id> <bird id>         those two have a chick now (replies with its id)
//   little_birds:debug pair <bird id> <bird id>          make two lovebirds a pair
//   little_birds:debug state <bird id>                   replies with what this pack knows of the bird
//   little_birds:debug perf                              replies with what the perch's loops cost (ms)
//
// Replies come back as /scriptevent little_birds:debug_reply <json>.
import { world, system, Direction } from "@minecraft/server";
import { NS, addPerch, blockUse, debugState, ownerIdOf, perchList, perf, standIns } from "./perch.js";
import { birdUseAction, debugShoulder, ownerGone, ownerTravelled, shoulderPerf } from "./shoulder.js";
import { debugGreeting, greetingPerf } from "./greeting.js";
import { debugPair, pairPerf, pairUp } from "./pairs.js";
import { debugSongs, finchSings, sing, songDueNow, songPerf } from "./songs.js";
import { debugBreeding, feed, hatch } from "./breeding.js";

const reply = (o: object) => system.sendScriptEvent(`${NS}:debug_reply`, JSON.stringify(o));
const overworld = () => world.getDimension("minecraft:overworld");

function run(message: string) {
  const [cmd, ...a] = message.trim().split(/\s+/);
  if (cmd === "own") {
    world.getEntity(a[0])?.setDynamicProperty(`${NS}:owner`, a[1]);
  } else if (cmd === "stand_in") {
    if (a[1] === "none") standIns.delete(a[0]);
    else standIns.set(a[0], { dimensionId: a[5] ?? "minecraft:overworld", location: { x: +a[1], y: +a[2], z: +a[3] }, yaw: a[4] === undefined ? 0 : +a[4] });
  } else if (cmd === "perch_added") {
    addPerch(overworld(), { x: +a[0], y: +a[1], z: +a[2] });
  } else if (cmd === "use") {
    const [ownerId, x, y, z] = a;
    const sneak = a.includes("sneak");
    const face = (a.find((s) => Object.values(Direction).includes(s as Direction)) as Direction | undefined) ?? Direction.Up;
    const at = standIns.get(ownerId)?.location ?? { x: +x + 0.5, y: +y, z: +z + 2.5 };
    const block = overworld().getBlock({ x: +x, y: +y, z: +z });
    const act = block && blockUse({ id: ownerId, dimension: overworld(), location: at, sneaking: sneak, emptyHand: true }, block, face);
    if (act) act();
    reply({ cmd: "use", acted: !!act });
  } else if (cmd === "bird_use") {
    const [ownerId, birdId] = a;
    const bird = world.getEntity(birdId);
    const s = standIns.get(ownerId);
    const dimension = s ? world.getDimension(s.dimensionId) : overworld();
    const act = bird && birdUseAction({ id: ownerId, dimension, location: s?.location ?? bird.location, sneaking: !a.includes("plain"), emptyHand: true }, bird);
    if (act) act();
    reply({ cmd: "bird_use", acted: !!act });
  } else if (cmd === "owner_travelled") {
    ownerTravelled(a[0]);
    reply({ cmd: "owner_travelled" });
  } else if (cmd === "owner_gone") {
    ownerGone(a[0]);
    reply({ cmd: "owner_gone" });
  } else if (cmd === "sing") {
    const bird = world.getEntity(a[0]);
    if (bird?.typeId === `${NS}:zebra_finch`) finchSings(bird);
    else if (bird) sing(bird);
    reply({ cmd: "sing" });
  } else if (cmd === "song_due") {
    const bird = world.getEntity(a[0]);
    if (bird) songDueNow(bird);
    reply({ cmd: "song_due" });
  } else if (cmd === "feed") {
    const bird = world.getEntity(a[1]);
    reply({ cmd: "feed", acted: !!bird && feed({ id: a[0], player: world.getAllPlayers().find((p) => p.id === a[0]) }, bird) });
  } else if (cmd === "hatch") {
    const x = world.getEntity(a[0]), y = world.getEntity(a[1]);
    const chick = x && y ? hatch(x, y) : undefined;
    reply({ cmd: "hatch", chick: chick?.id ?? null });
  } else if (cmd === "pair") {
    const x = world.getEntity(a[0]), y = world.getEntity(a[1]);
    if (x && y) pairUp(x, y, []);
    reply({ cmd: "pair" });
  } else if (cmd === "perf") {
    reply({ cmd: "perf", ...JSON.parse(JSON.stringify(perf)), shoulder: { ...shoulderPerf }, greeting: { ...greetingPerf }, pairs: { ...pairPerf }, songs: { ...songPerf } });
  } else if (cmd === "state") {
    const bird = world.getEntity(a[0]);
    reply({
      cmd: "state",
      id: a[0],
      valid: !!bird?.isValid,
      mode: bird?.getDynamicProperty(`${NS}:mode`) ?? "free",
      perch: bird?.getDynamicProperty(`${NS}:perch`) ?? null,
      owner: bird ? ownerIdOf(bird) ?? null : null,
      active: debugState(a[0]),
      shoulder: debugShoulder(a[0]),
      greetingPose: bird?.isValid ? bird.getProperty(`${NS}:greeting`) === true : false,
      ...(bird?.isValid ? debugGreeting(bird) : {}),
      ...(bird?.isValid ? debugPair(bird) : {}),
      ...(bird?.isValid ? debugSongs(bird) : {}),
      ...(bird?.isValid ? debugBreeding(bird) : {}),
      baby: bird?.isValid ? bird.getComponent("minecraft:is_baby") !== undefined : false,
      dimension: bird?.isValid ? bird.dimension.id : null,
      perches: perchList().length,
    });
  }
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== `${NS}:debug`) return;
  try {
    run(ev.message);
  } catch (e) {
    console.warn(`Little Birds: debug ${ev.message}: ${e}`);
  }
});
