// Lovebird pairs: the Java edition's Lovebird.PairUpGoal and the partner it keeps, on Bedrock. The
// rules are in pair-logic.ts.
//
// Two grown lovebirds without partners that come within 8 blocks of each other pair for good. A
// pair keeps together (the entity's follow goal flies one back to the other), may call the same
// perch home and sits on it side by side (perch.ts), and breeds only with its partner (breeding.ts).
// A partner's death ends the pair.
//
// The follow goal can't read a partner's id, so each pair also carries a slot
// number (the lovebird's pair property), one no pair nearby has; the follow goal follows only a
// lovebird with the same slot. Finch company needs no script: a finch follows the nearest finch.
import { world, system, Entity } from "@minecraft/server";
import { NS, P_PARTNER } from "./perch.js";
import { Lovebird, PAIR_TRY_PER_SECOND, chooseSlot, findMate, slotClashes } from "./pair-logic.js";

const LOVEBIRD = `${NS}:lovebird`;
const PAIR = `${NS}:pair`;

const partnerOf = (bird: Entity) => bird.getDynamicProperty(P_PARTNER) as string | undefined;
const slotOf = (bird: Entity) => (bird.getProperty(PAIR) as number | undefined) ?? 0;
const isBaby = (bird: Entity) => bird.getComponent("minecraft:is_baby") !== undefined;
const info = (bird: Entity): Lovebird => ({ id: bird.id, location: bird.location, partner: partnerOf(bird), slot: slotOf(bird), baby: isBaby(bird) });

/** What the pass costs, in milliseconds (the self-test's budget reads it). */
export const pairPerf = { runs: 0, ms: 0, max: 0 };

/** Makes two lovebirds a pair, both ways, with a slot no pair near them has. */
export function pairUp(a: Entity, b: Entity, others: Lovebird[]): number {
  const slot = chooseSlot(a.location, others.filter((o) => o.id !== a.id && o.id !== b.id));
  a.setDynamicProperty(P_PARTNER, b.id);
  b.setDynamicProperty(P_PARTNER, a.id);
  a.setProperty(PAIR, slot);
  b.setProperty(PAIR, slot);
  return slot;
}

/** The pair is over for this bird: no partner, no slot. */
function single(bird: Entity) {
  bird.setDynamicProperty(P_PARTNER, undefined);
  if (slotOf(bird) !== 0) bird.setProperty(PAIR, 0);
}

function pass() {
  for (const id of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    let birds: Entity[];
    try {
      birds = world.getDimension(id).getEntities({ type: LOVEBIRD });
    } catch {
      continue;
    }
    if (birds.length === 0) continue;
    const infos = birds.map(info);
    const byId = new Map(birds.map((b) => [b.id, b] as [string, Entity]));
    birds.forEach((bird, i) => {
      try {
        const me = infos[i];
        if (me.partner !== undefined) {
          const partner = byId.get(me.partner);
          if (partner && !partner.isValid) return;
          const pi = infos.find((o) => o.id === me.partner);
          // Its partner here: the two carry the same slot, and one no pair near them has.
          if (partner && pi && me.slot !== pi.slot) {
            const slot = chooseSlot(me.location, infos.filter((o) => o.id !== me.id && o.id !== me.partner));
            bird.setProperty(PAIR, slot);
            partner.setProperty(PAIR, slot);
            me.slot = slot;
            if (pi) pi.slot = slot;
          } else if (me.slot === 0 || slotClashes(me, infos)) {
            const slot = chooseSlot(me.location, infos.filter((o) => o.id !== me.id && o.id !== me.partner));
            bird.setProperty(PAIR, slot);
            me.slot = slot;
            if (pi) pi.slot = slot;
            if (partner) partner.setProperty(PAIR, slot);
          }
          return;
        }
        if (me.slot !== 0) bird.setProperty(PAIR, 0);
        if (me.baby || Math.random() >= PAIR_TRY_PER_SECOND) return;
        const mate = findMate(me, infos);
        if (!mate) return;
        const slot = pairUp(bird, byId.get(mate.id)!, infos);
        // Both are taken now, for the rest of this pass.
        me.partner = mate.id;
        mate.partner = me.id;
        me.slot = mate.slot = slot;
      } catch (e) {
        console.warn(`Little Birds: pairs: ${e}`);
      }
    });
  }
}

system.runInterval(() => {
  const t = Date.now();
  pass();
  const ms = Date.now() - t;
  pairPerf.runs++;
  pairPerf.ms += ms;
  if (ms > pairPerf.max) pairPerf.max = ms;
}, 20);

/** A lovebird has died: its partner, wherever it is loaded, is on its own again (Lovebird.getPartner). */
export function partnerDied(deadId: string) {
  for (const id of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    for (const bird of world.getDimension(id).getEntities({ type: LOVEBIRD })) {
      if (partnerOf(bird) === deadId) single(bird);
    }
  }
}

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity.typeId !== LOVEBIRD) return;
  const id = deadEntity.id;
  system.run(() => {
    try {
      partnerDied(id);
    } catch (e) {
      console.warn(`Little Birds: pairs: ${e}`);
    }
  });
});

/** For the self-test: a lovebird's partner and slot. */
export function debugPair(bird: Entity) {
  return { partner: partnerOf(bird) ?? null, slot: bird.typeId === LOVEBIRD ? slotOf(bird) : null };
}
