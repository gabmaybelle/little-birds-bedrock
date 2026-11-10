// The rules for the birds' foods (the Java edition's Foods and the food parts of LittleBird), with no
// game objects, so the unit tests run them. foods.ts applies them.
//
// - The millet spray is the one treat. A wild bird is tamed by it on the first try. A tamed bird's
//   owner gets a happy bob for it (a canary or a finch sings instead), a little health back, and a
//   chick grows a little. A treat is not a meal: for half a minute after one the bird takes no other,
//   and the spray stays in the hand. Millet in a hand nearby also tempts the birds to follow it (the
//   entity's tempt goal).
// - Snacks from the farm (carrot, apple, melon slice, sweet and glow berries, beetroot): a tamed bird
//   nibbles one from its owner, crumbs fly, it heals a little and a chick grows a little; then it has
//   had enough for five seconds. Anyone else's snack, or a snack for a wild bird, is not taken.
// - Refused (cocoa beans, a poisonous potato): any bird shakes its head and takes nothing.
//
// The seeds that tame and breed are breeding.ts's and the entity's own; they are not foods here.

/** The treat (Foods.MILLET_SPRAY). */
export const MILLET = "little_birds:millet_spray";
/** #little_birds:snacks, in its order. */
export const SNACKS = ["minecraft:carrot", "minecraft:apple", "minecraft:melon_slice", "minecraft:sweet_berries", "minecraft:glow_berries", "minecraft:beetroot"];
/** #little_birds:refused. */
export const REFUSED = ["minecraft:cocoa_beans", "minecraft:poisonous_potato"];

/** How long a bird is full after a treat, and after a snack, in ticks (Foods.TREAT_FULL, SNACK_FULL). */
export const TREAT_FULL = 600;
export const SNACK_FULL = 100;
/** How long the head shake lasts, in ticks (LittleBird: shakeTicks = 20). */
export const SHAKE_TICKS = 20;
/** How much health a treat or a snack gives back (heal(1.0F)). */
export const HEAL = 1;

export const isTreat = (item: string) => item === MILLET;
export const isSnack = (item: string) => SNACKS.includes(item);
export const isRefused = (item: string) => REFUSED.includes(item);
export const isFood = (item: string) => isTreat(item) || isSnack(item) || isRefused(item);

/** What the feeder can see of the bird. */
export interface Eater {
  tame: boolean;
  baby: boolean;
  /** Its owner on record (undefined for a bird tamed before owners were written down: anyone's). */
  owner?: string;
  /** Full of a treat until this tick, and of a snack (0 when not). */
  treatUntil: number;
  snackUntil: number;
}

/**
 * What happens when a player uses a food on a bird (LittleBird.mobInteract, takeTreat, takeSnack):
 * - "shake": a refused food; the head shake, nothing taken.
 * - "tame": the millet spray for a wild bird; tamed to the feeder on the first try, the spray eaten.
 * - "treat" / "snack": eaten by a tamed bird of the feeder's; health back, full for a while, and for
 *   a treat a bob or a song.
 * - "refuse": nothing happens and the food stays in the hand (someone else's bird, a full bird, a
 *   snack for a wild bird). The use is still used up, as on Java, so the bird doesn't sit for it.
 * - undefined: not a food of the birds; the use goes on as usual.
 */
export type FoodAction = "shake" | "tame" | "treat" | "snack" | "refuse";

export function foodAction(item: string, bird: Eater, feederId: string, now: number): FoodAction | undefined {
  if (isRefused(item)) return "shake";
  const owned = bird.owner === undefined || bird.owner === feederId;
  if (isTreat(item)) {
    if (!bird.tame) return "tame";
    return owned && bird.treatUntil <= now ? "treat" : "refuse";
  }
  if (isSnack(item)) {
    if (!bird.tame || !owned) return "refuse";
    return bird.snackUntil <= now ? "snack" : "refuse";
  }
  return undefined;
}

/**
 * Whether the game's own feeding does the growing: a chick eating a treat or a snack grows a little
 * (Java's ageUp by a tenth of the time left), and on Bedrock only the entity's ageable component can
 * change a chick's age, so the food goes to it (it takes the item) and the script does the rest.
 */
export const grownByGame = (action: FoodAction, baby: boolean) => baby && (action === "treat" || action === "snack");

/** Health after a treat or a snack (heal: never above the most it can have). */
export const healed = (current: number, max: number) => Math.min(max, current + HEAL);

/** What a tamed bird does for a treat (LittleBird.enjoyTreat): a happy bob; a song bird sings instead. */
export function enjoys(kind: string): "bob" | "song" | "phrase" {
  if (kind === "canary") return "song";
  if (kind === "zebra_finch") return "phrase";
  return "bob";
}
