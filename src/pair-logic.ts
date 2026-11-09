// The rules for lovebird pairs and finch company (the Java edition's Lovebird and ZebraFinch), with no
// game objects, so the unit tests run them. pairs.ts applies them to the world.
//
// How each moves on Bedrock: the flying back to a partner or to company is the game's own
// follow_mob goal, in the entity file. For a lovebird that goal may follow only its partner, which a
// filter can tell only by a number both carry: the pair's "slot" (1 to PAIR_SLOTS). This file picks
// a slot no other pair nearby has.
import { Vec } from "./day-logic.js";

/** How far a lone lovebird looks for another (Lovebird.PAIR_REACH: the box around it, grown by 8). */
export const PAIR_REACH = 8;
/** How far apart a pair drifts before one flies back, and how close it comes (Lovebird.TOGETHER_RANGE, KeepTogetherGoal). */
export const TOGETHER_RANGE = 4;
export const TOGETHER_STOP = 2;
/** How far a finch looks for company, how far it drifts from it, how close it comes (ZebraFinch.COMPANY_REACH, COMPANY_RANGE). */
export const COMPANY_REACH = 8;
export const COMPANY_RANGE = 4;
/**
 * How often a lone lovebird looks for another: Java's PairUpGoal tries one tick in
 * reducedTickDelay(60) = 30, so about once in a second and a half. The script looks once a second,
 * with the same chance that a second of Java ticks would have found one: 1 - (29/30)^20.
 */
export const PAIR_TRY_PER_TICK = 1 / 30;
export const PAIR_TRY_PER_SECOND = 1 - Math.pow(1 - PAIR_TRY_PER_TICK, 20);
/** The pair slots a follow filter can tell apart; 0 is "no pair". */
export const PAIR_SLOTS = 15;
/** How near another pair must be for its slot to count as taken. */
export const SLOT_REACH = 32;

export interface Lovebird {
  id: string;
  location: Vec;
  /** The partner's id, if it has one. */
  partner?: string;
  /** The pair's slot, 0 for none. */
  slot: number;
  baby: boolean;
}

/** Whether b is within the box around a grown by reach (Java's getBoundingBox().inflate(reach), from the bird's middle). */
export function inReach(a: Vec, b: Vec, reach: number): boolean {
  return Math.abs(a.x - b.x) <= reach && Math.abs(a.y - b.y) <= reach && Math.abs(a.z - b.z) <= reach;
}

export const distSq = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/**
 * The lovebird a lone one pairs with: the nearest other grown lovebird on its own within reach,
 * or undefined (Lovebird.PairUpGoal). Chicks neither look nor are chosen: a chick pairs once grown.
 */
export function findMate(me: Lovebird, others: Lovebird[]): Lovebird | undefined {
  if (me.partner !== undefined || me.baby) return undefined;
  let best: Lovebird | undefined;
  for (const o of others) {
    if (o.id === me.id || o.partner !== undefined || o.baby || !inReach(me.location, o.location, PAIR_REACH)) continue;
    if (!best || distSq(o.location, me.location) < distSq(best.location, me.location)) best = o;
  }
  return best;
}

/** A slot for a new pair at this place: the lowest one no pair within SLOT_REACH has, else the least used. */
export function chooseSlot(at: Vec, others: Lovebird[]): number {
  const used = new Map<number, number>();
  for (const o of others) {
    if (o.slot > 0 && distSq(o.location, at) <= SLOT_REACH * SLOT_REACH) used.set(o.slot, (used.get(o.slot) ?? 0) + 1);
  }
  let least = 1;
  for (let s = 1; s <= PAIR_SLOTS; s++) {
    if (!used.has(s)) return s;
    if (used.get(s)! < used.get(least)!) least = s;
  }
  return least;
}

/**
 * Whether this pair should take another slot: another pair with the same slot is within
 * SLOT_REACH (two pairs met). Only one of the two pairs moves: the one whose first id sorts later.
 */
export function slotClashes(me: Lovebird, others: Lovebird[]): boolean {
  if (me.partner === undefined || me.slot === 0) return false;
  const mine = [me.id, me.partner].sort()[0];
  for (const o of others) {
    if (o.id === me.id || o.id === me.partner || o.slot !== me.slot || o.partner === undefined) continue;
    if (distSq(o.location, me.location) > SLOT_REACH * SLOT_REACH) continue;
    if ([o.id, o.partner].sort()[0] < mine) return true;
  }
  return false;
}
