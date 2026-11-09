// The perch as a home: the Java edition's PerchBlock, FindPerchGoal, RoostGoal and the perch parts
// of LittleBird, on Bedrock. The rules are in perch-logic.ts; this file applies them to the world.
//
// A tamed bird makes the nearest free perch within reach its home. Every night, whenever its owner
// is away (more than 16 blocks from the perch, in another world, or offline), now and then by day,
// and when it is called, it flies to the air above the bar, comes down onto the seat, turns to face
// the way the perch faces (back at whoever placed it), and stays: all night (asleep, quiet), while
// its owner is away, or 20 to 60 seconds by day. A bird told to sit, a bird far from home (32
// blocks) and a broken perch end it. Using a perch with an empty hand sets down the bird on your
// shoulder there, or calls your bird to it. Lovebird pairs and two finches share a perch, side by side.
//
// A bird on its way home or on its seat is moved by this script alone (the entity's held or asleep
// body: no movement, no pushing, no goals), watched every tick as Java's goal is, so nothing knocks
// it off between checks. Everything else runs once a second.
import { world, system, Entity, Block, Dimension, Player, Vector3, InputButton, ButtonState, Direction } from "@minecraft/server";
import {
  BirdInfo, CallCandidate, Facing, PerchInfo, birdToCall, distSq, dwellTicks, flightStep, goesHome, hasSeatFor,
  homeBirds, keepsSeat, nearHome, nearestFreePerch, offSeat, parsePerchKey, perchKey, seat, seatOffset,
  seatYaw, staysHome, inBox, DAY_VISIT_CHANCE, FIND_REACH, GIVE_UP_TICKS,
} from "./perch-logic.js";
import { darkOutside } from "./sky.js";

export const NS = "little_birds";
export const PERCH = `${NS}:perch`;
const FAMILY = "little_bird";

// Kept on each bird (dynamic properties: saved with it, this pack's own).
const P_PERCH = `${NS}:perch`; // "dimension|x|y|z"
export const P_OWNER = `${NS}:owner`; // the player's id
const P_MODE = `${NS}:mode`; // free | homing | perched
export const P_PARTNER = `${NS}:partner`; // a lovebird's partner's id (pairs.ts sets it)
// Kept on the world: the perches players have placed, so a bird looking for one needn't scan blocks.
const W_PERCHES = `${NS}:perches`;

type Mode = "free" | "homing" | "perched";

// ---------------------------------------------------------------- small helpers

const kindOf = (bird: Entity) => bird.typeId.slice(NS.length + 1);
const isTamed = (bird: Entity) => bird.getComponent("minecraft:is_tamed") !== undefined;
const modeOf = (bird: Entity): Mode => (bird.getDynamicProperty(P_MODE) as Mode | undefined) ?? "free";
const setMode = (bird: Entity, mode: Mode) => bird.setDynamicProperty(P_MODE, mode);
const perchOf = (bird: Entity) => bird.getDynamicProperty(P_PERCH) as string | undefined;
export const ownerIdOf = (bird: Entity) => bird.getDynamicProperty(P_OWNER) as string | undefined;
const boolProp = (bird: Entity, name: string) => bird.getProperty(`${NS}:${name}`) === true;
const facingOf = (block: Block): Facing => (block.permutation.getState("minecraft:cardinal_direction") as Facing | undefined) ?? "north";
const voicePitch = () => (Math.random() - Math.random()) * 0.1 + 1.0;

/** Sneaking: the movement state, or the sneak button held (the state can read false during a use, and on a phone sneak is a button). */
export function sneaking(player: Player): boolean {
  if (player.isSneaking) return true;
  try {
    return player.inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed;
  } catch {
    return false;
  }
}

/** The perch block at a position: the block, "gone" if something else is there, undefined if its chunk isn't loaded. */
function perchAt(dimension: Dimension, at: Vector3): Block | "gone" | undefined {
  let block: Block | undefined;
  try {
    block = dimension.getBlock(at);
  } catch {
    return undefined;
  }
  if (!block || !block.isValid) return undefined;
  return block.typeId === PERCH ? block : "gone";
}

function info(bird: Entity): BirdInfo {
  return { id: bird.id, kind: kindOf(bird), perch: perchOf(bird), partner: bird.getDynamicProperty(P_PARTNER) as string | undefined, location: bird.location };
}

// ---------------------------------------------------------------- owners

/**
 * Stand-in owners for the self-test, which has no player: an owner id and where that "player"
 * stands. Only the test hooks (test-hooks.ts) fill it; a real player of the same id wins.
 */
export const standIns = new Map<string, { dimensionId: string; location: Vector3; yaw?: number }>();

/** Where the bird's owner is, if they are in this world; undefined if offline, elsewhere, or unknown. */
export function ownerLocation(bird: Entity, dimension: Dimension, players: Map<string, Player>): Vector3 | undefined {
  const id = ownerIdOf(bird);
  if (id === undefined) return undefined;
  const p = players.get(id);
  if (p) return p.dimension.id === dimension.id ? p.location : undefined;
  const s = standIns.get(id);
  return s && s.dimensionId === dimension.id ? s.location : undefined;
}

// The owner is written down when a player tames the bird with seeds (the game's taming leaves no
// owner the script can read once the bird is tame). A tamed bird with no owner on record (one tamed
// before this) takes the first player who uses it.
world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  if (!target.matches({ families: [FAMILY] })) return;
  system.runTimeout(() => {
    if (target.isValid && player.isValid && isTamed(target) && ownerIdOf(target) === undefined) target.setDynamicProperty(P_OWNER, player.id);
  }, 2);
});

// ---------------------------------------------------------------- the world's perches

function perchList(): string[] {
  try {
    const list = JSON.parse(String(world.getDynamicProperty(W_PERCHES) ?? "[]"));
    return Array.isArray(list) ? list.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}
const savePerches = (list: string[]) => world.setDynamicProperty(W_PERCHES, JSON.stringify(list));
export function addPerch(dimension: Dimension, at: Vector3) {
  const list = perchList(), k = perchKey(dimension.id, at);
  if (!list.includes(k)) savePerches([...list, k]);
}
function forgetPerch(key: string) {
  const list = perchList();
  if (list.includes(key)) savePerches(list.filter((k) => k !== key));
}
world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
  if (block.typeId === PERCH) addPerch(block.dimension, block.location);
});
world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation }) => {
  if (brokenBlockPermutation.type.id === PERCH) forgetPerch(perchKey(block.dimension.id, block.location));
});

// ---------------------------------------------------------------- the bodies

/** Moved by the script only: flying home or awake on the seat. */
const hold = (bird: Entity) => bird.triggerEvent(`${NS}:hold`);
/** Asleep on the seat: held, and quiet. */
const sleep = (bird: Entity) => bird.triggerEvent(`${NS}:sleep`);

// Birds the tick loop moves: on their way home, or on their seat.
interface Active {
  bird: Entity;
  mode: "homing" | "perched";
  key: string;
  block: Vector3;
  facing: Facing;
  /** Blocks from the middle of the bar (two that share sit either side). */
  along: number;
  phase: 0 | 1;
  started: number;
  /** Ticks of its daytime sit still to go (counts down only on the seat, by day). */
  dwell: number;
  asleep: boolean;
}
const active = new Map<string, Active>();

/** What the two loops cost, in milliseconds (the self-test's budget reads it). */
export const perf = { tick: { runs: 0, ms: 0, max: 0 }, second: { runs: 0, ms: 0, max: 0 } };
function timed(p: { runs: number; ms: number; max: number }, fn: () => void) {
  const t = Date.now();
  fn();
  const ms = Date.now() - t;
  p.runs++;
  p.ms += ms;
  if (ms > p.max) p.max = ms;
}
/** Called to its perch and not yet gone (Java's LittleBird.called). */
const called = new Set<string>();

/** Back to its own devices: free body, pet goals, off the perch. */
function getUp(bird: Entity) {
  bird.triggerEvent(`${NS}:release`);
  bird.setProperty(`${NS}:perched`, false);
  bird.setProperty(`${NS}:roosting`, false);
  setMode(bird, "free");
  active.delete(bird.id);
}

/** Off its perch or its way home without a body change: the shoulder takes it from here. */
export function leavePerch(bird: Entity) {
  active.delete(bird.id);
  called.delete(bird.id);
  bird.setProperty(`${NS}:perched`, false);
  bird.setProperty(`${NS}:roosting`, false);
  setMode(bird, "free");
}

function startHoming(bird: Entity, key: string, block: Vector3, facing: Facing, along: number) {
  if (modeOf(bird) === "free") hold(bird);
  setMode(bird, "homing");
  called.delete(bird.id);
  bird.setProperty(`${NS}:perched`, false);
  bird.setProperty(`${NS}:roosting`, false);
  active.set(bird.id, { bird, mode: "homing", key, block, facing, along, phase: 0, started: system.currentTick, dwell: dwellTicks(Math.random()), asleep: false });
}

/** On the seat: facing the perch's way, feet on the bar; asleep (and a soft murmur) after dark. */
function settle(a: Active, quiet = false) {
  const bird = a.bird, night = darkOutside(bird.dimension.id);
  try {
    bird.clearVelocity();
  } catch {
    /* not every entity has a velocity to clear */
  }
  if (night) sleep(bird);
  else hold(bird);
  bird.teleport(seat(a.block, a.facing, a.along), { rotation: { x: 0, y: seatYaw(a.facing) } });
  bird.setProperty(`${NS}:perched`, true);
  bird.setProperty(`${NS}:roosting`, night);
  setMode(bird, "perched");
  a.mode = "perched";
  a.asleep = night;
  if (night && !quiet) bird.dimension.playSound(`${NS}.${kindOf(bird)}_settle`, bird.location, { volume: 0.6, pitch: voicePitch() });
}

/** Night falls on a bird awake on its seat, or morning comes to one asleep. */
function setAsleep(a: Active, night: boolean) {
  if (a.mode !== "perched" || a.asleep === night) return;
  if (night) sleep(a.bird);
  else hold(a.bird);
  a.bird.setProperty(`${NS}:roosting`, night);
  a.asleep = night;
}

// ---------------------------------------------------------------- every tick: the birds on the move or on the seat

function tickActive(a: Active) {
  const bird = a.bird;
  if (boolProp(bird, "shoulder")) {
    active.delete(bird.id);
    return;
  }
  const block = perchAt(bird.dimension, a.block);
  if (block === "gone") {
    // The perch went between the once-a-second checks: up at once, rather than held over nothing.
    bird.setDynamicProperty(P_PERCH, undefined);
    getUp(bird);
    return;
  }
  if (block === undefined) return; // its chunk is going: leave it be
  const seatAt = seat(a.block, a.facing, a.along);
  if (a.mode === "perched") {
    if (offSeat(bird.location, seatAt)) {
      // Knocked off (a teleport, a push the hold didn't stop): back up and settle again, as on Java.
      a.mode = "homing";
      a.phase = 0;
      a.started = system.currentTick;
      setMode(bird, "homing");
      bird.setProperty(`${NS}:perched`, false);
      bird.setProperty(`${NS}:roosting`, false);
      hold(bird);
      a.asleep = false;
      return;
    }
    if (distSq(bird.location, seatAt) > 0.05 * 0.05) {
      try {
        bird.clearVelocity();
      } catch {
        /* nothing to clear */
      }
      bird.teleport(seatAt, { rotation: { x: 0, y: seatYaw(a.facing) } });
    }
    if (!a.asleep && a.dwell > 0) a.dwell--;
    return;
  }
  if (system.currentTick - a.started > GIVE_UP_TICKS) {
    // Half a minute without getting there: it gives up for now, as on Java.
    getUp(bird);
    return;
  }
  const step = flightStep(bird.location, seatAt, a.phase);
  a.phase = step.phase;
  if (step.landed) {
    settle(a);
    return;
  }
  bird.teleport(step.to, { rotation: { x: 0, y: step.yaw } });
}

system.runInterval(() => timed(perf.tick, () => {
  for (const [id, a] of active) {
    if (!a.bird.isValid) {
      // Unloaded with its chunk, or gone: the once-a-second pass picks it up again when it's back.
      active.delete(id);
      continue;
    }
    try {
      tickActive(a);
    } catch (e) {
      console.warn(`Little Birds: perch: ${e}`);
    }
  }
}), 1);

// ---------------------------------------------------------------- once a second: every bird

let dimensions: Dimension[] | undefined;
// Looked up on first use: the API refuses world calls while the script is still loading.
const allDimensions = () => (dimensions ??= ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].map((id) => world.getDimension(id)));

interface Pass {
  dimension: Dimension;
  birds: BirdInfo[];
  byKey: Map<string, BirdInfo[]>;
  players: Map<string, Player>;
  night: boolean;
}

function homeOf(pass: Pass, key: string, block: Vector3): BirdInfo[] {
  return homeBirds(pass.byKey.get(key) ?? [], key, block);
}

/** The perches of this world near enough to matter, still standing (gone ones are dropped from the list). */
function perchesIn(dimension: Dimension): PerchInfo[] {
  const out: PerchInfo[] = [];
  for (const key of perchList()) {
    const p = parsePerchKey(key);
    if (!p || p.dimensionId !== dimension.id) continue;
    out.push({ key, block: p.block });
  }
  return out;
}

function tickBird(bird: Entity, me: BirdInfo, pass: Pass) {
  // On a shoulder, nothing here moves it: the shoulder has it (and mends one nothing is holding).
  if (boolProp(bird, "shoulder")) {
    active.delete(bird.id);
    shoulderHooks.seen(bird, pass.players);
    return;
  }
  const mode = modeOf(bird);
  // A free bird must look and move free: mends one left held by a save at the wrong moment.
  if (mode === "free" && !active.has(bird.id)) {
    const m = bird.getComponent("minecraft:movement");
    if (!m || m.defaultValue <= 0 || boolProp(bird, "perched") || boolProp(bird, "roosting")) {
      if (isTamed(bird)) getUp(bird);
      else bird.triggerEvent(`${NS}:release_wild`);
    }
  }
  if (!isTamed(bird)) return;
  // Told to sit: it stays where it is, on its perch or not (Java's RoostGoal lets go of a sitting bird).
  if (boolProp(bird, "sitting")) {
    if (mode !== "free") getUp(bird);
    return;
  }
  let key = me.perch;
  if (key === undefined) {
    const nearby = perchesIn(pass.dimension).filter((p) => {
      // Only the ones within reach are looked at (a far one's chunk may not even be loaded).
      if (!inBox(me.location, p.block, FIND_REACH + 1)) return false;
      const at = perchAt(pass.dimension, p.block);
      if (at === "gone") forgetPerch(p.key);
      return at !== undefined && at !== "gone";
    });
    const found = nearestFreePerch(me, nearby, (p) => homeOf(pass, p.key, p.block));
    if (!found) return;
    key = found.key;
    bird.setDynamicProperty(P_PERCH, key);
    me.perch = key;
    (pass.byKey.get(key) ?? pass.byKey.set(key, []).get(key)!).push(me);
  }
  const where = parsePerchKey(key);
  if (!where || where.dimensionId !== pass.dimension.id) {
    // Its perch is in another world: it can't fly there; a pet like any other until it's back.
    if (mode !== "free") getUp(bird);
    if (!where) bird.setDynamicProperty(P_PERCH, undefined);
    return;
  }
  const block = perchAt(pass.dimension, where.block);
  if (block === undefined) {
    if (mode !== "free") getUp(bird); // too far from home to see it
    return;
  }
  if (block === "gone") {
    bird.setDynamicProperty(P_PERCH, undefined);
    forgetPerch(key);
    if (mode !== "free") getUp(bird);
    return;
  }
  const facing = facingOf(block);
  const along = seatOffset(me, homeOf(pass, key, where.block));
  const near = nearHome(bird.location, where.block);
  const stays = staysHome(bird.location, where.block, ownerLocation(bird, pass.dimension, pass.players));
  if (mode === "free") {
    const wasCalled = called.has(bird.id);
    if (near && goesHome({ called: wasCalled, night: pass.night, staysHome: stays, visitRoll: Math.floor(Math.random() * DAY_VISIT_CHANCE) })) {
      startHoming(bird, key, where.block, facing, along);
    }
    return;
  }
  let a = active.get(bird.id);
  if (!a) {
    // Loaded again (a save, its chunk): carry on where it was, with a fresh daytime sit.
    a = { bird, mode, key, block: where.block, facing, along, phase: 0, started: system.currentTick, dwell: dwellTicks(Math.random()), asleep: false };
    active.set(bird.id, a);
    if (mode === "perched") settle(a, true);
  }
  if (!near || !keepsSeat({ night: pass.night, staysHome: stays, dwell: a.dwell })) {
    getUp(bird);
    return;
  }
  a.facing = facing;
  a.along = along;
  setAsleep(a, pass.night);
}

system.runInterval(() => timed(perf.second, () => {
  const players = new Map(world.getAllPlayers().map((p) => [p.id, p] as [string, Player]));
  for (const dimension of allDimensions()) {
    const night = darkOutside(dimension.id);
    let entities: Entity[];
    try {
      entities = dimension.getEntities({ families: [FAMILY] });
    } catch {
      continue;
    }
    const birds = entities.map(info);
    const byKey = new Map<string, BirdInfo[]>();
    for (const b of birds) if (b.perch) (byKey.get(b.perch) ?? byKey.set(b.perch, []).get(b.perch)!).push(b);
    const pass: Pass = { dimension, birds, byKey, players, night };
    entities.forEach((bird, i) => {
      try {
        tickBird(bird, birds[i], pass);
      } catch (e) {
        console.warn(`Little Birds: perch: ${e}`);
      }
    });
  }
}), 20);

// ---------------------------------------------------------------- using a perch, setting down

/** The bird on this player's shoulder, if one is (the shoulder itself is shoulder.ts's). */
export function shoulderBirdOf(player: { id: string; dimension: Dimension; location: Vector3 }): Entity | undefined {
  return player.dimension
    .getEntities({ families: [FAMILY], location: player.location, maxDistance: 4 })
    .find((b) => boolProp(b, "shoulder") && ownerIdOf(b) === player.id);
}

/**
 * Where the shoulder (shoulder.ts) hooks in, so this file needn't import it: setting a bird down
 * off a shoulder, and a bird marked as on a shoulder seen by the once-a-second pass.
 */
export const shoulderHooks = {
  setDown: (bird: Entity) => bird.setProperty(`${NS}:shoulder`, false),
  seen: (_bird: Entity, _players: Map<string, Player>) => {},
};

function birdsAround(dimension: Dimension, block: Vector3): Entity[] {
  return dimension.getEntities({ families: [FAMILY], location: { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 }, maxDistance: 40 });
}

/** Whether this perch has a seat for this bird, from the birds around it now. */
function seatFor(bird: Entity, dimension: Dimension, key: string, block: Vector3): { ok: boolean; along: number } {
  const around = birdsAround(dimension, block).map(info);
  const me = around.find((b) => b.id === bird.id) ?? info(bird);
  const home = homeBirds(around, key, block);
  return { ok: hasSeatFor(me, home), along: seatOffset(me, [...home.filter((b) => b.id !== me.id), { ...me, perch: key }]) };
}

/** Its owner calls it to a perch: that perch is home now, and it goes at once (LittleBird.callTo). */
function callTo(bird: Entity, block: Block) {
  const key = perchKey(block.dimension.id, block.location);
  bird.setDynamicProperty(P_PERCH, key);
  const { along } = seatFor(bird, block.dimension, key, block.location);
  if (nearHome(bird.location, block.location)) startHoming(bird, key, block.location, facingOf(block), along);
  else called.add(bird.id);
}

/** Set down from a shoulder straight onto the seat, which is its home now. */
function seatBird(bird: Entity, block: Block) {
  const key = perchKey(block.dimension.id, block.location);
  shoulderHooks.setDown(bird);
  bird.setDynamicProperty(P_PERCH, key);
  const { along } = seatFor(bird, block.dimension, key, block.location);
  const a: Active = { bird, mode: "homing", key, block: block.location, facing: facingOf(block), along, phase: 1, started: system.currentTick, dwell: dwellTicks(Math.random()), asleep: false };
  active.set(bird.id, a);
  settle(a);
}

const FACE_OFFSET: Record<string, [number, number, number]> = {
  [Direction.Up]: [0, 1, 0], [Direction.Down]: [0, -1, 0], [Direction.North]: [0, 0, -1],
  [Direction.South]: [0, 0, 1], [Direction.East]: [1, 0, 0], [Direction.West]: [-1, 0, 0],
};

/** Who uses a block: a real player, or the self-test's stand-in. */
export interface User {
  id: string;
  dimension: Dimension;
  location: Vector3;
  sneaking: boolean;
  emptyHand: boolean;
}

/**
 * Using a block with an empty hand (PerchBlock.useWithoutItem, Shoulder.trySetDown): what it does
 * for the birds, or undefined when it does nothing (and the use goes on as usual).
 * - Sneak-use on any block with a bird on your shoulder: it hops down onto that block's face, or
 *   onto the seat if it is a perch with a seat for it (which becomes its home).
 * - Use a perch with a bird on your shoulder: onto the seat, or, if the perch is another bird's, it
 *   hops down at your feet.
 * - Use a perch otherwise: calls your bird to it (its own bird first, else your nearest bird the
 *   perch has a seat for, which makes it home).
 */
export function blockUse(user: User, block: Block, face: Direction): (() => void) | undefined {
  if (!user.emptyHand) return undefined;
  const isPerch = block.typeId === PERCH;
  const bird = shoulderBirdOf(user);
  if (user.sneaking && bird) {
    return () => {
      if (isPerch && seatFor(bird, block.dimension, perchKey(block.dimension.id, block.location), block.location).ok) {
        seatBird(bird, block);
        return;
      }
      shoulderHooks.setDown(bird);
      const o = FACE_OFFSET[face] ?? [0, 1, 0];
      bird.teleport({ x: block.x + o[0] + 0.5, y: block.y + o[1], z: block.z + o[2] + 0.5 });
    };
  }
  if (!isPerch || user.sneaking) return undefined;
  const key = perchKey(block.dimension.id, block.location);
  if (bird) {
    return () => {
      if (seatFor(bird, block.dimension, key, block.location).ok) seatBird(bird, block);
      else {
        // Someone else's perch: it hops down at its owner's feet instead.
        shoulderHooks.setDown(bird);
        bird.teleport(user.location);
      }
    };
  }
  const around = birdsAround(block.dimension, block.location).filter(isTamed);
  const candidates: CallCandidate[] = around.map((b) => ({
    ...info(b),
    owner: ownerIdOf(b),
    onShoulder: boolProp(b, "shoulder"),
    sitting: boolProp(b, "sitting"),
    perched: modeOf(b) === "perched",
  }));
  const pick = birdToCall(candidates, key, block.location, user.id, () => homeBirds(around.map(info), key, block.location));
  if (!pick) return undefined;
  const chosen = around.find((b) => b.id === pick.id)!;
  return () => {
    if (ownerIdOf(chosen) === undefined) chosen.setDynamicProperty(P_OWNER, user.id);
    callTo(chosen, block);
  };
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (!ev.isFirstEvent) return;
  const user: User = { id: ev.player.id, dimension: ev.player.dimension, location: ev.player.location, sneaking: sneaking(ev.player), emptyHand: !ev.itemStack };
  // Quick outs before anything is looked up: most uses are not of a perch, by a sneaking player.
  if (!user.emptyHand || (ev.block.typeId !== PERCH && !user.sneaking)) return;
  let act: (() => void) | undefined;
  try {
    act = blockUse(user, ev.block, ev.blockFace);
  } catch (e) {
    console.warn(`Little Birds: perch use: ${e}`);
  }
  if (!act) return;
  ev.cancel = true;
  system.run(act);
});

/** For the self-test: whether a bird is in the tick loop, and how. */
export const debugState = (id: string) => {
  const a = active.get(id);
  return a ? `${a.mode} along ${a.along.toFixed(2)} dwell ${a.dwell}` : "not active";
};
export { perchList };
