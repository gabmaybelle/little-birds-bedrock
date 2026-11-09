// Breeding and chicks: vanilla's Animal and BreedGoal with the Java edition's LittleBird and Lovebird
// rules, on Bedrock. The rules are in breed-logic.ts (why the game's own breeding isn't used is there).
//
// Seeds from its owner make a tamed grown bird fall in love for 30 seconds, with hearts; a lovebird
// only once it has a partner. Two birds of a kind in love within 8 blocks come together (a lovebird
// only to its partner) and, after 3 seconds within 3 blocks, a chick appears beside them: half size,
// tamed to the same owner, in one parent's colour. Both parents then rest 5 minutes. Getting hurt ends
// love. A chick grows up in twenty minutes; seeds hurry it (the entity's own ageable component).
import { world, system, Entity, Player, GameMode, ItemStack } from "@minecraft/server";
import { NS, P_OWNER, P_PARTNER, ownerIdOf } from "./perch.js";
import { Breeder, HEARTS_EVERY, LOVE_TICKS, COOLDOWN_TICKS, breedsNow, chickOf, courtStep, fallsInLove, findMate, inLove } from "./breed-logic.js";

const FAMILY = "little_bird";
const COLOUR = `${NS}:colour`;
/** The absolute tick a bird can fall in love again (Java keeps this as the grown bird's age). */
const P_READY_AT = `${NS}:breed_ready_at`;
/** The seeds that tame and breed the birds (the entity's tame and chick feed items). */
export const SEEDS = ["minecraft:wheat_seeds", "minecraft:pumpkin_seeds", "minecraft:melon_seeds", "minecraft:beetroot_seeds", "minecraft:pitcher_pod", "minecraft:torchflower_seeds"];

const kindOf = (bird: Entity) => bird.typeId.slice(NS.length + 1);
const isTamed = (bird: Entity) => bird.getComponent("minecraft:is_tamed") !== undefined;
const isBaby = (bird: Entity) => bird.getComponent("minecraft:is_baby") !== undefined;
const boolProp = (bird: Entity, name: string) => bird.getProperty(`${NS}:${name}`) === true;
const now = () => world.getAbsoluteTime();
const voicePitch = () => (Math.random() - Math.random()) * 0.1 + 1.0;

/** Birds in love, and the absolute tick it ends. */
const love = new Map<string, number>();
/** Courting pairs, both ways: the mate and how long they have courted. */
const courting = new Map<string, { mate: string; ticks: number }>();
/** How many chicks have hatched since the script loaded (for the self-test). */
export let chicksBred = 0;

function breeder(bird: Entity): Breeder {
  const ready = bird.getDynamicProperty(P_READY_AT);
  return {
    id: bird.id,
    kind: kindOf(bird),
    location: bird.location,
    tame: isTamed(bird),
    baby: isBaby(bird),
    partner: bird.getDynamicProperty(P_PARTNER) as string | undefined,
    loveUntil: love.get(bird.id) ?? 0,
    readyAt: typeof ready === "number" ? ready : 0,
  };
}

function hearts(bird: Entity, count: number) {
  const h = bird.getAABB().extent;
  for (let i = 0; i < count; i++) {
    const at = bird.location;
    bird.dimension.spawnParticle("minecraft:heart_particle", {
      x: at.x + (Math.random() - 0.5) * h.x * 2,
      y: at.y + Math.random() * h.y * 2 + 0.5,
      z: at.z + (Math.random() - 0.5) * h.z * 2,
    });
  }
}

/** Who feeds: a real player, or the self-test's stand-in (an id only). */
export interface Feeder {
  id: string;
  player?: Player;
}

/** Seeds for a tamed grown bird (Animal.mobInteract): in love, one seed eaten, hearts. Whether it fell in love. */
export function feed(feeder: Feeder, bird: Entity): boolean {
  if (!fallsInLove(breeder(bird), now(), ownerIdOf(bird), feeder.id)) return false;
  love.set(bird.id, now() + LOVE_TICKS);
  const p = feeder.player;
  if (p && p.getGameMode() !== GameMode.Creative) {
    const inv = p.getComponent("minecraft:inventory")?.container;
    const slot = p.selectedSlotIndex;
    const stack = inv?.getItem(slot);
    if (inv && stack) inv.setItem(slot, stack.amount > 1 ? new ItemStack(stack.typeId, stack.amount - 1) : undefined);
  }
  bird.dimension.playSound("mob.parrot.eat", bird.location, { pitch: voicePitch() });
  hearts(bird, 7);
  return true;
}

// Seeds on a tamed grown bird are for breeding, here, never the game's own use of the bird (which
// would make it sit). On a chick they go to the game: its ageable component grows it a little.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const item = ev.itemStack?.typeId;
  if (!item || !SEEDS.includes(item)) return;
  const bird = ev.target;
  try {
    if (!bird.matches({ families: [FAMILY] }) || !isTamed(bird) || isBaby(bird)) return;
  } catch {
    return;
  }
  ev.cancel = true;
  const player = ev.player;
  system.run(() => {
    try {
      if (bird.isValid && player.isValid) feed({ id: player.id, player }, bird);
    } catch (e) {
      console.warn(`Little Birds: breeding: ${e}`);
    }
  });
});

world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => {
  if (!love.has(hurtEntity.id)) return;
  love.delete(hurtEntity.id);
  endCourting(hurtEntity.id);
});

function endCourting(id: string) {
  const c = courting.get(id);
  courting.delete(id);
  if (c) courting.delete(c.mate);
}

/** Whether a courting bird may be moved toward its mate: free, not on a perch, a shoulder or sitting. */
const free = (bird: Entity) => !boolProp(bird, "perched") && !boolProp(bird, "shoulder") && !boolProp(bird, "sitting") && (bird.getDynamicProperty(`${NS}:mode`) ?? "free") === "free";

/** The chick, beside the parent that bred it (Animal.spawnChildFromBreeding, LittleBird.getBreedOffspring). */
export function hatch(a: Entity, b: Entity): Entity | undefined {
  const pa = { colour: (a.getProperty(COLOUR) as number) ?? 0, owner: ownerIdOf(a) };
  const pb = { colour: (b.getProperty(COLOUR) as number) ?? 0, owner: ownerIdOf(b) };
  const { colour, owner } = chickOf(pa, pb, Math.random() < 0.5 ? 0 : 1);
  const chick = a.dimension.spawnEntity(a.typeId as never, a.location, { spawnEvent: `${NS}:born` });
  chick.setProperty(COLOUR, colour);
  const player = owner === undefined ? undefined : world.getAllPlayers().find((p) => p.id === owner);
  // Tamed to its owner, so it follows them like its parents; with its owner away, tamed all the same.
  if (!(player && chick.getComponent("minecraft:tameable")?.tame(player))) chick.triggerEvent("minecraft:on_tame");
  if (owner !== undefined) chick.setDynamicProperty(P_OWNER, owner);
  const t = now();
  for (const parent of [a, b]) {
    parent.setDynamicProperty(P_READY_AT, t + COOLDOWN_TICKS);
    love.delete(parent.id);
    courting.delete(parent.id);
  }
  hearts(a, 7);
  chicksBred++;
  return chick;
}

function tick() {
  if (love.size === 0) return;
  const t = now();
  const birds: Entity[] = [];
  for (const [id, until] of love) {
    const bird = world.getEntity(id);
    if (!bird?.isValid || until <= t) {
      love.delete(id);
      endCourting(id);
      continue;
    }
    birds.push(bird);
    if ((until - t) % HEARTS_EVERY === 0) hearts(bird, 1);
  }
  const byId = new Map(birds.map((b) => [b.id, b] as [string, Entity]));
  const infos = birds.map(breeder);
  for (const bird of birds) {
    if (!love.has(bird.id)) continue; // bred earlier in this tick
    let c = courting.get(bird.id);
    let mate = c ? byId.get(c.mate) : undefined;
    if (!c || !mate || mate.dimension.id !== bird.dimension.id) {
      endCourting(bird.id);
      // Looks for a mate every half second, as a goal that starts now and then.
      if (system.currentTick % 10 !== 0) continue;
      const me = infos.find((i) => i.id === bird.id)!;
      const found = findMate(me, infos.filter((i) => byId.get(i.id)!.dimension.id === bird.dimension.id && !courting.has(i.id)), t);
      if (!found) continue;
      mate = byId.get(found.id)!;
      c = { mate: mate.id, ticks: 0 };
      courting.set(bird.id, c);
      courting.set(mate.id, { mate: bird.id, ticks: 0 });
    }
    c.ticks++;
    if (free(bird)) {
      const to = courtStep(bird.location, mate.location);
      if (to !== bird.location) {
        const d = { x: mate.location.x - bird.location.x, z: mate.location.z - bird.location.z };
        bird.teleport(to, { rotation: { x: 0, y: (Math.atan2(-d.x, d.z) * 180) / Math.PI } });
      }
    }
    if (breedsNow(c.ticks, bird.location, mate.location)) hatch(bird, mate);
  }
}

system.runInterval(() => {
  try {
    tick();
  } catch (e) {
    console.warn(`Little Birds: breeding: ${e}`);
  }
}, 1);

/** For the self-test: a bird's love and rest, in ticks from now. */
export function debugBreeding(bird: Entity) {
  const b = breeder(bird), t = now();
  return { inLove: inLove(b, t), loveLeft: Math.max(0, b.loveUntil - t), restLeft: Math.max(0, b.readyAt - t), courting: courting.get(bird.id)?.mate ?? null, chicksBred };
}
