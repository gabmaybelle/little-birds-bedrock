// The rules for the settings (the Java edition's Settings and LittleBird.checkSpawnRules), with no
// game objects, so the unit tests run them. settings.ts applies them.

/** Java's defaults: wild birds spawn, at the full rate. */
export const DEFAULT_NATURAL_SPAWNING = true;
export const DEFAULT_SPAWN_CHANCE = 100;

/**
 * Whether a wild bird appears where the game picked a natural spawn (LittleBird.checkSpawnRules):
 * only while natural spawning is on, and at the spawn chance, out of 100 ({@link roll} is 0 to 99).
 * Spawn eggs, commands and chicks don't come through here.
 */
export const naturalSpawnStays = (naturalSpawning: boolean, spawnChance: number, roll: number) => naturalSpawning && roll < spawnChance;

/** A spawn chance from the form or a saved value: a whole number from 0 to 100 (Settings.clamp; 100 if it isn't one). */
export function clampChance(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^[+-]?\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_SPAWN_CHANCE;
  return Math.max(0, Math.min(100, Math.trunc(n)));
}
