// The perch's rules, with no game objects in them, so the unit tests can run them in Node. Each
// mirrors the Java edition's class named beside it; src/perch.ts applies them to the world.
//
// Positions are plain {x, y, z}. A perch is named by its block position and the way its placer
// faced (the block's minecraft:cardinal_direction state).

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export type Facing = "north" | "south" | "east" | "west";

/** How far above the block's bottom a bird's feet sit: the top of the bar (PerchBlock.SEAT_HEIGHT). */
export const SEAT_HEIGHT = 12 / 16;
/** A hair above the bar, so the bird rests on the perch's collision box instead of in its top face. */
export const SEAT_LIFT = 0.01;
/** How far away a bird can be called from (PerchBlock.CALL_REACH). */
export const CALL_REACH = 16;
/** How far a bird looks for a perch to make its own, across and up (FindPerchGoal.REACH, REACH_UP). */
export const FIND_REACH = 8;
export const FIND_REACH_UP = 4;
/** Farther than this from its perch, a bird doesn't fly home; it is any pet until near again (RoostGoal.FLY_HOME_RANGE). */
export const FLY_HOME_RANGE = 32;
/** Its owner farther than this from the perch (or not here at all) is away (LittleBird.HOME_RANGE). */
export const HOME_RANGE = 16;
/** By day, a bird on its perch stays 20 to 60 seconds before it gets up (RoostGoal.start). */
export const DWELL_MIN = 400;
export const DWELL_SPAN = 800;
/**
 * The chance a free bird near home in daylight goes to sit on its perch for a while. Java tries
 * 1 in 600 each time the goal is weighed, every other tick; checked here once a second (20 ticks,
 * so 10 tries), that is 1 in 60.
 */
export const DAY_VISIT_CHANCE = 60;
/** How long it keeps trying to land before giving up for now (RoostGoal.GIVE_UP_TICKS). */
export const GIVE_UP_TICKS = 600;
/** How far either side of the bar's middle each of two birds sits (Lovebird.PAIR_SEAT, ZebraFinch.SHARED_SEAT). */
export const SHARED_SEAT = 0.2;
/** Blocks a tick on the way home: about a bird's flying speed. */
export const FLY_SPEED = 0.14;

/** The night on the day clock: the hours the Java edition counts as dark outside, roughly. */
export function isNight(timeOfDay: number): boolean {
  const t = ((timeOfDay % 24000) + 24000) % 24000;
  return t >= 13000 && t < 23000;
}

// ---------------------------------------------------------------- seats (PerchBlock)

/**
 * The bar runs along x when the placer faced north or south, along z when east or west (the block
 * turns its model a quarter for those).
 */
export function barAlongX(facing: Facing): boolean {
  return facing === "north" || facing === "south";
}

/**
 * The way a bird on the perch faces: back towards whoever placed it. The block state is the way
 * the placer faced; yaw 0 faces south (+z), 90 west, 180 north, -90 east, as for any entity.
 */
export function seatYaw(facing: Facing): number {
  return { north: 0, south: 180, east: 90, west: -90 }[facing];
}

/** Where a bird sits on the perch at {@link block}, {@link along} blocks from the middle of the bar. */
export function seat(block: Vec, facing: Facing, along = 0): Vec {
  const s = { x: block.x + 0.5, y: block.y + SEAT_HEIGHT + SEAT_LIFT, z: block.z + 0.5 };
  if (along !== 0) {
    if (barAlongX(facing)) s.x += along;
    else s.z += along;
  }
  return s;
}

// ---------------------------------------------------------------- who may sit where

/** What the rules need to know about a bird. */
export interface BirdInfo {
  id: string;
  /** Its kind: budgie, cockatiel, lovebird, canary, zebra_finch. */
  kind: string;
  /** The perch it calls home ("dimension|x|y|z"), if any. */
  perch?: string;
  /** A lovebird's partner, by entity id (pairs come with the lovebird's pairing). */
  partner?: string;
  location: Vec;
}

/** How many other birds may share its perch: a lovebird's partner, or one other finch; else none. */
export function maxPerchMates(bird: BirdInfo): number {
  return bird.kind === "lovebird" || bird.kind === "zebra_finch" ? 1 : 0;
}

/** Whether two birds may call the same perch home: a lovebird and its partner, or any two finches. */
export function sharesPerchWith(bird: BirdInfo, other: BirdInfo): boolean {
  if (bird.kind === "lovebird") return bird.partner !== undefined && bird.partner === other.id;
  if (bird.kind === "zebra_finch") return other.kind === "zebra_finch";
  return false;
}

/** Inside the box {@link reach} blocks out from the block at {@link block}, on each axis (Java's AABB.inflate). */
export function inBox(at: Vec, block: Vec, reach: number, reachUp = reach): boolean {
  return (
    at.x >= block.x - reach && at.x <= block.x + 1 + reach &&
    at.y >= block.y - reachUp && at.y <= block.y + 1 + reachUp &&
    at.z >= block.z - reach && at.z <= block.z + 1 + reach
  );
}

/**
 * The birds that call the perch home, of those given: alive ones that name it, within twice the
 * finding reach of it (PerchBlock.homeBirds).
 */
export function homeBirds(birds: BirdInfo[], key: string, block: Vec): BirdInfo[] {
  return birds.filter((b) => b.perch === key && inBox(b.location, block, FIND_REACH * 2));
}

/**
 * Whether the perch has a seat for this bird: no other bird calls it home, or only ones it shares
 * with, and no more than it allows (PerchBlock.hasSeatFor). {@link home} is the perch's home birds.
 */
export function hasSeatFor(bird: BirdInfo, home: BirdInfo[]): boolean {
  const others = home.filter((b) => b.id !== bird.id);
  return others.length <= maxPerchMates(bird) && others.every((o) => sharesPerchWith(bird, o));
}

/**
 * Entity ids in a fixed order, so two birds agree on who takes which side. Bedrock's ids are
 * whole numbers written out; anything else falls back to the text.
 */
export function compareIds(a: string, b: string): number {
  if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) {
    const x = BigInt(a), y = BigInt(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Where along the bar it sits: the middle for a bird on its own; two that share sit either side,
 * the one whose id sorts first on the left (Lovebird.seatOffset, ZebraFinch.seatOffset). A lovebird
 * with a partner keeps its side whether or not the partner is home; a finch moves aside only while
 * another finch calls its perch home.
 */
export function seatOffset(bird: BirdInfo, home: BirdInfo[]): number {
  if (bird.kind === "lovebird") {
    if (bird.partner === undefined) return 0;
    return compareIds(bird.id, bird.partner) < 0 ? -SHARED_SEAT : SHARED_SEAT;
  }
  if (bird.kind === "zebra_finch") {
    const mate = home.find((o) => o.id !== bird.id && o.kind === "zebra_finch");
    if (!mate) return 0;
    return compareIds(bird.id, mate.id) < 0 ? -SHARED_SEAT : SHARED_SEAT;
  }
  return 0;
}

// ---------------------------------------------------------------- finding a perch (FindPerchGoal)

export interface PerchInfo {
  key: string;
  block: Vec;
}

const centre = (block: Vec): Vec => ({ x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });
export const distSq = (a: Vec, b: Vec): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/**
 * The perch a bird without one makes its own: the nearest within reach (8 across, 4 up and down
 * from the block it is in) that has a seat for it. {@link homeOf} gives a perch's home birds.
 */
export function nearestFreePerch(bird: BirdInfo, perches: PerchInfo[], homeOf: (p: PerchInfo) => BirdInfo[]): PerchInfo | undefined {
  const at = { x: Math.floor(bird.location.x), y: Math.floor(bird.location.y), z: Math.floor(bird.location.z) };
  let best: PerchInfo | undefined;
  let bestDist = Infinity;
  for (const p of perches) {
    if (Math.abs(p.block.x - at.x) > FIND_REACH || Math.abs(p.block.z - at.z) > FIND_REACH || Math.abs(p.block.y - at.y) > FIND_REACH_UP) continue;
    const d = distSq(centre(p.block), bird.location);
    if (d < bestDist && hasSeatFor(bird, homeOf(p))) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- home (LittleBird, RoostGoal)

/** Whether the bird is near enough its perch to fly home to it (RoostGoal.nearHome). */
export function nearHome(bird: Vec, block: Vec): boolean {
  return distSq(centre(block), bird) < FLY_HOME_RANGE * FLY_HOME_RANGE;
}

/**
 * Whether its owner is away: farther than {@link HOME_RANGE} from the perch, in another world, or
 * not here at all ({@link owner} undefined).
 */
export function ownerAway(owner: Vec | undefined, block: Vec): boolean {
  return owner === undefined || distSq(centre(block), owner) >= HOME_RANGE * HOME_RANGE;
}

/** Whether the bird stays home rather than following: near its perch, and its owner away (LittleBird.staysHome). */
export function staysHome(bird: Vec, block: Vec, owner: Vec | undefined): boolean {
  return nearHome(bird, block) && ownerAway(owner, block);
}

/**
 * Whether a free bird near home goes to its perch now: it was called, it is night, its owner is
 * away, or (by day) the odds came up for a visit (RoostGoal.canUse). {@link visitRoll} is a random
 * whole number from 0 up to {@link DAY_VISIT_CHANCE}.
 */
export function goesHome(s: { called: boolean; night: boolean; staysHome: boolean; visitRoll: number }): boolean {
  return s.called || s.night || s.staysHome || s.visitRoll === 0;
}

/**
 * Whether a bird on its perch (or on its way) keeps at it: all night, while its owner is away, or
 * until its daytime sit is over (RoostGoal.canContinueToUse).
 */
export function keepsSeat(s: { night: boolean; staysHome: boolean; dwell: number }): boolean {
  return s.night || s.staysHome || s.dwell > 0;
}

/** How long a bird that has just landed stays by day, from a random number in [0, 1). */
export function dwellTicks(random: number): number {
  return DWELL_MIN + Math.floor(random * DWELL_SPAN);
}

// ---------------------------------------------------------------- calling (PerchBlock.birdToCall)

export interface CallCandidate extends BirdInfo {
  /** Whose it is, by player id; undefined when nobody is recorded (a bird tamed before owners were kept). */
  owner?: string;
  /** On a shoulder, told to sit, or already on its own perch's seat: then it isn't called. */
  onShoulder: boolean;
  sitting: boolean;
  perched: boolean;
}

/**
 * The bird a use of the perch calls: of the player's tamed birds within reach that aren't on a
 * shoulder, one that calls this perch home comes first (unless it is on its seat already), then the
 * nearest the perch has a seat for. A bird nobody is recorded as owning answers anyone. Java also
 * stands a sitting bird up to come; Bedrock's scripts can't stand a bird up, so a sitting bird
 * stays put and isn't called.
 */
export function birdToCall(
  candidates: CallCandidate[],
  key: string,
  block: Vec,
  playerId: string,
  homeOf: () => BirdInfo[],
): CallCandidate | undefined {
  let pick: CallCandidate | undefined;
  let best = Infinity;
  const home = homeOf();
  const c = centre(block);
  for (const b of candidates) {
    if (b.onShoulder || b.sitting) continue;
    if (b.owner !== undefined && b.owner !== playerId) continue;
    if (!inBox(b.location, block, CALL_REACH)) continue;
    const itsOwn = b.perch === key;
    if (itsOwn && b.perched) continue;
    if (!itsOwn && !hasSeatFor(b, home)) continue;
    // Its own bird always beats a newcomer; among equals, the nearest.
    const score = distSq(b.location, c) - (itsOwn ? CALL_REACH * CALL_REACH * 4 : 0);
    if (score < best) {
      best = score;
      pick = b;
    }
  }
  return pick;
}

// ---------------------------------------------------------------- the flight home

/**
 * One tick of the flight home. Phase 0 makes for the air a block above the seat (Java aims a block
 * and a half above the bar: so the bird comes down onto it rather than at it); phase 1 glides down
 * onto the seat. Returns where the bird is next, the way it faces, and whether it has landed.
 */
export function flightStep(at: Vec, seatAt: Vec, phase: 0 | 1): { to: Vec; yaw: number; phase: 0 | 1; landed: boolean } {
  const target = phase === 0 ? { x: seatAt.x, y: seatAt.y + 1, z: seatAt.z } : seatAt;
  const d = { x: target.x - at.x, y: target.y - at.y, z: target.z - at.z };
  const len = Math.hypot(d.x, d.y, d.z);
  if (phase === 0 && len < 0.5) return { to: at, yaw: yawTowards(d), phase: 1, landed: false };
  if (phase === 1 && len < 0.25) return { to: seatAt, yaw: yawTowards(d), phase: 1, landed: true };
  const step = Math.min(FLY_SPEED, len);
  return { to: { x: at.x + (d.x / len) * step, y: at.y + (d.y / len) * step, z: at.z + (d.z / len) * step }, yaw: yawTowards(d), phase, landed: false };
}

/** The yaw that faces along {@link d} (0 is +z, 90 is -x). */
export function yawTowards(d: Vec): number {
  return (Math.atan2(-d.x, d.z) * 180) / Math.PI;
}

/** Whether a bird held on its seat has been knocked off it (Java: more than half a block across or up and down). */
export function offSeat(at: Vec, seatAt: Vec): boolean {
  const across = (seatAt.x - at.x) ** 2 + (seatAt.z - at.z) ** 2;
  return across > 0.25 || Math.abs(at.y - seatAt.y) > 0.5;
}

// ---------------------------------------------------------------- keys

export const perchKey = (dimensionId: string, block: Vec): string => `${dimensionId}|${block.x}|${block.y}|${block.z}`;
export function parsePerchKey(key: string): { dimensionId: string; block: Vec } | undefined {
  const parts = key.split("|");
  if (parts.length !== 4) return undefined;
  const [d, x, y, z] = parts;
  const block = { x: Number(x), y: Number(y), z: Number(z) };
  if (![block.x, block.y, block.z].every(Number.isInteger)) return undefined;
  return { dimensionId: d, block };
}
