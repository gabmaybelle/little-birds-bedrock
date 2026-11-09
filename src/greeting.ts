// The greeting: the Java edition's LittleBird.watchForOwner and greet, on Bedrock. The rules are in
// day-logic.ts.
//
// A tamed bird keeps the day-clock time its owner was last within 8 blocks. When its owner comes
// back within reach after an hour or more of the day clock away, it says hello once, in its own way:
// its greeting call, a bob of the head and a flutter of the wings (the greeting pose, played while
// the bird's greeting property is on). A bird on its owner's shoulder is never away.
import { world, system, Entity, Player } from "@minecraft/server";
import { NS, ownerIdOf, ownerLocation } from "./perch.js";
import { isOnShoulder } from "./shoulder.js";
import { WATCH_EVERY, greetingTicks, watchForOwner } from "./day-logic.js";
import { now } from "./sky.js";

const FAMILY = "little_bird";
/** The day-clock time its owner was last within reach (Java saves it as LastSawOwner). */
const P_LAST_SAW = `${NS}:last_saw_owner`;

const kindOf = (bird: Entity) => bird.typeId.slice(NS.length + 1);
const isTamed = (bird: Entity) => bird.getComponent("minecraft:is_tamed") !== undefined;
const voicePitch = () => (Math.random() - Math.random()) * 0.1 + 1.0;

/** Birds greeting now, and the tick each one's pose ends. */
const greeting = new Map<string, number>();
/** How many greetings each bird has given since the script loaded (for the self-test, as Java's counter). */
export const greetings = new Map<string, number>();
/** What the watch costs, in milliseconds (the self-test's budget reads it). */
export const greetingPerf = { runs: 0, ms: 0, max: 0 };

export function greet(bird: Entity) {
  greetings.set(bird.id, (greetings.get(bird.id) ?? 0) + 1);
  bird.dimension.playSound(`${NS}.${kindOf(bird)}_greeting`, bird.location, { volume: 1, pitch: voicePitch() });
  bird.setProperty(`${NS}:greeting`, true);
  const id = bird.id;
  greeting.set(id, system.currentTick + greetingTicks(kindOf(bird)));
  system.runTimeout(() => endPose(id), greetingTicks(kindOf(bird)));
}

let dimensions: string[] | undefined;
const allDimensions = () => (dimensions ??= ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]);

function watch() {
  const players = new Map(world.getAllPlayers().map((p) => [p.id, p] as [string, Player]));
  const clock = now();
  for (const id of allDimensions()) {
    const dimension = world.getDimension(id);
    let birds: Entity[];
    try {
      birds = dimension.getEntities({ families: [FAMILY] });
    } catch {
      continue;
    }
    for (const bird of birds) {
      try {
        // The pose matches whether it is greeting: a save in the middle of a greeting (or the
        // bird's chunk going before the pose ended) leaves it on, and this puts it right within
        // half a second. (A write reads back only from the next tick, and this never runs in the
        // tick that greets.)
        const posing = greeting.has(bird.id);
        if ((bird.getProperty(`${NS}:greeting`) === true) !== posing) bird.setProperty(`${NS}:greeting`, posing);
        if (!isTamed(bird) || ownerIdOf(bird) === undefined) continue;
        const saved = bird.getDynamicProperty(P_LAST_SAW);
        const lastSaw = typeof saved === "number" ? saved : -1;
        const r = watchForOwner({ lastSaw, now: clock, bird: bird.location, owner: ownerLocation(bird, dimension, players), onShoulder: isOnShoulder(bird) });
        if (r.lastSaw !== lastSaw) bird.setDynamicProperty(P_LAST_SAW, r.lastSaw);
        if (r.greet) greet(bird);
      } catch (e) {
        console.warn(`Little Birds: greeting: ${e}`);
      }
    }
  }
}

function endPose(id: string) {
  greeting.delete(id);
  const bird = world.getEntity(id);
  try {
    if (bird?.isValid) bird.setProperty(`${NS}:greeting`, false);
  } catch {
    /* gone with its chunk: the watch turns it off when it is back */
  }
}

system.runInterval(() => {
  const t = Date.now();
  watch();
  const ms = Date.now() - t;
  greetingPerf.runs++;
  greetingPerf.ms += ms;
  if (ms > greetingPerf.max) greetingPerf.max = ms;
}, WATCH_EVERY);

/** For the self-test: what the greeting keeps on a bird. */
export function debugGreeting(bird: Entity) {
  const saved = bird.getDynamicProperty(P_LAST_SAW);
  return { lastSaw: typeof saved === "number" ? saved : -1, greetings: greetings.get(bird.id) ?? 0, clock: now() };
}
