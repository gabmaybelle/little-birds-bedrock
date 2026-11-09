// The rules for breeding (vanilla Animal and BreedGoal, with the Java edition's LittleBird.canMate and
// Lovebird.canMate on top), with no game objects, so the unit tests run them. breeding.ts applies them.
//
// Bedrock's own breeding is not used: two fed birds of a kind fell in love and came together, but
// with fly navigation one climbed above the other and they never finished (a simulated player's
// check, 2026-11-09), and it can't keep a lovebird to its partner. So, as on Java: seeds make a
// tamed grown bird its owner feeds fall in love for 30 seconds (hearts); two in love of a kind within
// 8 blocks come together; after 3 seconds and within 3 blocks of each other a chick appears, and both
// parents wait 5 minutes before they can again.
import { Vec } from "./day-logic.js";

const distSq = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
/** Within the box around a grown by reach (Java's getBoundingBox().inflate(reach)). */
const inReach = (a: Vec, b: Vec, reach: number) => Math.abs(a.x - b.x) <= reach && Math.abs(a.y - b.y) <= reach && Math.abs(a.z - b.z) <= reach;

/** How long a fed bird is in love (Animal.setInLove: 600 ticks); hearts every 10 of them. */
export const LOVE_TICKS = 600;
export const HEARTS_EVERY = 10;
/** How far it looks for a mate (BreedGoal: the box grown by 8). */
export const MATE_REACH = 8;
/** How long two court before the chick, and how close they must be then (BreedGoal: 60 ticks, distance squared under 9). */
export const COURT_TICKS = 60;
export const BREED_DIST = 3;
/** How long a parent waits before it can fall in love again (Animal: setAge(6000)). */
export const COOLDOWN_TICKS = 6000;
/** How fast courting birds close on each other, in blocks a tick (the perch flight's speed). */
export const COURT_SPEED = 0.14;
/** Courting birds stop closing in this near (their boxes touch). */
export const COURT_NEAR = 0.6;

export interface Breeder {
  id: string;
  kind: string;
  location: Vec;
  tame: boolean;
  baby: boolean;
  /** A lovebird's partner's id. */
  partner?: string;
  /** In love until this absolute tick (0 when not). */
  loveUntil: number;
  /** Can't fall in love again before this absolute tick. */
  readyAt: number;
}

/**
 * Whether seeds from this player make the bird fall in love now (Animal.mobInteract, LittleBird's
 * seeds branch): tamed, its owner's (or nobody's on record), grown, not in love already, not resting
 * after a chick. A lovebird without a partner has no one to love (Lovebird.canMate).
 */
export function fallsInLove(b: Breeder, now: number, owner: string | undefined, playerId: string): boolean {
  if (!b.tame || b.baby || (owner !== undefined && owner !== playerId)) return false;
  if (b.loveUntil > now || b.readyAt > now) return false;
  return b.kind !== "lovebird" || b.partner !== undefined;
}

export const inLove = (b: Breeder, now: number) => b.loveUntil > now;

/** Whether two birds may mate now (LittleBird.canMate, Lovebird.canMate): both tamed, of a kind, in love; lovebirds only as a pair. */
export function canMate(a: Breeder, b: Breeder, now: number): boolean {
  if (a.id === b.id || a.kind !== b.kind || !a.tame || !b.tame || a.baby || b.baby) return false;
  if (!inLove(a, now) || !inLove(b, now)) return false;
  if (a.kind === "lovebird") return a.partner === b.id && b.partner === a.id;
  return true;
}

/** The mate a bird in love goes to: the nearest it may mate with within reach (BreedGoal.getFreePartner). */
export function findMate(me: Breeder, others: Breeder[], now: number): Breeder | undefined {
  let best: Breeder | undefined;
  for (const o of others) {
    if (!canMate(me, o, now) || !inReach(me.location, o.location, MATE_REACH)) continue;
    if (!best || distSq(o.location, me.location) < distSq(best.location, me.location)) best = o;
  }
  return best;
}

/** Whether a courting pair has a chick now: courted long enough, and close (BreedGoal.tick). */
export const breedsNow = (courted: number, a: Vec, b: Vec) => courted >= COURT_TICKS && distSq(a, b) < BREED_DIST * BREED_DIST;

/** One tick of closing in: where a courting bird moves toward its mate (stays put once near). */
export function courtStep(at: Vec, mate: Vec): Vec {
  const d = { x: mate.x - at.x, y: mate.y - at.y, z: mate.z - at.z };
  const len = Math.hypot(d.x, d.y, d.z);
  if (len <= COURT_NEAR) return at;
  const step = Math.min(COURT_SPEED, len - COURT_NEAR);
  return { x: at.x + (d.x / len) * step, y: at.y + (d.y / len) * step, z: at.z + (d.z / len) * step };
}

/**
 * The chick (LittleBird.getBreedOffspring): one parent's colour at random ({@link pick} 0 or 1), and
 * the owner on record of the parent that bred it, else the other's.
 */
export function chickOf(a: { colour: number; owner?: string }, b: { colour: number; owner?: string }, pick: 0 | 1): { colour: number; owner?: string } {
  return { colour: pick === 0 ? a.colour : b.colour, owner: a.owner ?? b.owner };
}
