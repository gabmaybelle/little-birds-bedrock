// Little Birds self-test: a test-only pack for a throwaway test world, never shipped. Stable script
// APIs only, so it runs on a plain dedicated server with no experiments.
//
//   /scriptevent little_birds:test          every case, then "LB TEST: DONE"
//   /scriptevent little_birds:test <name>   the cases whose name starts with <name>
//
// Each case prints "LB TEST: CASE <name>: PASS" or "... FAIL <why>"; tools/bds-check.js reads them.
// It reads only what the game shows (components, properties, positions), so it checks the birds the
// way a player would meet them.
import { world, system, ItemStack, Entity, Dimension, Vector3, BlockPermutation, WeatherType } from "@minecraft/server";

const NS = "little_birds";
const BIRDS: { id: string; colours: number; health: number; width: number; height: number }[] = [
  { id: "budgie", colours: 4, health: 5, width: 0.4, height: 0.7 },
  { id: "cockatiel", colours: 3, health: 6, width: 0.5, height: 0.9 },
  { id: "lovebird", colours: 3, health: 5, width: 0.4, height: 0.7 },
  { id: "canary", colours: 3, health: 4, width: 0.35, height: 0.5 },
  { id: "zebra_finch", colours: 3, health: 3, width: 0.3, height: 0.45 },
];
const GROUND = -60; // a flat world's surface: entities stand at y -60
const log = (s: string) => console.warn("LB TEST: " + s);
const wait = (ticks: number) => new Promise<void>((resolve) => system.runTimeout(() => resolve(), ticks));
class Fail extends Error {}
function must(cond: unknown, why: string): asserts cond {
  if (!cond) throw new Fail(why);
}
const overworld = (): Dimension => world.getDimension("minecraft:overworld");
const tamed = (e: Entity) => e.getComponent("minecraft:is_tamed") !== undefined;
const colour = (e: Entity) => e.getProperty(`${NS}:colour`) as number;
const speed = (e: Entity) => e.getComponent("minecraft:movement")?.defaultValue ?? 0;
const at = (x: number, z: number, y = GROUND): Vector3 => ({ x: x + 0.5, y, z: z + 0.5 });

// Every bird a case spawns, so a failed case still cleans up after itself.
const spawned: Entity[] = [];
function spawn(id: string, loc: Vector3): Entity {
  const e = overworld().spawnEntity(`${NS}:${id}`, loc);
  spawned.push(e);
  return e;
}
function cleanUp() {
  for (const e of spawned.splice(0)) {
    try {
      if (e.isValid) e.remove();
    } catch {
      /* already gone */
    }
  }
}

type Case = { name: string; run: () => Promise<void> };
const cases: Case[] = [];

BIRDS.forEach((b, i) => {
  const lane = i * 6 - 12; // each bird its own strip of the test area

  // A wild bird: there, the right size and health, wild and untamed, free to move, with its
  // colour property set; across 30 birds every colour turns up and no other.
  cases.push({
    name: `spawn_${b.id}`,
    run: async () => {
      const seen = new Set<number>();
      const flock: Entity[] = [];
      for (let n = 0; n < 30; n++) flock.push(spawn(b.id, at(lane + (n % 5), (n / 5) | 0)));
      await wait(10);
      for (const e of flock) {
        must(e.isValid, "a spawned bird is gone");
        const c = colour(e);
        must(Number.isInteger(c) && c >= 0 && c < b.colours, `colour ${c} is outside 0..${b.colours - 1}`);
        seen.add(c);
      }
      must(seen.size === b.colours, `only colours ${[...seen].sort().join(",")} of ${b.colours} turned up in 30 birds`);
      const e = flock[0];
      const health = e.getComponent("minecraft:health");
      must(health && health.effectiveMax === b.health, `health ${health?.effectiveMax}, expected ${b.health}`);
      must(!tamed(e), "a new bird is already tamed");
      must(e.getComponent("minecraft:tameable") !== undefined, "a wild bird has no tameable component (seeds can't tame it)");
      must(e.getComponent("minecraft:can_fly") !== undefined, "no can_fly component");
      must(e.getComponent("minecraft:navigation.fly") !== undefined, "no fly navigation");
      must(Math.abs(speed(e) - 0.4) < 1e-6, `movement ${speed(e)}, expected 0.4`);
      for (const p of ["perched", "roosting", "sitting", "shoulder", "greeting", "shaking"]) must(e.getProperty(`${NS}:${p}`) === false, `${p} is not off on a new bird`);
      // The family other add-ons and commands can use.
      must(e.matches({ families: ["little_bird", b.id] }), "not in the little_bird family");
    },
  });

  // Its spawn egg is an item the game knows, and spawns the bird.
  cases.push({
    name: `egg_${b.id}`,
    run: async () => {
      const egg = new ItemStack(`${NS}:${b.id}_spawn_egg`);
      must(egg.typeId === `${NS}:${b.id}_spawn_egg`, `the egg is ${egg.typeId}`);
      const before = overworld().getEntities({ type: `${NS}:${b.id}` }).length;
      overworld().runCommand(`summon ${NS}:${b.id} ${lane + 0.5} ${GROUND} 20.5`);
      const after = overworld().getEntities({ type: `${NS}:${b.id}` });
      for (const e of after) spawned.push(e);
      must(after.length === before + 1, "/summon made no bird");
    },
  });

  // Taming: the tame event (what seeds fire) makes it tamed and sittable, keeps its colour and lets
  // it move; it is no longer tameable or despawnable.
  cases.push({
    name: `tame_${b.id}`,
    run: async () => {
      const e = spawn(b.id, at(lane, 24));
      await wait(5);
      const c = colour(e);
      e.triggerEvent("minecraft:on_tame");
      await wait(5);
      must(tamed(e), "not tamed after the tame event");
      must(e.getComponent("minecraft:tameable") === undefined, "still tameable after taming");
      must(colour(e) === c, `its colour changed from ${c} to ${colour(e)} when tamed`);
      must(Math.abs(speed(e) - 0.4) < 1e-6, `movement ${speed(e)} after taming, expected 0.4`);
      must(e.getComponent("minecraft:leashable") !== undefined, "can't be leashed");
    },
  });

  // Flying: wild birds left alone take to the air, off the ground and more than a block and a half
  // up. A flock that hasn't moved at all in 15 s is given a nudge (an upward push) to tell a bird
  // that isn't being ticked from one whose wandering hasn't started, then a fresh flock gets a
  // second try; the case says which happened.
  cases.push({
    name: `fly_${b.id}`,
    run: async () => {
      const notes: string[] = [];
      for (let attempt = 1; attempt <= 2; attempt++) {
        const starts = [0, 1, 2].map((n) => at(lane + n * 2, 30 + attempt * 3));
        const flock = starts.map((s) => spawn(b.id, s));
        let highest = 0;
        let airborne = false;
        for (let t = 0; t < 300 && !(airborne && highest > 1.5); t += 5) {
          await wait(5);
          for (const e of flock) {
            if (!e.isValid) continue;
            const up = e.location.y - GROUND;
            highest = Math.max(highest, up);
            if (!e.isOnGround && up > 1.0) airborne = true;
          }
        }
        if (airborne && highest > 1.5) {
          if (notes.length) log(`note fly_${b.id}: flew on try ${attempt}; before that: ${notes.join("; ")}`);
          return;
        }
        const moved = flock.map((e, n) => (e.isValid ? Math.hypot(e.location.x - starts[n].x, e.location.z - starts[n].z) : -1));
        const e = flock.find((x) => x.isValid);
        let nudge = "no bird left to nudge";
        if (e) {
          const y0 = e.location.y;
          e.applyImpulse({ x: 0, y: 0.6, z: 0 });
          await wait(4);
          nudge = `a push lifted one ${(e.location.y - y0).toFixed(2)} blocks (${e.location.y - y0 > 0.2 ? "it is ticking" : "it is NOT ticking"})`;
        }
        notes.push(`try ${attempt}: highest ${highest.toFixed(2)} up, moved ${moved.map((m) => m.toFixed(2)).join("/")} blocks; ${nudge}`);
      }
      must(false, `no bird flew in two tries of 15 s: ${notes.join("; ")}`);
    },
  });

});

// ---------------------------------------------------------------- the perch
//
// The pack's test hooks (src/test-hooks.ts) stand in for a player: an owner id "standing"
// somewhere, and an empty-handed use of a block by them. The perches go south of the bird lanes,
// inside the ticking area.

const PERCH = `${NS}:perch`;
const debug = (cmd: string) => system.sendScriptEvent(`${NS}:debug`, cmd);
type State = { mode: string; perch: string | null; owner: string | null; active: string; valid: boolean; acted?: boolean; perches: number };
let replies: ((r: State & { cmd: string; id?: string }) => void)[] = [];
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== `${NS}:debug_reply`) return;
  const r = JSON.parse(ev.message);
  const waiting = replies;
  replies = [];
  for (const f of waiting) f(r);
});
/** Sends a hook and waits for its reply. */
function ask(cmd: string): Promise<State> {
  return new Promise((resolve) => {
    replies.push((r) => resolve(r));
    debug(cmd);
  });
}
async function waitFor(pred: () => boolean, ticks: number, step = 5): Promise<boolean> {
  for (let t = 0; t < ticks; t += step) {
    if (pred()) return true;
    await wait(step);
  }
  return pred();
}
const placed: Vector3[] = [];
function placePerch(x: number, z: number, facing = "north"): Vector3 {
  const loc = { x, y: GROUND, z };
  overworld().getBlock(loc)!.setPermutation(BlockPermutation.resolve(PERCH, { "minecraft:cardinal_direction": facing }));
  must(overworld().getBlock(loc)?.typeId === PERCH, `the perch did not place at ${x},${z}`);
  placed.push(loc);
  debug(`perch_added ${x} ${GROUND} ${z}`);
  return loc;
}
function clearPerches() {
  for (const loc of placed.splice(0)) {
    try {
      overworld().getBlock(loc)?.setType("minecraft:air");
    } catch {
      /* gone */
    }
  }
}
/** A tamed bird of the test owner's (or the owner given), standing at x, z. */
async function petBird(id: string, x: number, z: number, owner = "owner1"): Promise<Entity> {
  const e = spawn(id, { x: x + 0.5, y: GROUND, z: z + 0.5 });
  e.triggerEvent("minecraft:on_tame");
  await wait(2);
  debug(`own ${e.id} ${owner}`);
  return e;
}
const seatOf = (p: Vector3, along = 0, alongX = true): Vector3 => ({ x: p.x + 0.5 + (alongX ? along : 0), y: p.y + 0.75 + 0.01, z: p.z + 0.5 + (alongX ? 0 : along) });
const dist = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const perched = (e: Entity) => e.isValid && e.getProperty(`${NS}:perched`) === true;
const asleep = (e: Entity) => e.isValid && e.getProperty(`${NS}:roosting`) === true;
const onSeat = (e: Entity, p: Vector3, tol = 0.06) => perched(e) && dist(e.location, seatOf(p)) <= tol;
const yawGap = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const night = () => world.setTimeOfDay(18000);
const day = () => world.setTimeOfDay(1000);
const away = (owner = "owner1") => debug(`stand_in ${owner} none`);
const standAt = (p: Vector3, owner = "owner1") => debug(`stand_in ${owner} ${p.x + 0.5} ${GROUND} ${p.z + 2.5}`);

function perchCase(name: string, run: () => Promise<void>) {
  cases.push({
    name,
    run: async () => {
      world.gameRules.doDayLightCycle = false;
      day();
      try {
        await run();
      } finally {
        clearPerches();
        day();
        away();
        away("owner2");
      }
    },
  });
}

perchCase("perch_block", async () => {
  const item = new ItemStack(PERCH);
  must(item.typeId === PERCH, "the perch item is not known");
  for (const [i, f] of ["north", "south", "east", "west"].entries()) {
    const p = placePerch(-30 + i * 2, -20, f);
    must(overworld().getBlock(p)!.permutation.getState("minecraft:cardinal_direction") === f, `a perch placed facing ${f} reads back otherwise`);
  }
});

// The spike's first check, with Java's rules: its owner home, the bird claims the perch, flies home
// at nightfall, settles on the seat facing the perch's way, sleeps there quietly and still, wakes
// at morning on its seat, and gets up after its daytime sit (20 to 60 s).
perchCase("perch_roost_night", async () => {
  const p = placePerch(-20, -20);
  standAt(p);
  const b = await petBird("budgie", -17, -20);
  await wait(40);
  const s = await ask(`state ${b.id}`);
  must(s.perch && s.perch.endsWith(`|${p.x}|${p.y}|${p.z}`), `by day it hasn't claimed the perch (perch ${s.perch})`);
  night();
  must(await waitFor(() => onSeat(b, p) && asleep(b), 600), `no roost in 30 s: perched ${perched(b)}, ${dist(b.location, seatOf(p)).toFixed(2)} from the seat`);
  must(yawGap(b.getRotation().y, 0) < 1, `faces yaw ${b.getRotation().y.toFixed(1)}, the perch faces 0`);
  must(speed(b) === 0, `movement ${speed(b)} asleep on its perch`);
  await wait(60);
  must(onSeat(b, p, 0.05), `drifted ${dist(b.location, seatOf(p)).toFixed(3)} off the seat in 3 s`);
  day();
  must(await waitFor(() => perched(b) && !asleep(b), 40), "still asleep 2 s into the morning");
  must(await waitFor(() => !perched(b), 1300, 20), "still on its perch 65 s into the morning, with its owner home");
  must(await waitFor(() => Math.abs(speed(b) - 0.4) < 1e-6, 40), `movement ${speed(b)} after getting up`);
});

// Its owner away (offline): home by day too, awake; asleep at night; turned the perch's way (east).
perchCase("perch_owner_away", async () => {
  const p = placePerch(-10, -20, "east");
  away();
  const b = await petBird("cockatiel", -7, -22);
  must(await waitFor(() => perched(b), 400), "with its owner away it never went home by day");
  must(!asleep(b), "asleep by day");
  must(dist(b.location, seatOf(p)) < 0.06, `${dist(b.location, seatOf(p)).toFixed(2)} from the seat`);
  must(yawGap(b.getRotation().y, 90) < 1, `faces yaw ${b.getRotation().y.toFixed(1)}, an east-placed perch faces 90`);
  await wait(100);
  must(perched(b), "got up by day though its owner is still away");
  night();
  must(await waitFor(() => asleep(b), 40), "not asleep 2 s into the night");
});

// Too far from home (over 32 blocks): it doesn't fly back; any pet until it's near again.
perchCase("perch_too_far", async () => {
  const p = placePerch(0, -20);
  away();
  const b = await petBird("budgie", 2, -20);
  must(await waitFor(() => perched(b), 400), "never went home");
  b.teleport({ x: 0.5, y: GROUND, z: -20.5 - 40 });
  must(await waitFor(() => !perched(b) && Math.abs(speed(b) - 0.4) < 1e-6, 60), "still held after being carried 40 blocks off");
  await wait(60);
  must(dist(b.location, seatOf(p)) > 30, `flew back from 40 blocks (now ${dist(b.location, seatOf(p)).toFixed(1)} off)`);
});

// The perch broken under a sleeping bird: it gets up at once, forgets the perch, can move.
perchCase("perch_broken", async () => {
  const p = placePerch(10, -20);
  away();
  const b = await petBird("lovebird", 12, -20);
  night();
  must(await waitFor(() => onSeat(b, p) && asleep(b), 600), "never roosted");
  overworld().getBlock(p)!.setType("minecraft:air");
  must(await waitFor(() => !perched(b) && Math.abs(speed(b) - 0.4) < 1e-6, 40), "still held 2 s after its perch went");
  const s = await ask(`state ${b.id}`);
  must(s.perch === null && s.mode === "free", `remembers ${s.perch}, mode ${s.mode}`);
});

// One budgie to a perch: of two, exactly one sleeps on it, and the other stays a free pet.
perchCase("perch_one_budgie", async () => {
  const p = placePerch(20, -20);
  away();
  const a = await petBird("budgie", 22, -20), b = await petBird("budgie", 18, -21);
  night();
  must(await waitFor(() => onSeat(a, p) || onSeat(b, p), 600), "neither roosted");
  await wait(100);
  must(perched(a) !== perched(b), `perched: ${perched(a)} and ${perched(b)}`);
  const other = perched(a) ? b : a;
  must(Math.abs(speed(other) - 0.4) < 1e-6, `the second bird has movement ${speed(other)}`);
});

// Two finches share a perch: both sleep on it, either side of the middle of the bar.
perchCase("perch_finches_share", async () => {
  const p = placePerch(30, -20);
  away();
  const a = await petBird("zebra_finch", 32, -20), b = await petBird("zebra_finch", 28, -21);
  night();
  must(await waitFor(() => perched(a) && perched(b), 600), `perched: ${perched(a)} and ${perched(b)}`);
  await wait(40);
  const sides = [a, b].map((e) => e.location.x - (p.x + 0.5)).sort((x, y) => x - y);
  must(Math.abs(sides[0] + 0.2) < 0.06 && Math.abs(sides[1] - 0.2) < 0.06, `sit at ${sides.map((s) => s.toFixed(2)).join(" and ")} along the bar, not -0.2 and 0.2`);
  for (const e of [a, b]) must(Math.abs(e.location.z - (p.z + 0.5)) < 0.06 && Math.abs(e.location.y - seatOf(p).y) < 0.06, "off the bar");
  const third = await petBird("zebra_finch", 30, -23);
  await wait(100);
  must(!perched(third), "a third finch squeezed on");
});

// Calling: using the perch with an empty hand by day calls your bird; it flies over and sits a while.
// A stranger's use calls nothing.
perchCase("perch_call", async () => {
  const p = placePerch(-30, -35);
  standAt(p);
  const b = await petBird("canary", -24, -35);
  const stranger = await ask(`use owner2 ${p.x} ${p.y} ${p.z}`);
  must(!stranger.acted, "a stranger's use called the bird");
  const use = await ask(`use owner1 ${p.x} ${p.y} ${p.z}`);
  must(use.acted, "the owner's use did nothing");
  must(await waitFor(() => onSeat(b, p), 300), `not on the seat 15 s after the call (${dist(b.location, seatOf(p)).toFixed(2)} off)`);
  must(!asleep(b), "asleep by day");
  await wait(100);
  must(perched(b), "left within 5 s, short of its daytime sit");
  const again = await ask(`use owner1 ${p.x} ${p.y} ${p.z}`);
  must(!again.acted, "calling a bird already on its seat did something");
});

// Setting down: a bird on your shoulder goes onto a perch you use, or onto the block you sneak-use.
perchCase("perch_set_down", async () => {
  const p = placePerch(-15, -35);
  standAt(p);
  const b = await petBird("budgie", p.x, p.z + 3);
  must((await ask(`bird_use owner1 ${b.id}`)).acted && (await waitFor(() => onShoulder(b), 10, 1)), "the budgie did not go onto the shoulder");
  const use = await ask(`use owner1 ${p.x} ${p.y} ${p.z}`);
  must(use.acted, "using the perch with a bird on the shoulder did nothing");
  must(await waitFor(() => onSeat(b, p), 10, 1), "not straight onto the seat");
  must(b.getProperty(`${NS}:shoulder`) === false, "still on the shoulder");
  // Another bird on the shoulder, and a sneak-use on the ground beside: it hops down there.
  const c = await petBird("cockatiel", p.x, p.z + 3);
  must((await ask(`bird_use owner1 ${c.id}`)).acted && (await waitFor(() => onShoulder(c), 10, 1)), "the cockatiel did not go onto the shoulder");
  const ground = { x: p.x + 3, y: GROUND - 1, z: p.z + 3 };
  const sneak = await ask(`use owner1 ${ground.x} ${ground.y} ${ground.z} sneak Up`);
  must(sneak.acted, "a sneak-use of the ground did nothing");
  await wait(5);
  must(c.getProperty(`${NS}:shoulder`) === false, "still on the shoulder after the sneak-use");
  must(dist(c.location, { x: ground.x + 0.5, y: GROUND, z: ground.z + 0.5 }) < 0.6, `not set down on the block (${dist(c.location, { x: ground.x + 0.5, y: GROUND, z: ground.z + 0.5 }).toFixed(2)} off)`);
});

// ---------------------------------------------------------------- dusk, the greeting, the shoulder

const onShoulder = (e: Entity) => e.isValid && e.getProperty(`${NS}:shoulder`) === true;
const greetingPose = (e: Entity) => e.isValid && e.getProperty(`${NS}:greeting`) === true;
type Full = State & { shoulder: string; greetingPose: boolean; lastSaw: number; greetings: number; clock: number; dimension: string | null };
const full = async (e: Entity) => (await ask(`state ${e.id}`)) as unknown as Full;
/** Java's seat: up 1.2 from the owner's feet, out to the right (0.51 here: see shoulder-logic.ts). */
const shoulderSpot = (o: Vector3, yaw: number): Vector3 => {
  const r = (yaw * Math.PI) / 180;
  return { x: o.x - Math.cos(r) * 0.51, y: o.y + 1.2, z: o.z - Math.sin(r) * 0.51 };
};
/** The width of the bird's collision box, as the game has it now. */
const box = (e: Entity) => ({ width: Math.round(e.getAABB().extent.x * 2 * 1000) / 1000 });

// Dusk in a thunderstorm: dark outside by day, as on Java, so a bird with its owner home goes to its
// perch and sleeps; when the storm clears it wakes.
perchCase("dusk_thunder", async () => {
  const p = placePerch(-30, -28);
  standAt(p);
  const b = await petBird("budgie", -27, -28);
  await wait(40);
  must(!asleep(b), "asleep by day before the storm");
  overworld().setWeather(WeatherType.Thunder, 20 * 600);
  try {
    must(await waitFor(() => onSeat(b, p) && asleep(b), 600), `no roost in the thunderstorm: perched ${perched(b)}, asleep ${asleep(b)}`);
    overworld().setWeather(WeatherType.Clear, 20 * 600);
    must(await waitFor(() => perched(b) && !asleep(b), 60), "still asleep 3 s after the storm cleared");
  } finally {
    overworld().setWeather(WeatherType.Clear, 20 * 600);
  }
});

// The greeting: its owner back within 8 blocks after an hour of the day clock away gets one hello
// (the call, and the pose for 30 ticks); back after less than an hour, or staying near, gets none.
perchCase("greeting_home", async () => {
  const b = await petBird("lovebird", -20, -28);
  // The owner keeps close to the bird (it wanders), and moves well off when away.
  let near = true;
  const follow = system.runInterval(() => {
    if (near && b.isValid) debug(`stand_in owner1 ${b.location.x + 2} ${b.location.y} ${b.location.z}`);
  }, 2);
  let wasPose = false, posesOn = 0;
  const trace = system.runInterval(() => {
    const p = greetingPose(b);
    if (p && !wasPose) posesOn++;
    if (p && !wasPose) log(`note greeting pose on at tick ${system.currentTick}, near ${near}, clock ${world.getDay() * 24000 + world.getTimeOfDay()}, bird ${b.location.x.toFixed(1)},${b.location.y.toFixed(1)},${b.location.z.toFixed(1)}`);
    wasPose = p;
  }, 1);
  try {
    world.setTimeOfDay(1000);
    await wait(30);
    let s = await full(b);
    must(s.lastSaw >= 0 && s.greetings === 0, `seen at once, no hello yet: last saw ${s.lastSaw}, ${s.greetings} greetings`);
    // Away for an hour and a half of the day clock, then back.
    near = false;
    debug(`stand_in owner1 ${b.location.x + 40} ${GROUND} ${b.location.z}`);
    await wait(30);
    world.setTimeOfDay(2500);
    await wait(30);
    must((await full(b)).greetings === 0, "said hello while its owner was still away");
    near = true;
    must(await waitFor(() => greetingPose(b), 40, 1), "no greeting pose within two seconds of coming home");
    s = await full(b);
    must(s.greetings === 1, `${s.greetings} greetings on coming home`);
    must(await waitFor(() => !greetingPose(b), 45, 1), "the greeting pose did not end");
    await wait(60);
    must((await full(b)).greetings === 1, "a second hello while its owner stayed near");
    // Away for less than an hour: no hello.
    near = false;
    debug(`stand_in owner1 ${b.location.x + 40} ${GROUND} ${b.location.z}`);
    await wait(30);
    world.setTimeOfDay(3000);
    near = true;
    await wait(40);
    must((await full(b)).greetings === 1, "said hello after only half an hour away");
    // Away overnight: on Bedrock, setting the time to an earlier hour rolls on to the next day (the
    // day clock never runs back that way), so this is the next morning, and a hello.
    near = false;
    debug(`stand_in owner1 ${b.location.x + 40} ${GROUND} ${b.location.z}`);
    await wait(30);
    const before = (await full(b)).clock;
    world.setTimeOfDay(1000);
    await wait(30);
    const after = (await full(b)).clock;
    must(after > before, `the day clock went back (${before} to ${after}) when the time was set to morning`);
    const posesBefore = posesOn;
    const countBefore = (await full(b)).greetings;
    must(countBefore === 1, `said hello while its owner was away overnight (${countBefore} greetings, clock ${before} then ${after})`);
    near = true;
    let s2: Full = await full(b);
    for (let t = 0; t < 100 && s2.greetings < 2; t += 5) {
      await wait(5);
      s2 = await full(b);
    }
    must(s2.greetings === 2, `no hello the next morning: ${s2.greetings} greetings in all, clock ${before} then ${after}, last saw ${s2.lastSaw}`);
    must(await waitFor(() => posesOn > posesBefore, 40, 1), "the next morning's hello was counted but its pose never showed");
  } finally {
    system.clearRun(follow);
    system.clearRun(trace);
  }
});

// The shoulder: a sneak-use puts a tamed bird on its owner's right shoulder, held there every tick
// as the owner moves and turns, its box small and clear of the owner's; one bird to a shoulder;
// song birds and strangers' birds don't come; a sneak-use takes it off and it is free again.
perchCase("shoulder_on_off", async () => {
  const o = { x: -9.5, y: GROUND, z: -27.5 };
  debug(`stand_in owner1 ${o.x} ${o.y} ${o.z} 0`);
  const b = await petBird("budgie", -10, -26);
  must((await ask(`bird_use owner1 ${b.id}`)).acted, "the sneak-use did nothing");
  must(await waitFor(() => onShoulder(b), 10, 1), "not on the shoulder");
  must(await waitFor(() => dist(b.location, shoulderSpot(o, 0)) < 0.05, 10, 1), `${dist(b.location, shoulderSpot(o, 0)).toFixed(2)} from the shoulder`);
  must(speed(b) === 0, `movement ${speed(b)} on a shoulder`);
  must(Math.abs(box(b).width - 0.1) < 1e-6, `collision box ${box(b).width} wide on a shoulder, expected 0.1`);
  must((await full(b)).shoulder === "held for owner1", "the shoulder loop doesn't hold it");
  // The owner walks on and turns: the bird keeps to the shoulder, facing their way.
  const o2 = { x: o.x + 3, y: GROUND, z: o.z + 1 };
  debug(`stand_in owner1 ${o2.x} ${o2.y} ${o2.z} 90`);
  must(await waitFor(() => dist(b.location, shoulderSpot(o2, 90)) < 0.05, 10, 1), `didn't follow: ${dist(b.location, shoulderSpot(o2, 90)).toFixed(2)} off`);
  must(yawGap(b.getRotation().y, 90) < 1, `faces ${b.getRotation().y.toFixed(1)}, its owner faces 90`);
  await wait(60);
  must(onShoulder(b) && dist(b.location, shoulderSpot(o2, 90)) < 0.05, "fell or drifted off the shoulder in 3 s");
  // One bird to a shoulder; a song bird keeps to its perch; a stranger's sneak-use isn't the shoulder's.
  const second = await petBird("cockatiel", -8, -26);
  await ask(`bird_use owner1 ${second.id}`);
  await wait(5);
  must(!onShoulder(second), "a second bird went onto the same shoulder");
  const canary = await petBird("canary", -8, -25);
  const c = await ask(`bird_use owner1 ${canary.id}`);
  await wait(5);
  must(c.acted && !onShoulder(canary), "a canary went onto the shoulder (or the use went on to sit it)");
  const theirs = await petBird("lovebird", -8, -24, "owner2");
  must(!(await ask(`bird_use owner1 ${theirs.id}`)).acted, "someone else's bird answered");
  // Off again: free, its own size, moving.
  must((await ask(`bird_use owner1 ${b.id}`)).acted, "the second sneak-use did nothing");
  must(await waitFor(() => !onShoulder(b) && Math.abs(speed(b) - 0.4) < 1e-6, 20, 1), `still held after the sneak-use off (movement ${speed(b)})`);
  must(Math.abs(box(b).width - 0.4) < 1e-6, `collision box ${box(b).width} wide after, expected 0.4`);
  must((await full(b)).shoulder === "not held", "still in the shoulder loop");
});

// A bird on its perch can be taken onto the shoulder, and the perch lets it go.
perchCase("shoulder_from_perch", async () => {
  const p = placePerch(0, -28);
  away();
  const b = await petBird("cockatiel", 2, -28);
  must(await waitFor(() => perched(b), 400), "never went home");
  debug(`stand_in owner1 ${p.x + 0.5} ${GROUND} ${p.z + 2.5} 180`);
  must((await ask(`bird_use owner1 ${b.id}`)).acted, "the sneak-use did nothing");
  must(await waitFor(() => onShoulder(b) && !perched(b), 10, 1), `perched ${perched(b)}, shoulder ${onShoulder(b)}`);
  await wait(60);
  must(onShoulder(b) && !perched(b), "the perch took it back off the shoulder");
  must(dist(b.location, shoulderSpot({ x: p.x + 0.5, y: GROUND, z: p.z + 2.5 }, 180)) < 0.05, "not on the shoulder");
});

// Its owner goes for good: dying sets it down where it is; leaving the game too.
perchCase("shoulder_owner_gone", async () => {
  debug(`stand_in owner1 10.5 ${GROUND} -27.5 0`);
  const b = await petBird("budgie", 10, -26);
  await ask(`bird_use owner1 ${b.id}`);
  must(await waitFor(() => onShoulder(b), 10, 1), "not on the shoulder");
  const at = b.location;
  await ask("owner_gone owner1");
  must(await waitFor(() => !onShoulder(b) && Math.abs(speed(b) - 0.4) < 1e-6, 10, 1), "still held after its owner died");
  must(dist(b.location, at) < 1.5, "not set down where it was");
  // On again, then its owner leaves the game (the stand-in is gone): set down by the tick.
  await ask(`bird_use owner1 ${b.id}`);
  must(await waitFor(() => onShoulder(b), 10, 1), "not back on the shoulder");
  away();
  must(await waitFor(() => !onShoulder(b) && Math.abs(speed(b) - 0.4) < 1e-6, 10, 1), "still held after its owner left");
});

// Through a portal: its owner goes to the Nether and the bird comes along, straight onto the
// shoulder; back again the same way.
perchCase("shoulder_portal", async () => {
  const nether = world.getDimension("minecraft:nether");
  nether.runCommand("tickingarea add circle 0 64 0 1 lbnether");
  try {
    await wait(60);
    debug(`stand_in owner1 20.5 ${GROUND} -27.5 0`);
    const b = await petBird("lovebird", 20, -26);
    await ask(`bird_use owner1 ${b.id}`);
    must(await waitFor(() => onShoulder(b), 10, 1), "not on the shoulder");
    const there = { x: 0.5, y: 100, z: 0.5 };
    debug(`stand_in owner1 ${there.x} ${there.y} ${there.z} 0 minecraft:nether`);
    await ask("owner_travelled owner1");
    let s: Full | undefined, arrived = false;
    for (let t = 0; t < 100 && !arrived; t += 5) {
      await wait(5);
      s = await full(b);
      arrived = s.dimension === "minecraft:nether" && s.shoulder.startsWith("held");
    }
    must(arrived, `not in the Nether on the shoulder after 5 s: ${JSON.stringify(s)}`);
    const inNether = nether.getEntities({ families: ["little_bird"], location: there, maxDistance: 3 })[0];
    must(inNether && onShoulder(inNether) && dist(inNether.location, shoulderSpot(there, 0)) < 0.1, "not at its owner's shoulder in the Nether");
    spawned.push(inNether);
    debug(`stand_in owner1 20.5 ${GROUND} -27.5 0`);
    await ask("owner_travelled owner1");
    let back: Entity | undefined;
    must(await waitFor(() => (back = overworld().getEntities({ families: ["little_bird"], location: { x: 20.5, y: GROUND, z: -27.5 }, maxDistance: 3 }).find(onShoulder)) !== undefined, 100), "did not come back to the overworld");
    spawned.push(back!);
    must(await waitFor(() => dist(back!.location, shoulderSpot({ x: 20.5, y: GROUND, z: -27.5 }, 0)) < 0.1, 20, 1), "not on the shoulder back home");
  } finally {
    nether.runCommand("tickingarea remove lbnether");
  }
});

// A bird marked as on a shoulder that nothing holds (a world saved with it there): back onto its
// owner's shoulder if they are near, else set down. Never left hanging in the air.
perchCase("shoulder_stray", async () => {
  debug(`stand_in owner1 30.5 ${GROUND} -27.5 0`);
  const b = await petBird("budgie", 30, -26);
  b.triggerEvent(`${NS}:shoulder`);
  b.setProperty(`${NS}:shoulder`, true);
  must(await waitFor(() => dist(b.location, shoulderSpot({ x: 30.5, y: GROUND, z: -27.5 }, 0)) < 0.05, 40), "did not rejoin its owner's shoulder");
  must((await full(b)).shoulder === "held for owner1", "not held after rejoining");
  const c = await petBird("cockatiel", 32, -58);
  away();
  c.triggerEvent(`${NS}:shoulder`);
  c.setProperty(`${NS}:shoulder`, true);
  must(await waitFor(() => !onShoulder(c) && Math.abs(speed(c) - 0.4) < 1e-6, 40), "left hanging with its owner gone");
});

// A sleeping bird's chunk unloads and loads again: still asleep, on its seat, watched again.
perchCase("perch_chunk_unload", async () => {
  const d = overworld();
  d.runCommand("tickingarea add circle 400 -60 0 1 lbfar");
  try {
    await wait(60);
    const p = placePerch(400, 0);
    away();
    const b = await petBird("budgie", 402, 0);
    b.addTag("lb_unload");
    night();
    must(await waitFor(() => onSeat(b, p) && asleep(b), 600), "never roosted");
    d.runCommand("tickingarea remove lbfar");
    must(await waitFor(() => !b.isValid, 400), "the chunk did not unload (the bird is still there), so this proves nothing");
    d.runCommand("tickingarea add circle 400 -60 0 1 lbfar");
    let back: Entity | undefined;
    must(await waitFor(() => (back = d.getEntities({ tags: ["lb_unload"] })[0]) !== undefined, 400), "the bird did not come back with its chunk");
    spawned.push(back!);
    must(await waitFor(() => onSeat(back!, p) && asleep(back!), 60), `back ${dist(back!.location, seatOf(p)).toFixed(3)} from the seat, asleep ${asleep(back!)}`);
    await wait(60);
    must(onSeat(back!, p, 0.05), "drifted off the seat after the reload");
    const s = await ask(`state ${back!.id}`);
    must(s.active.startsWith("perched"), `not watched again after the reload (${s.active})`);
  } finally {
    try {
      d.runCommand("tickingarea remove lbfar");
    } catch {
      /* already gone */
    }
  }
});

// Many birds, several nights: every bird home each night on its own perch, up each morning, none
// lost, and what the scripts cost measured. Judged on the averages (budget: 1 ms a tick, 3 ms a
// once-a-second pass, 1 ms for each other watch); a single slow moment fails only past a loose cap
// (25 ms a tick or a watch, 50 ms a pass): one tick on a busy PC can take several times its usual.
perchCase("perch_soak", async () => {
  const n = 16, nights = 3, perches: Vector3[] = [], flock: Entity[] = [];
  const facings = ["north", "south", "east", "west"];
  for (let i = 0; i < n; i++) {
    const x = -40 + 3 * (i % 4), z = -50 + 3 * Math.floor(i / 4);
    perches.push(placePerch(x, z, facings[i % 4]));
    flock.push(await petBird(["budgie", "cockatiel", "lovebird", "canary"][i % 4], x + 1, z + 1));
  }
  debug(`stand_in owner1 -35 ${GROUND} -45`); // home: within 16 blocks of every perch
  // A paired lovebird keeps its side of the bar (0.2 from the middle) even with its partner on another perch, as on Java.
  const seatDist = (b: Entity, p: Vector3) => Math.min(...[0, 0.2, -0.2].flatMap((al) => [dist(b.location, seatOf(p, al, true)), dist(b.location, seatOf(p, al, false))]));
  const onSeatAny = (b: Entity) => perches.some((p) => seatDist(b, p) <= 0.06);
  const p0 = (await ask("perf")) as unknown as Perf;
  for (let k = 1; k <= nights; k++) {
    night();
    must(await waitFor(() => flock.every((b) => asleep(b) && onSeatAny(b)), 1200, 20), `night ${k}: ${flock.filter(asleep).length} of ${n} asleep after 60 s`);
    await wait(60);
    const off = flock.map((b) => Math.min(...perches.map((p) => seatDist(b, p))));
    must(Math.max(...off) <= 0.06, `night ${k}: a bird is ${Math.max(...off).toFixed(3)} from any seat`);
    const seats = new Set(flock.map((b) => perches.findIndex((p) => seatDist(b, p) <= 0.06)));
    must(seats.size === n && !seats.has(-1), `night ${k}: ${n} birds on ${seats.size} seats`);
    day();
    // Each gets up after its daytime sit (20 to 60 s); one that is up may go back for a daytime
    // visit (about once a minute, as on Java), so each is watched for having been up at all.
    const up = new Set<string>();
    must(await waitFor(() => {
      for (const b of flock) if (!perched(b)) up.add(b.id);
      return up.size === n;
    }, 1400, 20), `morning ${k}: ${n - up.size} never got up in 70 s`);
  }
  must(flock.every((b) => b.isValid), `${flock.filter((b) => !b.isValid).length} birds lost`);
  const p1 = (await ask("perf")) as unknown as Perf;
  const tick = { runs: p1.tick.runs - p0.tick.runs, ms: p1.tick.ms - p0.tick.ms }, sec = { runs: p1.second.runs - p0.second.runs, ms: p1.second.ms - p0.second.ms };
  log(`note perch_soak cost: per tick ${(tick.ms / tick.runs).toFixed(3)} ms mean, ${p1.tick.max} ms worst; once-a-second pass ${(sec.ms / sec.runs).toFixed(2)} ms mean, ${p1.second.max} ms worst (${n} birds, ${nights} nights, ${tick.runs} ticks); greeting watch ${(p1.greeting.ms / Math.max(1, p1.greeting.runs)).toFixed(2)} ms mean, ${p1.greeting.max} ms worst; pairs ${(p1.pairs.ms / Math.max(1, p1.pairs.runs)).toFixed(2)} ms mean, ${p1.pairs.max} worst; songs ${(p1.songs.ms / Math.max(1, p1.songs.runs)).toFixed(2)} ms mean, ${p1.songs.max} worst`);
  const mean = (r: Run, r0: Run) => (r.ms - r0.ms) / Math.max(1, r.runs - r0.runs);
  const over: string[] = [];
  if (tick.ms / tick.runs > 1) over.push(`per tick ${(tick.ms / tick.runs).toFixed(3)} ms on average (budget 1)`);
  if (sec.ms / sec.runs > 3) over.push(`once-a-second pass ${(sec.ms / sec.runs).toFixed(2)} ms on average (budget 3)`);
  for (const w of ["greeting", "pairs", "songs"] as const) if (mean(p1[w], p0[w]) > 1) over.push(`${w} ${mean(p1[w], p0[w]).toFixed(2)} ms on average (budget 1)`);
  if (p1.tick.max > 25) over.push(`one tick took ${p1.tick.max} ms (cap 25)`);
  if (p1.second.max > 50) over.push(`one pass took ${p1.second.max} ms (cap 50)`);
  for (const w of ["greeting", "pairs", "songs"] as const) if (p1[w].max > 25) over.push(`one ${w} watch took ${p1[w].max} ms (cap 25)`);
  must(over.length === 0, `over budget: ${over.join("; ")}`);
});
type Run = { runs: number; ms: number; max: number };
type Perf = { tick: Run; second: Run; shoulder: Run; greeting: Run; pairs: Run; songs: Run };

// ---------------------------------------------------------------- pairs, company, chicks, songs (session 5)
//
// North of the bird lanes (z 40 to 56), inside the ticking area.

type Bird = State & { partner: string | null; slot: number | null; songs: number; singingPose: boolean; baby: boolean; owner: string | null };
const birdState = (e: Entity) => ask(`state ${e.id}`) as Promise<Bird>;
async function states(list: Entity[]): Promise<Bird[]> {
  const out: Bird[] = [];
  for (const e of list) out.push(await birdState(e));
  return out;
}
/** Asks after a bird every half second until the test holds; the last state either way. */
async function waitState(e: Entity, pred: (s: Bird) => boolean, ticks: number): Promise<Bird> {
  let s = await birdState(e);
  for (let t = 0; t < ticks && !pred(s); t += 10) {
    await wait(10);
    s = await birdState(e);
  }
  return s;
}
const flat = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
const summonChick = (id: string, x: number, z: number): Entity => {
  const e = overworld().spawnEntity(`${NS}:${id}`, at(x, z), { spawnEvent: `${NS}:born` });
  spawned.push(e);
  return e;
};

// Two lone grown lovebirds within 8 blocks pair for good, both ways, with the same slot; a third far
// off and a chick beside them stay on their own.
perchCase("pair_up", async () => {
  const a = spawn("lovebird", at(-30, 44)), b = spawn("lovebird", at(-26, 44)), far = spawn("lovebird", at(10, 44));
  const chick = summonChick("lovebird", -28, 46);
  let sa = await waitState(a, (x) => x.partner === b.id, 400);
  let sb = await birdState(b);
  must(sa.partner === b.id && sb.partner === a.id, `not paired after 20 s: a's partner ${sa?.partner}, b's ${sb?.partner}`);
  await wait(30);
  sa = await birdState(a);
  sb = await birdState(b);
  must(sa.slot !== null && sa.slot > 0 && sa.slot === sb.slot, `slots ${sa.slot} and ${sb.slot}`);
  const [sf, sc] = await states([far, chick]);
  must(sf.partner === null && sf.slot === 0, `the far lovebird paired (${sf.partner})`);
  must(sc.baby, "the chick is not a chick");
  must(sc.partner === null, "the chick paired");
});

// Two pairs side by side carry different slots; a death ends a pair, and the one left pairs again.
perchCase("pair_slots_death", async () => {
  const a = spawn("lovebird", at(-20, 48)), b = spawn("lovebird", at(-19, 48));
  const c = spawn("lovebird", at(-16, 48)), d = spawn("lovebird", at(-15, 48));
  await ask(`pair ${a.id} ${b.id}`);
  await ask(`pair ${c.id} ${d.id}`);
  await wait(50);
  const s = await states([a, b, c, d]);
  must(s[0].partner === b.id && s[2].partner === d.id, "the pairs did not hold");
  must(s[0].slot === s[1].slot && s[2].slot === s[3].slot, `slots ${s.map((x) => x.slot).join(",")}: a pair's two differ`);
  must(s[0].slot !== s[2].slot && s[0].slot! > 0 && s[2].slot! > 0, `slots ${s.map((x) => x.slot).join(",")}: the two pairs share one`);
  b.kill();
  await wait(10);
  const sa = await birdState(a);
  must(sa.partner === null && sa.slot === 0, `still paired after its partner died (${sa.partner}, slot ${sa.slot})`);
  const e = spawn("lovebird", at(-21, 50));
  const again = await waitState(a, (x) => x.partner === e.id, 400);
  must(again.partner === e.id, "the widowed lovebird did not pair with a new one in 20 s");
});

// A lovebird drifted from its partner flies back within 2 to 4 blocks; it passes over another pair.
perchCase("pair_together", async () => {
  const a = spawn("lovebird", at(0, 52)), b = spawn("lovebird", at(1, 52));
  await ask(`pair ${a.id} ${b.id}`);
  await wait(40);
  b.teleport(at(12, 52, GROUND + 1));
  const back = await waitFor(() => a.isValid && b.isValid && flat(a.location, b.location) <= P_TOGETHER, 900, 10);
  must(back, `still ${flat(a.location, b.location).toFixed(1)} blocks apart after 45 s`);
});
const P_TOGETHER = 4.5;

// A finch drifted from the others flies back to the nearest one.
perchCase("finch_company", async () => {
  const a = spawn("zebra_finch", at(20, 52)), b = spawn("zebra_finch", at(27, 52));
  const back = await waitFor(() => a.isValid && b.isValid && flat(a.location, b.location) <= P_TOGETHER, 900, 10);
  must(back, `still ${flat(a.location, b.location).toFixed(1)} blocks apart after 45 s`);
});

// A chick: half size and as quick as a grown bird; growing up gives it its full size back.
perchCase("chick", async () => {
  const c = summonChick("budgie", -30, 54);
  await wait(5);
  const box = c.getAABB();
  must(c.getComponent("minecraft:is_baby") !== undefined, "not a baby");
  must(Math.abs(box.extent.x * 2 - 0.2) < 0.03, `chick width ${(box.extent.x * 2).toFixed(2)}, expected 0.2 (half of 0.4)`);
  must(Math.abs(speed(c) - 0.4) < 1e-6, `a chick's movement ${speed(c)}`);
  c.triggerEvent(`${NS}:grown_up`);
  await wait(5);
  must(c.getComponent("minecraft:is_baby") === undefined, "still a baby after growing up");
  must(Math.abs(c.getAABB().extent.x * 2 - 0.4) < 0.03, `grown width ${(c.getAABB().extent.x * 2).toFixed(2)}`);
});

type Breed = Bird & { inLove: boolean; restLeft: number; courting: string | null; chick?: string | null };
const breedState = (e: Entity) => ask(`state ${e.id}`) as Promise<Breed>;
const feedBy = async (owner: string, e: Entity) => (await ask(`feed ${owner} ${e.id}`)).acted === true;
const chicksAround = (id: string, p: Vector3, not: string[]) =>
  overworld().getEntities({ type: `${NS}:${id}`, location: p, maxDistance: 10 }).filter((e) => e.getComponent("minecraft:is_baby") !== undefined && !not.includes(e.id));
async function waitChick(id: string, p: Vector3, not: string[], ticks: number): Promise<Entity | undefined> {
  for (let t = 0; t <= ticks; t += 5) {
    const c = chicksAround(id, p, not)[0];
    if (c) {
      spawned.push(c);
      return c;
    }
    await wait(5);
  }
  return undefined;
}

// Two tamed budgies their owner feeds: in love, they come together, a chick: tamed to their owner,
// in one parent's colour, free to move. Then both rest; a stranger's seeds do nothing.
perchCase("breed_budgies", async () => {
  const a = await petBird("budgie", -20, 50), b = await petBird("budgie", -16, 50);
  a.setProperty(`${NS}:colour`, 1);
  b.setProperty(`${NS}:colour`, 3);
  must(!(await feedBy("owner2", a)), "a stranger's seeds made it fall in love");
  must(await feedBy("owner1", a), "its owner's seeds did not make it fall in love");
  must((await breedState(a)).inLove, "not in love after the seeds");
  must(!(await feedBy("owner1", a)), "fell in love again while in love");
  must(await feedBy("owner1", b), "the second bird did not fall in love");
  const chick = await waitChick("budgie", a.location, [a.id, b.id], 200);
  must(chick, "no chick 10 s after both were fed");
  await wait(5);
  must(tamed(chick), "the chick is not tamed");
  must([1, 3].includes(colour(chick)), `the chick's colour is ${colour(chick)}, not a parent's (1 or 3)`);
  must(Math.abs(speed(chick) - 0.4) < 1e-6, `the chick's movement ${speed(chick)}`);
  const s = await breedState(chick);
  must(s.owner === "owner1", `the chick's owner is ${s.owner}`);
  const sa = await breedState(a);
  must(!sa.inLove && sa.restLeft > 5900, `a parent after the chick: in love ${sa.inLove}, resting ${sa.restLeft} ticks`);
  must(!(await feedBy("owner1", a)), "a resting parent fell in love");
  must(chicksAround("budgie", a.location, [a.id, b.id]).length === 1, "more than one chick");
});

// Birds of different kinds don't mate; nor do two lovebirds of different pairs, side by side. Their
// partners fed too, each pair has its chick. A lovebird on its own doesn't fall in love.
perchCase("breed_kinds_pairs", async () => {
  const budgie = await petBird("budgie", 0, 50), cockatiel = await petBird("cockatiel", 1, 50);
  must(await feedBy("owner1", budgie) && await feedBy("owner1", cockatiel), "not in love");
  const a = await petBird("lovebird", 10, 50), c = await petBird("lovebird", 11, 50);
  const b = await petBird("lovebird", 10, 56), d = await petBird("lovebird", 11, 56);
  await ask(`pair ${a.id} ${b.id}`);
  await ask(`pair ${c.id} ${d.id}`);
  const lone = await petBird("lovebird", 40, 40);
  await wait(5);
  must(!(await feedBy("owner1", lone)), "a lovebird without a partner fell in love");
  must(await feedBy("owner1", a) && await feedBy("owner1", c), "a paired lovebird did not fall in love");
  await wait(120);
  must(chicksAround("budgie", budgie.location, []).length === 0 && chicksAround("cockatiel", budgie.location, []).length === 0, "a budgie and a cockatiel had a chick");
  must(chicksAround("lovebird", a.location, []).length === 0, "two lovebirds of different pairs had a chick");
  must(await feedBy("owner1", b) && await feedBy("owner1", d), "the partners did not fall in love");
  const parents = [a.id, b.id, c.id, d.id, lone.id];
  must(await waitChick("lovebird", a.location, parents, 300), "a lovebird and its partner had no chick in 15 s");
  for (let t = 0; t < 300 && chicksAround("lovebird", a.location, parents).length < 2; t += 10) await wait(10);
  const chicks = chicksAround("lovebird", a.location, parents);
  for (const ch of chicks) spawned.push(ch);
  must(chicks.length === 2, `${chicks.length} lovebird chicks, not one for each pair`);
  for (const ch of chicks) must((await breedState(ch)).partner === null, "a chick has a partner");
});

// Getting hurt ends love (vanilla Animal.actuallyHurt).
perchCase("breed_hurt", async () => {
  const a = await petBird("canary", 20, 50);
  must(await feedBy("owner1", a), "not in love");
  a.applyDamage(1);
  await wait(5);
  must(!(await breedState(a)).inLove, "still in love after being hurt");
});

// A tamed canary sings once each morning: not in the afternoon, once in the morning (the pose on,
// then off), not again that morning, again the next. A wild canary doesn't.
perchCase("song_canary", async () => {
  world.setTimeOfDay(6000);
  const c = await petBird("canary", 0, 44);
  const wild = spawn("canary", at(3, 44));
  await wait(60);
  must((await birdState(c)).songs === 0, "sang in the afternoon");
  world.setTimeOfDay(200); // rolls on to the next morning
  // The pose, read straight off the bird: on within the morning's first 30 s (it sings once it has
  // landed), held about seven seconds (140 ticks), then off.
  const pose = () => c.getProperty(`${NS}:singing`) === true;
  must(await waitFor(pose, 600, 1), `no singing pose in the morning (30 s); tamed ${tamed(c)}, on the ground ${c.isOnGround}`);
  const from = system.currentTick;
  must(await waitFor(() => !pose(), 200, 1), "the singing pose is still on after 10 s");
  const held = system.currentTick - from;
  must(held >= 130 && held <= 150, `the singing pose held ${held} ticks, not about 140`);
  let s = await birdState(c);
  must(s.songs === 1, `sang ${s.songs} times in one morning`);
  world.setTimeOfDay(100); // an earlier hour rolls on to the morning after
  s = await waitState(c, (x) => x.songs === 2, 600);
  must(s.songs === 2, `${s.songs} songs by the next morning, not 2`);
  must((await birdState(wild)).songs === 0, "the wild canary sang");
});

// Finches: two tamed ones sitting on their shared perch by day (owner away). One sings; the other
// answers a moment later, once, and the singer doesn't answer the answer; a wild finch out of
// hearing stays quiet. A tamed finch whose phrase is due sings it; a wild one doesn't.
perchCase("song_finches", async () => {
  const p = placePerch(20, 46);
  away();
  const a = await petBird("zebra_finch", 22, 46), b = await petBird("zebra_finch", 18, 46);
  const far = spawn("zebra_finch", at(36, 46));
  must(await waitFor(() => perched(a) && perched(b), 600), `not on the perch: ${perched(a)} and ${perched(b)}`);
  await wait(110); // quiet after any phrase of their own on the way
  const before = await states([a, b, far]);
  await ask(`sing ${a.id}`);
  await wait(50);
  const after = await states([a, b, far]);
  must(after[0].songs === before[0].songs + 1, "the finch didn't sing when told");
  must(after[1].songs === before[1].songs + 1, `the finch beside it answered ${after[1].songs - before[1].songs} times in 2.5 s, not once`);
  await wait(60);
  const later = await states([a, b, far]);
  must(later[0].songs === after[0].songs, "the singer answered the answer");
  must(later[2].songs === before[2].songs, "a finch 16 blocks off answered");
  // Its own phrase falls due: the tamed finch sings it.
  await wait(60);
  const s0 = (await birdState(b)).songs;
  await ask(`song_due ${b.id}`);
  await wait(15);
  must((await birdState(b)).songs === s0 + 1, "a due phrase was not sung");
  const w0 = (await birdState(far)).songs;
  await ask(`song_due ${far.id}`);
  await wait(15);
  must((await birdState(far)).songs === w0, "a wild finch sang a phrase of its own");
  void p;
});

// ---------------------------------------------------------------- foods and settings (session 6)
//
// East of the bird lanes (x 36 to 56), inside the ticking area. The food hook is a stand-in owner
// using the food on the bird (no player, so nothing leaves a hand and a chick's growing, which is
// the game's own feeding, isn't seen here).

type Fed = Bird & { treats: number; snacks: number; refusals: number; treatFull: number; snackFull: number; shaking: boolean; health: number; greetings: number };
const fedState = (e: Entity) => ask(`state ${e.id}`) as Promise<Fed>;
const useFood = async (owner: string, e: Entity, item: string) => ((await ask(`food ${owner} ${e.id} ${item}`)) as unknown as { did: string }).did;
const shakingPose = (e: Entity) => e.isValid && e.getProperty(`${NS}:shaking`) === true;
const MILLET = `${NS}:millet_spray`;
const SNACKS = ["minecraft:carrot", "minecraft:apple", "minecraft:melon_slice", "minecraft:sweet_berries", "minecraft:glow_berries", "minecraft:beetroot"];

// The item is one the game knows, a stack of 64.
perchCase("food_item", async () => {
  const m = new ItemStack(MILLET);
  must(m.typeId === MILLET, `the millet spray is ${m.typeId}`);
  must(m.maxAmount === 64, `stacks to ${m.maxAmount}`);
});

// The millet spray tames a wild bird on the first try, to whoever gave it; then it is full.
perchCase("food_millet_tames", async () => {
  for (const [i, kind] of BIRDS.map((b) => b.id).entries()) {
    const w = spawn(kind, at(36 + i * 3, 0));
    await wait(2);
    must(!tamed(w), `a new ${kind} is tamed`);
    const did = await useFood(i % 2 ? "owner2" : "owner1", w, MILLET);
    must(did === "tame", `the millet spray did "${did}" for a wild ${kind}`);
    must(await waitFor(() => tamed(w), 10, 1), `a wild ${kind} was not tamed by the millet spray`);
    const s = await fedState(w);
    must(s.owner === (i % 2 ? "owner2" : "owner1"), `${kind} tamed to ${s.owner}`);
    must(s.treats === 1 && s.treatFull > 500, `${kind}: treats ${s.treats}, full for ${s.treatFull}`);
    must(Math.abs(speed(w) - 0.4) < 1e-6, `${kind} can't move after taming (movement ${speed(w)})`);
  }
  // Someone else's millet for a tamed bird: nothing.
  const b = await petBird("budgie", 36, 4);
  must((await useFood("owner2", b, MILLET)) === "refuse", "a stranger's treat was taken");
});

// A treat for its owner's bird: a bob (the greeting pose, without the greeting), health back; full
// for half a minute; nothing from a stranger. A canary sings for it; a finch sings a phrase.
perchCase("food_treat", async () => {
  const b = await petBird("budgie", 40, 8);
  b.applyDamage(2);
  await wait(2);
  const h0 = (await fedState(b)).health;
  must(h0 === 3, `health ${h0} after 2 damage, expected 3`);
  const g0 = (await fedState(b)).greetings;
  must((await useFood("owner1", b, MILLET)) === "treat", "the owner's treat was not taken");
  must(await waitFor(() => greetingPose(b), 10, 1), "no happy bob");
  let s = await fedState(b);
  must(s.health === 4 && s.treats === 1, `health ${s.health}, treats ${s.treats}`);
  must(s.greetings === g0, "a treat counted as a greeting (it is the bob alone, with no call)");
  must(await waitFor(() => !greetingPose(b), 60), "the bob never ended");
  must((await useFood("owner1", b, MILLET)) === "refuse", "a second treat within half a minute was taken");
  must((await fedState(b)).health === 4, "a refused treat healed");
  must((await useFood("owner2", b, MILLET)) === "refuse", "a stranger's treat was taken");
  await ask(`hungry ${b.id}`);
  must((await useFood("owner1", b, MILLET)) === "treat", "no treat once hungry again");
  await ask(`hungry ${b.id}`);
  must((await useFood("owner1", b, MILLET)) === "treat", "no treat at full health");
  s = await fedState(b);
  must(s.health === 5 && s.treats === 3, `health ${s.health} (the most is 5), treats ${s.treats}`);
  // Song birds sing for it instead.
  const c = await petBird("canary", 44, 8);
  const c0 = (await fedState(c)).songs;
  must((await useFood("owner1", c, MILLET)) === "treat", "the canary's treat was not taken");
  must(await waitFor(() => c.getProperty(`${NS}:singing`) === true, 10, 1), "the canary did not take its singing pose");
  must((await fedState(c)).songs === c0 + 1, "the canary did not sing for its treat");
  must(!greetingPose(c), "the canary bobbed instead of singing");
  const f = await petBird("zebra_finch", 48, 8);
  const f0 = (await fedState(f)).songs;
  must((await useFood("owner1", f, MILLET)) === "treat", "the finch's treat was not taken");
  must((await fedState(f)).songs === f0 + 1, "the finch did not sing a phrase for its treat");
});

// Snacks: each of the six from its owner, with crumbs, health back, then full for five seconds; a
// stranger's and a wild bird's are not taken.
perchCase("food_snack", async () => {
  const b = await petBird("lovebird", 40, 14);
  b.applyDamage(2);
  must((await useFood("owner1", b, "minecraft:carrot")) === "snack", "the owner's carrot was not taken");
  let s = await fedState(b);
  must(s.health === 4 && s.snacks === 1 && s.snackFull > 90, `health ${s.health}, snacks ${s.snacks}, full for ${s.snackFull}`);
  must((await useFood("owner1", b, "minecraft:apple")) === "refuse", "a second snack within five seconds was taken");
  must((await useFood("owner1", b, MILLET)) === "treat", "a snack filled it for a treat too");
  await wait(105);
  must((await useFood("owner1", b, "minecraft:apple")) === "snack", "no snack after five seconds");
  for (const item of SNACKS) {
    await ask(`hungry ${b.id}`);
    must((await useFood("owner1", b, item)) === "snack", `${item} is not a snack`);
  }
  s = await fedState(b);
  must(s.snacks === 2 + SNACKS.length && s.health === 5, `snacks ${s.snacks}, health ${s.health}`);
  await ask(`hungry ${b.id}`);
  must((await useFood("owner2", b, "minecraft:apple")) === "refuse", "a stranger's snack was taken");
  const w = spawn("budgie", at(44, 14));
  await wait(2);
  must((await useFood("owner1", w, "minecraft:beetroot")) === "refuse", "a wild bird took a snack");
  must(!tamed(w), "a snack tamed a wild bird");
  must((await useFood("owner1", b, "minecraft:wheat_seeds")) === "nothing", "seeds went through the foods");
});

// Refused foods: any bird shakes its head for about a second and takes nothing.
perchCase("food_refused", async () => {
  const w = spawn("cockatiel", at(40, 20));
  const b = await petBird("canary", 44, 20);
  b.applyDamage(1);
  await wait(2);
  for (const [e, owner, item] of [[w, "owner1", "minecraft:cocoa_beans"], [b, "owner2", "minecraft:poisonous_potato"], [b, "owner1", "minecraft:cocoa_beans"]] as [Entity, string, string][]) {
    const before = await fedState(e);
    must((await useFood(owner, e, item)) === "shake", `${item} was not refused`);
    must(await waitFor(() => shakingPose(e), 5, 1), "no head shake");
    must(await waitFor(() => !shakingPose(e), 30, 2), "the head shake never ended");
    const after = await fedState(e);
    must(after.refusals === before.refusals + 1 && after.treats === before.treats && after.snacks === before.snacks, `took something: ${JSON.stringify(after)}`);
    must(after.health === before.health, "a refused food healed");
  }
  must(!tamed(w), "cocoa tamed a wild bird");
});

// A chick: its owner's treat and snack are taken (health, full); its growing is the game's feeding.
perchCase("food_chick", async () => {
  const c = summonChick("budgie", 48, 20);
  c.triggerEvent("minecraft:on_tame");
  await wait(2);
  debug(`own ${c.id} owner1`);
  c.applyDamage(2);
  await wait(2);
  must((await fedState(c)).baby, "not a chick");
  must((await useFood("owner1", c, MILLET)) === "treat", "the chick's treat was not taken");
  must((await useFood("owner1", c, "minecraft:sweet_berries")) === "snack", "the chick's snack was not taken");
  const s = await fedState(c);
  must(s.health === 5 && s.treats === 1 && s.snacks === 1, `health ${s.health}, treats ${s.treats}, snacks ${s.snacks}`);
  must((await useFood("owner2", c, "minecraft:carrot")) === "refuse", "a stranger's snack for a chick was taken");
});

// The settings: Java's defaults; a natural spawn stays or goes by them, and spawn eggs, commands and
// chicks never go. The spawns here fire the spawn rules' event the way a natural spawn does.
perchCase("settings_spawning", async () => {
  type Sets = { naturalSpawning: boolean; spawnChance: number; kept: number; removed: number };
  const sets = async (cmd = "settings") => (await ask(cmd)) as unknown as Sets;
  try {
    let s = await sets();
    must(s.naturalSpawning === true && s.spawnChance === 100, `the defaults are ${s.naturalSpawning} and ${s.spawnChance}`);
    const natural = (x: number) => {
      const e = overworld().spawnEntity(`${NS}:zebra_finch`, at(x, 26), { spawnEvent: `${NS}:spawned_wild` });
      spawned.push(e);
      return e;
    };
    const a = natural(36);
    await wait(2);
    must(a.isValid, "a natural spawn went at the full chance");
    must(a.getProperty(`${NS}:natural_spawn`) === false, "the natural-spawn mark was not cleared");
    const k0 = (await sets()).kept;
    must(k0 >= 1, "the spawn check never saw the natural spawn");
    s = await sets("settings off 100");
    must(!s.naturalSpawning, "spawning not off");
    const b = natural(38);
    await wait(2);
    must(!b.isValid, "a natural spawn stayed with spawning off");
    const egg = spawn("zebra_finch", at(40, 26));
    overworld().runCommand(`summon ${NS}:zebra_finch 42.5 ${GROUND} 26.5`);
    const chick = summonChick("zebra_finch", 44, 26);
    await wait(2);
    must(egg.isValid && chick.isValid, "a spawned bird or a chick went with spawning off");
    const summoned = overworld().getEntities({ type: `${NS}:zebra_finch`, location: { x: 42.5, y: GROUND, z: 26.5 }, maxDistance: 1 });
    for (const e of summoned) spawned.push(e);
    must(summoned.length === 1, "a /summon bird went with spawning off");
    await sets("settings on 0");
    const c = natural(46);
    await wait(2);
    must(!c.isValid, "a natural spawn stayed at chance 0");
    // Half: of 40, some stay and some go (all or none would be about 1 in a trillion).
    await sets("settings on 50");
    const many: Entity[] = [];
    for (let i = 0; i < 40; i++) many.push(natural(36 + (i % 10) * 2));
    await wait(2);
    const stayed = many.filter((e) => e.isValid).length;
    must(stayed > 5 && stayed < 35, `${stayed} of 40 stayed at chance 50`);
    // A saved value out of range is clamped; the settings are kept on the world.
    s = await sets("settings on 250");
    must(s.spawnChance === 100, `chance 250 read back as ${s.spawnChance}`);
  } finally {
    await sets("settings on 100");
  }
});

// The settings command is there (it opens the form for a player; from a script it says so).
perchCase("settings_command", async () => {
  let said = "";
  try {
    const r = overworld().runCommand(`${NS}:settings`);
    said = `ran, success count ${r.successCount}`;
  } catch (e) {
    said = String(e);
  }
  must(!/unknown|syntax|not found/i.test(said), `the command isn't there: ${said}`);
  // The control: a command that isn't there does throw, so the run above did find ours.
  let control = "";
  try {
    overworld().runCommand(`${NS}:no_such_setting`);
    control = "ran";
  } catch (e) {
    control = String(e);
  }
  must(control !== "ran", "a made-up command ran too, so this proves nothing");
  log(`note settings_command: from a script it ${said}; a made-up one: ${control}`);
});

// A server restart with a bird asleep on its perch: run restart_setup, stop the server, start it
// on the same world (bds-check.js --keep-world), run restart_check. Not in the default run.
const RESTART_PERCH = { x: 0, y: GROUND, z: -45 };
cases.push({
  name: "restart_setup",
  run: async () => {
    world.gameRules.doDayLightCycle = false;
    for (const old of overworld().getEntities({ tags: ["lb_restart"] })) old.remove();
    overworld().getBlock(RESTART_PERCH)!.setPermutation(BlockPermutation.resolve(PERCH, { "minecraft:cardinal_direction": "west" }));
    debug(`perch_added ${RESTART_PERCH.x} ${RESTART_PERCH.y} ${RESTART_PERCH.z}`);
    const b = overworld().spawnEntity(`${NS}:lovebird`, { x: 2.5, y: GROUND, z: -44.5 });
    b.addTag("lb_restart");
    b.triggerEvent("minecraft:on_tame");
    await wait(2);
    debug(`own ${b.id} owner1`);
    // And a budgie on its owner's shoulder when the server stops.
    for (const old of overworld().getEntities({ tags: ["lb_restart_shoulder"] })) old.remove();
    debug(`stand_in owner1 6.5 ${GROUND} -44.5 0`);
    const c = overworld().spawnEntity(`${NS}:budgie`, { x: 6.5, y: GROUND, z: -43.5 });
    c.addTag("lb_restart_shoulder");
    c.triggerEvent("minecraft:on_tame");
    await wait(2);
    debug(`own ${c.id} owner1`);
    must((await ask(`bird_use owner1 ${c.id}`)).acted && (await waitFor(() => onShoulder(c), 10, 1)), "the budgie did not go onto the shoulder");
    night();
    must(await waitFor(() => onSeat(b, RESTART_PERCH) && asleep(b), 600), "never roosted");
  },
});
cases.push({
  name: "restart_check",
  run: async () => {
    let b: Entity | undefined;
    try {
      must(await waitFor(() => (b = overworld().getEntities({ tags: ["lb_restart"] })[0]) !== undefined, 200), "the bird is not in the world after the restart");
      must(overworld().getBlock(RESTART_PERCH)?.typeId === PERCH, "the perch is gone after the restart");
      const s = await ask(`state ${b!.id}`);
      must(s.owner === "owner1" && s.perch !== null && s.perch.endsWith(`|${RESTART_PERCH.x}|${RESTART_PERCH.y}|${RESTART_PERCH.z}`), `forgot its owner or perch: ${JSON.stringify(s)}`);
      must(s.perches >= 1, "the world's list of perches is empty after the restart");
      must(await waitFor(() => onSeat(b!, RESTART_PERCH) && asleep(b!), 60), `after the restart: ${dist(b!.location, seatOf(RESTART_PERCH)).toFixed(3)} from the seat, asleep ${asleep(b!)}`);
      must(yawGap(b!.getRotation().y, -90) < 1, `faces yaw ${b!.getRotation().y.toFixed(1)}, a west-placed perch faces -90`);
      await wait(60);
      must(onSeat(b!, RESTART_PERCH, 0.05), "drifted off the seat after the restart");
      day();
      must(await waitFor(() => perched(b!) && !asleep(b!), 60), "not awake on its perch in the morning (its owner is away)");
      // The shoulder bird: its owner isn't here after the restart, so it is set down, not left hanging.
      let c: Entity | undefined;
      must(await waitFor(() => (c = overworld().getEntities({ tags: ["lb_restart_shoulder"] })[0]) !== undefined, 100), "the shoulder budgie is not in the world after the restart");
      spawned.push(c!);
      must(await waitFor(() => !onShoulder(c!) && Math.abs(speed(c!) - 0.4) < 1e-6, 60), `the shoulder budgie is still held with its owner gone (movement ${speed(c!)})`);
    } finally {
      b?.remove();
      overworld().getBlock(RESTART_PERCH)?.setType("minecraft:air");
      day();
    }
  },
});

async function runCases(filter: string) {
  // The restart cases run only when asked for by name (they span a server restart).
  const chosen = cases.filter((c) => (filter ? c.name.startsWith(filter) : !c.name.startsWith("restart_")));
  log(`start (${chosen.length} cases)`);
  let failed = 0;
  // One case at a time. (Run side by side, the five fly cases twice left one kind of bird on the
  // ground for the whole 30 s, a different kind each time, while each passes on its own in about a
  // second: the game seems to hold back some birds' wandering when many start at once.)
  const runOne = async (c: Case) => {
    try {
      await c.run();
      log(`CASE ${c.name}: PASS`);
    } catch (e) {
      failed++;
      log(`CASE ${c.name}: FAIL ${e instanceof Fail ? e.message : String(e)}`);
    }
  };
  for (const c of chosen) {
    await runOne(c);
    cleanUp();
  }
  log(failed ? `${failed} of ${chosen.length} FAILED` : `PASS all ${chosen.length}`);
  log("DONE");
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== `${NS}:test`) return;
  system.run(() => void runCases(ev.message.trim()));
});

system.run(() => console.warn("Little Birds test pack started"));
