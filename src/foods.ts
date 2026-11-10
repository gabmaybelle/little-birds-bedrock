// The foods: the Java edition's Foods and the millet spray, snack and refused-food parts of
// LittleBird.mobInteract, on Bedrock. The rules are in food-logic.ts.
//
// A player using a food on a bird: a refused food gets a head shake; the millet spray tames a wild
// bird at once or treats a tamed one (a bob, or a song for a canary or a finch); a snack feeds a
// tamed one of theirs, with crumbs. Treats and snacks give a little health back and leave the bird
// full for a while. Both are silent, as on Java (its birds play no eating sound for them).
//
// A chick's growing a little for a treat or a snack is the game's: only the entity's ageable
// component can change its age, so the food goes on to it (it takes the item) and the script does
// the rest. Millet tempting a bird to follow is the entity's tempt goal.
import { world, system, Entity, Player, GameMode, ItemStack } from "@minecraft/server";
import { NS, P_OWNER, ownerIdOf } from "./perch.js";
import { bob, menders } from "./greeting.js";
import { finchSings, sing } from "./songs.js";
import { FoodAction, SHAKE_TICKS, SNACK_FULL, TREAT_FULL, enjoys, foodAction, grownByGame, healed, isFood } from "./food-logic.js";

const FAMILY = "little_bird";
const SHAKING = `${NS}:shaking`;

const kindOf = (bird: Entity) => bird.typeId.slice(NS.length + 1);
const isTamed = (bird: Entity) => bird.getComponent("minecraft:is_tamed") !== undefined;
const isBaby = (bird: Entity) => bird.getComponent("minecraft:is_baby") !== undefined;

/** Full of a treat, and of a snack, until these ticks (Java counts them down and doesn't save them). */
const treatUntil = new Map<string, number>();
const snackUntil = new Map<string, number>();
/** Birds shaking their heads now, and the tick it ends. */
const shaking = new Map<string, number>();
/** How many treats, snacks and refusals each bird has had since the script loaded (for the self-test, as Java's counters). */
const counts = new Map<string, { treats: number; snacks: number; refusals: number }>();
const countOf = (bird: Entity) => counts.get(bird.id) ?? counts.set(bird.id, { treats: 0, snacks: 0, refusals: 0 }).get(bird.id)!;

/** Who feeds: a real player, or the self-test's stand-in (an id only). */
export interface Feeder {
  id: string;
  player?: Player;
}

/** One of the held item gone, unless the feeder is in Creative (Player.usePlayerItem). */
function useOne(feeder: Feeder) {
  const p = feeder.player;
  if (!p || p.getGameMode() === GameMode.Creative) return;
  const inv = p.getComponent("minecraft:inventory")?.container;
  const slot = p.selectedSlotIndex;
  const stack = inv?.getItem(slot);
  if (inv && stack) inv.setItem(slot, stack.amount > 1 ? new ItemStack(stack.typeId, stack.amount - 1) : undefined);
}

function heal(bird: Entity) {
  const h = bird.getComponent("minecraft:health");
  if (h) h.setCurrentValue(healed(h.currentValue, h.effectiveMax));
}

function hearts(bird: Entity) {
  const h = bird.getAABB().extent;
  for (let i = 0; i < 7; i++) {
    const at = bird.location;
    bird.dimension.spawnParticle("minecraft:heart_particle", {
      x: at.x + (Math.random() - 0.5) * h.x * 2,
      y: at.y + Math.random() * h.y * 2 + 0.5,
      z: at.z + (Math.random() - 0.5) * h.z * 2,
    });
  }
}

/** Crumbs of the snack, as Java's item particles: six bits at about three fifths of the bird's height. */
function crumbs(bird: Entity, item: string) {
  const at = bird.location;
  bird.dimension.spawnParticle(`${NS}:crumbs_${item.replace("minecraft:", "")}`, { x: at.x, y: at.y + bird.getAABB().extent.y * 2 * 0.6, z: at.z });
}

function shake(bird: Entity) {
  countOf(bird).refusals++;
  bird.setProperty(SHAKING, true);
  const id = bird.id;
  shaking.set(id, system.currentTick + SHAKE_TICKS);
  system.runTimeout(() => {
    shaking.delete(id);
    const b = world.getEntity(id);
    try {
      if (b?.isValid) b.setProperty(SHAKING, false);
    } catch {
      /* gone with its chunk: the greeting watch turns it off when it is back */
    }
  }, SHAKE_TICKS);
}
// A world saved mid-shake (or the bird's chunk going before it ended) leaves the pose on; the
// greeting watch puts it right within half a second.
menders.push((bird) => {
  const on = shaking.has(bird.id);
  if ((bird.getProperty(SHAKING) === true) !== on) bird.setProperty(SHAKING, on);
});

/** What a food does for this bird from this feeder now. */
export function actionFor(feederId: string, bird: Entity, item: string): FoodAction | undefined {
  return foodAction(item, { tame: isTamed(bird), baby: isBaby(bird), owner: ownerIdOf(bird), treatUntil: treatUntil.get(bird.id) ?? 0, snackUntil: snackUntil.get(bird.id) ?? 0 }, feederId, system.currentTick);
}

/**
 * Does what the food does (after the use: the world can be changed). {@link byGame} is true when
 * the game's own feeding took the item and grows the chick.
 */
export function eat(feeder: Feeder, bird: Entity, item: string, action: FoodAction, byGame = false) {
  const now = system.currentTick;
  if (action === "shake") return shake(bird);
  if (action === "refuse") return;
  // A bird tamed before owners were written down takes its feeder as its owner (as any use does: perch.ts).
  if (ownerIdOf(bird) === undefined) bird.setDynamicProperty(P_OWNER, feeder.id);
  if (!byGame) useOne(feeder);
  if (action === "tame") {
    if (!(feeder.player && bird.getComponent("minecraft:tameable")?.tame(feeder.player))) bird.triggerEvent("minecraft:on_tame");
    hearts(bird);
    treatUntil.set(bird.id, now + TREAT_FULL);
    countOf(bird).treats++;
    return;
  }
  heal(bird);
  if (action === "snack") {
    crumbs(bird, item);
    snackUntil.set(bird.id, now + SNACK_FULL);
    countOf(bird).snacks++;
    return;
  }
  treatUntil.set(bird.id, now + TREAT_FULL);
  countOf(bird).treats++;
  const how = enjoys(kindOf(bird));
  if (how === "bob") bob(bird);
  else if (how === "phrase") finchSings(bird);
  else sing(bird);
}

/** The whole use, as the self-test's stand-in owner makes it (no player, so nothing leaves a hand). */
export function feedFood(feeder: Feeder, bird: Entity, item: string): FoodAction | undefined {
  const action = actionFor(feeder.id, bird, item);
  if (action) eat(feeder, bird, item, action, grownByGame(action, isBaby(bird)));
  return action;
}

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const item = ev.itemStack?.typeId;
  if (!item || !isFood(item)) return;
  const bird = ev.target;
  let action: FoodAction | undefined;
  let baby = false;
  try {
    if (!bird.matches({ families: [FAMILY] })) return;
    baby = isBaby(bird);
    action = actionFor(ev.player.id, bird, item);
  } catch (e) {
    console.warn(`Little Birds: food: ${e}`);
    return;
  }
  if (!action) return;
  // A chick's treat or snack goes on to the game, which takes the item and grows it; everything
  // else is the script's alone, so the game doesn't also sit the bird or feed it.
  const byGame = grownByGame(action, baby);
  if (!byGame) ev.cancel = true;
  const player = ev.player;
  system.run(() => {
    try {
      if (bird.isValid && player.isValid) eat({ id: player.id, player }, bird, item, action!, byGame);
    } catch (e) {
      console.warn(`Little Birds: food: ${e}`);
    }
  });
});

/** For the self-test: a bird's foods. */
export function debugFood(bird: Entity) {
  const c = counts.get(bird.id) ?? { treats: 0, snacks: 0, refusals: 0 };
  const t = system.currentTick;
  return {
    ...c,
    treatFull: Math.max(0, (treatUntil.get(bird.id) ?? 0) - t),
    snackFull: Math.max(0, (snackUntil.get(bird.id) ?? 0) - t),
    shaking: bird.getProperty(SHAKING) === true,
    health: bird.getComponent("minecraft:health")?.currentValue ?? -1,
  };
}

/** For the self-test: the bird is no longer full of anything. */
export function hungryAgain(bird: Entity) {
  treatUntil.delete(bird.id);
  snackUntil.delete(bird.id);
}
