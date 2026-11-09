// Little Birds self-test: a test-only pack for a throwaway test world, never shipped. Stable script
// APIs only, so it runs on a plain dedicated server with no experiments.
//
//   /scriptevent little_birds:test          every case, then "LB TEST: DONE"
//   /scriptevent little_birds:test <name>   the cases whose name starts with <name>
//
// Each case prints "LB TEST: CASE <name>: PASS" or "... FAIL <why>"; tools/bds-check.js reads them.
// It reads only what the game shows (components, properties, positions), so it checks the birds the
// way a player would meet them.
import { world, system, ItemStack, Entity, Dimension, Vector3, BlockPermutation } from "@minecraft/server";

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
  const stand = { x: p.x + 0.5, y: GROUND, z: p.z + 2.5 };
  const b = await petBird("budgie", p.x, p.z + 3);
  b.setProperty(`${NS}:shoulder`, true);
  b.teleport({ x: stand.x + 0.5, y: GROUND + 1.2, z: stand.z });
  await wait(2);
  const use = await ask(`use owner1 ${p.x} ${p.y} ${p.z}`);
  must(use.acted, "using the perch with a bird on the shoulder did nothing");
  must(await waitFor(() => onSeat(b, p), 10, 1), "not straight onto the seat");
  must(b.getProperty(`${NS}:shoulder`) === false, "still on the shoulder");
  // Another bird on the shoulder, and a sneak-use on the ground beside: it hops down there.
  const c = await petBird("cockatiel", p.x, p.z + 3);
  c.setProperty(`${NS}:shoulder`, true);
  c.teleport({ x: stand.x + 0.5, y: GROUND + 1.2, z: stand.z });
  await wait(2);
  const ground = { x: p.x + 3, y: GROUND - 1, z: p.z + 3 };
  const sneak = await ask(`use owner1 ${ground.x} ${ground.y} ${ground.z} sneak Up`);
  must(sneak.acted, "a sneak-use of the ground did nothing");
  await wait(5);
  must(c.getProperty(`${NS}:shoulder`) === false, "still on the shoulder after the sneak-use");
  must(dist(c.location, { x: ground.x + 0.5, y: GROUND, z: ground.z + 0.5 }) < 0.6, `not set down on the block (${dist(c.location, { x: ground.x + 0.5, y: GROUND, z: ground.z + 0.5 }).toFixed(2)} off)`);
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
// lost, and what the perch's script costs measured (budget: 5 ms worst tick, 10 ms worst pass).
perchCase("perch_soak", async () => {
  const n = 16, nights = 3, perches: Vector3[] = [], flock: Entity[] = [];
  const facings = ["north", "south", "east", "west"];
  for (let i = 0; i < n; i++) {
    const x = -40 + 3 * (i % 4), z = -50 + 3 * Math.floor(i / 4);
    perches.push(placePerch(x, z, facings[i % 4]));
    flock.push(await petBird(["budgie", "cockatiel", "lovebird", "canary"][i % 4], x + 1, z + 1));
  }
  debug(`stand_in owner1 -35 ${GROUND} -45`); // home: within 16 blocks of every perch
  const onSeatAny = (b: Entity) => perches.some((p) => dist(b.location, seatOf(p)) <= 0.06);
  const p0 = (await ask("perf")) as unknown as Perf;
  for (let k = 1; k <= nights; k++) {
    night();
    must(await waitFor(() => flock.every((b) => asleep(b) && onSeatAny(b)), 1200, 20), `night ${k}: ${flock.filter(asleep).length} of ${n} asleep after 60 s`);
    await wait(60);
    const off = flock.map((b) => Math.min(...perches.map((p) => dist(b.location, seatOf(p, 0, true)) )));
    must(Math.max(...off) <= 0.06, `night ${k}: a bird is ${Math.max(...off).toFixed(3)} from any seat`);
    const seats = new Set(flock.map((b) => perches.findIndex((p) => dist(b.location, seatOf(p)) <= 0.06)));
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
  log(`note perch_soak cost: per tick ${(tick.ms / tick.runs).toFixed(3)} ms mean, ${p1.tick.max} ms worst; once-a-second pass ${(sec.ms / sec.runs).toFixed(2)} ms mean, ${p1.second.max} ms worst (${n} birds, ${nights} nights, ${tick.runs} ticks)`);
  must(p1.tick.max <= 5 && p1.second.max <= 10, `over budget: worst tick ${p1.tick.max} ms (budget 5), worst pass ${p1.second.max} ms (budget 10)`);
});
type Perf = { tick: { runs: number; ms: number; max: number }; second: { runs: number; ms: number; max: number } };

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
