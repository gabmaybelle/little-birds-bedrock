// Little Birds self-test: a test-only pack for a throwaway test world, never shipped. Stable script
// APIs only, so it runs on a plain dedicated server with no experiments.
//
//   /scriptevent little_birds:test          every case, then "LB TEST: DONE"
//   /scriptevent little_birds:test <name>   the cases whose name starts with <name>
//
// Each case prints "LB TEST: CASE <name>: PASS" or "... FAIL <why>"; tools/bds-check.js reads them.
// It reads only what the game shows (components, properties, positions), so it checks the birds the
// way a player would meet them.
import { world, system, ItemStack, Entity, Dimension, Vector3 } from "@minecraft/server";

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
      for (const p of ["roosting", "shoulder", "greeting", "shaking"]) must(e.getProperty(`${NS}:${p}`) === false, `${p} is not off on a new bird`);
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

async function runCases(filter: string) {
  const chosen = cases.filter((c) => !filter || c.name.startsWith(filter));
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
