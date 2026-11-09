// The shoulder's rules, with no game objects in them, so the unit tests can run them in Node. Each
// mirrors the Java edition's Shoulder and the shoulder parts of LittleBird; src/shoulder.ts applies
// them to the world.

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** How far up from its owner's feet the bird sits (LittleBird.SHOULDER_UP). */
export const SHOULDER_UP = 1.2;
/**
 * How far out to the right of its owner's middle. Java's is 0.42, but Bedrock pushes a player out
 * of any entity box that overlaps theirs, whatever the bird's components say, and a Creative player
 * nudged off the ground is switched into flight (that stopped crouching in the spike). So the seat
 * sits a little further out, and the bird's box shrinks to {@link SHOULDER_BOX} while it is there:
 * together they clear the player's box at every angle.
 */
export const SHOULDER_OUT = 0.51;
/** The bird's collision box on a shoulder (width and height, blocks). */
export const SHOULDER_BOX = 0.1;
/** Half the width of a player's box. */
export const PLAYER_HALF_WIDTH = 0.3;
/** A bird marked as on a shoulder with nothing holding it goes back to its owner within this distance, else is set down. */
export const REJOIN_RANGE = 32;

/** Whether this kind of bird rides a shoulder: a song bird (canary, zebra finch) keeps to its perch (ridesShoulders). */
export function ridesShoulders(kind: string): boolean {
  return kind !== "canary" && kind !== "zebra_finch";
}

/**
 * Where the bird sits on its owner: up from the feet and out to the right of the body, for the way
 * the owner faces (yaw in degrees, 0 facing +z). The same sums as LittleBird.followShoulder.
 */
export function shoulderSeat(owner: Vec, yaw: number): Vec {
  const rad = (yaw * Math.PI) / 180;
  return { x: owner.x - Math.cos(rad) * SHOULDER_OUT, y: owner.y + SHOULDER_UP, z: owner.z - Math.sin(rad) * SHOULDER_OUT };
}

/** Whether a bird's box at {@link seat} overlaps the box of a player standing at {@link owner} (across only). */
export function overlapsPlayer(seat: Vec, owner: Vec, birdWidth = SHOULDER_BOX): boolean {
  const reach = PLAYER_HALF_WIDTH + birdWidth / 2;
  return Math.abs(seat.x - owner.x) < reach && Math.abs(seat.z - owner.z) < reach;
}

export type BirdUse = "on" | "off" | "nothing" | "pass";

/**
 * What a sneak-use with an empty hand does to a tamed bird (LittleBird.mobInteract): its owner (or
 * anyone, for a bird with no owner on record) takes it onto the shoulder, or off it; a song bird or
 * a chick asks nothing of it ("nothing": the use stops there); a bird whose owner already has one
 * on the shoulder stays put; someone else's bird, a wild one, or a use that isn't a sneak with an
 * empty hand is none of the shoulder's business ("pass").
 */
export function birdUse(s: {
  sneaking: boolean;
  emptyHand: boolean;
  tamed: boolean;
  kind: string;
  baby: boolean;
  owner: string | undefined;
  player: string;
  onShoulder: boolean;
  playerHasOne: boolean;
}): BirdUse {
  if (!s.sneaking || !s.emptyHand) return "pass";
  if (!ridesShoulders(s.kind)) return "nothing";
  if (!s.tamed || (s.owner !== undefined && s.owner !== s.player)) return "pass";
  if (s.baby) return "nothing";
  if (s.onShoulder) return "off";
  return s.playerHasOne ? "nothing" : "on";
}
