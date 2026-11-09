// The shoulder: the Java edition's Shoulder and the shoulder parts of LittleBird, on Bedrock. The
// rules are in shoulder-logic.ts; this file applies them to the world.
//
// Nothing may ride a player, so a bird on a shoulder is a state of its own: its owner sneak-uses it
// with an empty hand and it is held at their right shoulder every tick, facing their way; a
// sneak-use takes it off again, and so does a sneak-use on a block or a use of a perch (perch.ts).
// It never gets off on its own for a jump or a fall, and it follows its owner through portals; only
// its owner going for good (leaving the game, dying, turning spectator) sets it down where it is.
// The canary and the zebra finch keep to their perches and never ride a shoulder.
//
// Only the birds on a shoulder are watched every tick; a bird marked as on one that nothing holds
// (a world saved with it there) goes back to its owner if they are near, or is set down.
import { world, system, Entity, Player, Dimension, Vector3, GameMode } from "@minecraft/server";
import { NS, leavePerch, ownerIdOf, shoulderBirdOf, shoulderHooks, sneaking, standIns } from "./perch.js";
import { REJOIN_RANGE, birdUse, shoulderSeat } from "./shoulder-logic.js";

const FAMILY = "little_bird";
const P_OWNER = `${NS}:owner`;
/** How long the tick loop keeps looking for a bird whose handle went (a move between worlds is a remove and an add). */
const LOST_TICKS = 100;

const kindOf = (bird: Entity) => bird.typeId.slice(NS.length + 1);
const isTamed = (bird: Entity) => bird.getComponent("minecraft:is_tamed") !== undefined;
export const isOnShoulder = (bird: Entity) => bird.getProperty(`${NS}:shoulder`) === true;

/** Where an owner is and which way they face. */
interface Pose {
  dimension: Dimension;
  location: Vector3;
  yaw: number;
}

/** The birds on a shoulder now, by bird id. */
interface Held {
  bird: Entity;
  ownerId: string;
  player?: Player;
  lostSince?: number;
}
const held = new Map<string, Held>();

/** What the shoulder loop costs, in milliseconds (the self-test's budget reads it). */
export const shoulderPerf = { runs: 0, ms: 0, max: 0 };

const findPlayer = (id: string) => world.getAllPlayers().find((p) => p.id === id);

/**
 * Where the owner is, or undefined if they have gone for good (left, dead, a spectator). A real
 * player wins; the self-test's stand-in owners (perch.ts) count too.
 */
function poseOf(h: Held): Pose | undefined {
  let p = h.player;
  if (!p || !p.isValid) p = h.player = findPlayer(h.ownerId);
  if (p) {
    if (p.getGameMode() === GameMode.Spectator) return undefined;
    return { dimension: p.dimension, location: p.location, yaw: p.getRotation().y };
  }
  const s = standIns.get(h.ownerId);
  if (!s) return undefined;
  return { dimension: world.getDimension(s.dimensionId), location: s.location, yaw: s.yaw ?? 0 };
}

function holdAt(bird: Entity, pose: Pose) {
  const seat = shoulderSeat(pose.location, pose.yaw);
  try {
    bird.clearVelocity();
  } catch {
    /* nothing to clear */
  }
  if (bird.dimension.id === pose.dimension.id) bird.teleport(seat, { rotation: { x: 0, y: pose.yaw } });
  else bird.teleport(seat, { dimension: pose.dimension, rotation: { x: 0, y: pose.yaw } }); // through a portal with its owner
}

/** Onto its owner's shoulder (LittleBird.setOnShoulder(true)). */
export function putOn(bird: Entity, ownerId: string, player?: Player) {
  if (ownerIdOf(bird) === undefined) bird.setDynamicProperty(P_OWNER, ownerId);
  leavePerch(bird);
  bird.triggerEvent(`${NS}:shoulder`);
  bird.setProperty(`${NS}:shoulder`, true);
  const h: Held = { bird, ownerId, player };
  held.set(bird.id, h);
  const pose = poseOf(h);
  if (pose) holdAt(bird, pose);
}

/** Off the shoulder, where it is, and back to its own devices (LittleBird.setOnShoulder(false)). */
export function setDown(bird: Entity) {
  held.delete(bird.id);
  if (!bird.isValid) return;
  bird.setProperty(`${NS}:shoulder`, false);
  bird.triggerEvent(`${NS}:release`);
}
shoulderHooks.setDown = setDown;

// A bird marked as on a shoulder that nothing holds (a world saved with it there, a restart): back
// on its owner's shoulder if they are here and near, else set down where it is. Left alone it would
// hang in the air.
shoulderHooks.seen = (bird: Entity, players: Map<string, Player>) => {
  if (held.has(bird.id)) return;
  const id = ownerIdOf(bird);
  const p = id === undefined ? undefined : players.get(id);
  const s = id === undefined ? undefined : standIns.get(id);
  const where = p ? { d: p.dimension.id, at: p.location } : s ? { d: s.dimensionId, at: s.location } : undefined;
  const near = where && where.d === bird.dimension.id && Math.hypot(where.at.x - bird.location.x, where.at.y - bird.location.y, where.at.z - bird.location.z) <= REJOIN_RANGE;
  if (id !== undefined && near && (!p || p.getGameMode() !== GameMode.Spectator)) putOn(bird, id, p);
  else setDown(bird);
};

// ---------------------------------------------------------------- every tick: the birds on a shoulder

function tickHeld(id: string, h: Held) {
  if (!h.bird.isValid) {
    // Moved between worlds (a remove and an add): the same bird, the same id, once its new chunk is in.
    const again = world.getEntity(id);
    if (again && again.isValid) {
      h.bird = again;
      delete h.lostSince;
    } else {
      h.lostSince ??= system.currentTick;
      if (system.currentTick - h.lostSince > LOST_TICKS) held.delete(id);
      return;
    }
  }
  if (!isOnShoulder(h.bird)) {
    held.delete(id); // set down by something else
    return;
  }
  const pose = poseOf(h);
  if (!pose) {
    setDown(h.bird); // its owner has gone
    return;
  }
  holdAt(h.bird, pose);
}

system.runInterval(() => {
  if (held.size === 0) return;
  const t = Date.now();
  for (const [id, h] of held) {
    try {
      tickHeld(id, h);
    } catch (e) {
      console.warn(`Little Birds: shoulder: ${e}`);
    }
  }
  const ms = Date.now() - t;
  shoulderPerf.runs++;
  shoulderPerf.ms += ms;
  if (ms > shoulderPerf.max) shoulderPerf.max = ms;
}, 1);

// ---------------------------------------------------------------- using a bird

/** Who uses a bird: a real player, or the self-test's stand-in. */
export interface BirdUser {
  id: string;
  dimension: Dimension;
  location: Vector3;
  sneaking: boolean;
  emptyHand: boolean;
  player?: Player;
}

/**
 * Using a bird (LittleBird.mobInteract, its shoulder part): what it does, or undefined when the use
 * is none of the shoulder's business and goes on as usual. A returned function that does nothing
 * still stops the use (a song bird asks nothing of a sneak-use).
 */
export function birdUseAction(user: BirdUser, bird: Entity): (() => void) | undefined {
  const what = birdUse({
    sneaking: user.sneaking,
    emptyHand: user.emptyHand,
    tamed: isTamed(bird),
    kind: kindOf(bird),
    baby: bird.getComponent("minecraft:is_baby") !== undefined,
    owner: ownerIdOf(bird),
    player: user.id,
    onShoulder: isOnShoulder(bird),
    playerHasOne: shoulderBirdOf(user) !== undefined,
  });
  if (what === "pass") return undefined;
  if (what === "on") return () => putOn(bird, user.id, user.player);
  if (what === "off") return () => setDown(bird);
  return () => {};
}

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (!ev.target.matches({ families: [FAMILY] })) return;
  // Quick out: only a sneak-use with an empty hand is the shoulder's.
  if (ev.itemStack) return;
  const user: BirdUser = { id: ev.player.id, dimension: ev.player.dimension, location: ev.player.location, sneaking: sneaking(ev.player), emptyHand: true, player: ev.player };
  if (!user.sneaking) return;
  let act: (() => void) | undefined;
  try {
    act = birdUseAction(user, ev.target);
  } catch (e) {
    console.warn(`Little Birds: shoulder use: ${e}`);
  }
  if (!act) return;
  ev.cancel = true;
  system.run(act);
});

// ---------------------------------------------------------------- its owner goes

/** Its owner changed worlds (a portal, the End's exit): the bird comes too, straight onto the shoulder (Shoulder.followAcrossWorlds). */
export function ownerTravelled(ownerId: string) {
  for (const [id, h] of held) {
    if (h.ownerId !== ownerId || !h.bird.isValid) continue;
    const pose = poseOf(h);
    if (!pose) continue;
    try {
      holdAt(h.bird, pose);
    } catch (e) {
      console.warn(`Little Birds: shoulder portal: ${e}`);
    }
    held.set(id, h);
  }
}

/** Its owner has gone for good (left the game, died, turned spectator): set down where it is. */
export function ownerGone(ownerId: string) {
  for (const h of [...held.values()]) if (h.ownerId === ownerId) setDown(h.bird);
}

world.afterEvents.playerDimensionChange.subscribe(({ player }) => ownerTravelled(player.id));
world.afterEvents.playerLeave.subscribe(({ playerId }) => ownerGone(playerId));
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity.typeId === "minecraft:player") ownerGone(deadEntity.id);
});
world.afterEvents.playerGameModeChange.subscribe(({ player, toGameMode }) => {
  if (toGameMode === GameMode.Spectator) ownerGone(player.id);
});

/** For the self-test: the birds held on a shoulder, and whose. */
export const debugShoulder = (id: string) => {
  const h = held.get(id);
  return h ? `held for ${h.ownerId}` : "not held";
};
