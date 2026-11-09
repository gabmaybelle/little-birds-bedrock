// The day clock's rules, with no game objects in them, so the unit tests can run them in Node: when
// it is dark outside (dusk, when the birds go home and quiet down) and when a bird greets its owner.
// Each mirrors the Java edition (the game's Level.isDarkOutside, LittleBird.watchForOwner);
// src/greeting.ts and src/perch.ts apply them to the world.

export interface Vec {
  x: number;
  y: number;
  z: number;
}
const distSq = (a: Vec, b: Vec): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

export type Weather = "clear" | "rain" | "thunder";

// ---------------------------------------------------------------- dusk (Level.isDarkOutside)

/**
 * How much of the full sky light each hour of the day lets through: the overworld timeline's sky
 * light keyframes (full until 11867, down to 4/15 by 13670, back up from 22330 to full at 133),
 * straight lines between them, round the 24000-tick day.
 */
const SKY_KEYS: [number, number][] = [
  [133, 1],
  [11867, 1],
  [13670, 4 / 15],
  [22330, 4 / 15],
];
/** Rain and a thunderstorm pull the sky light this far towards 4 (WeatherAttributes). */
export const RAIN_DARKEN = 0.3125;
export const THUNDER_DARKEN = 0.52734375;

/** The sky light level (0 to 15) at this time of day, in this weather. */
export function skyLight(timeOfDay: number, weather: Weather = "clear"): number {
  const t = ((timeOfDay % 24000) + 24000) % 24000;
  let factor = SKY_KEYS[0][1];
  for (let i = 0; i < SKY_KEYS.length; i++) {
    const [t0, v0] = SKY_KEYS[i];
    const [t1raw, v1] = SKY_KEYS[(i + 1) % SKY_KEYS.length];
    const t1 = t1raw > t0 ? t1raw : t1raw + 24000;
    const tt = t >= t0 ? t : t + 24000;
    if (tt >= t0 && tt < t1) {
      factor = v0 + ((tt - t0) / (t1 - t0)) * (v1 - v0);
      break;
    }
  }
  const light = 15 * factor;
  // Rain and thunder each blend towards 4; in a thunderstorm only the thunder counts.
  if (weather === "rain") return light + RAIN_DARKEN * (4 - light);
  if (weather === "thunder") return light + THUNDER_DARKEN * (4 - light);
  return light;
}

/**
 * Whether it is dark outside, as the Java edition counts it: the sky light is down by 4 or more.
 * In clear weather that is from about 12523 to 23477; rain brings dusk on at about 12000; a
 * thunderstorm is dark all day.
 */
export function isDark(timeOfDay: number, weather: Weather = "clear"): boolean {
  return Math.trunc(15 - skyLight(timeOfDay, weather)) >= 4;
}

// ---------------------------------------------------------------- the greeting (LittleBird.watchForOwner)

/** How near its owner has to come to count as home (LittleBird.GREETING_REACH). */
export const GREETING_REACH = 8;
/** How long its owner has to have been away to earn a greeting: an hour of the day clock (LittleBird.GREETING_AFTER). */
export const GREETING_AFTER = 1000;
/** How often a bird looks for its owner, in ticks (Java: every 10). */
export const WATCH_EVERY = 10;

/**
 * The day clock: whole days and the time of day, so it runs on across midnight and a time command
 * moves it (Java's overworld clock; the game's tick count can't be moved, which is why the greeting
 * is keyed to the day clock).
 */
export function dayClock(day: number, timeOfDay: number): number {
  return day * 24000 + timeOfDay;
}

/**
 * One look for its owner. {@link lastSaw} is the day-clock time its owner was last within reach
 * (-1 before it has an owner); {@link owner} is where its owner is, undefined if not in this world.
 * A bird on its owner's shoulder is never away. Returns the time to keep, and whether to say hello:
 * once, when its owner comes back within reach after an hour or more away.
 */
export function watchForOwner(s: { lastSaw: number; now: number; bird: Vec; owner: Vec | undefined; onShoulder: boolean }): { lastSaw: number; greet: boolean } {
  const near = s.owner !== undefined && (s.onShoulder || distSq(s.bird, s.owner) <= GREETING_REACH * GREETING_REACH);
  if (!near) {
    // The clock turned back (a time command): start counting again from now.
    return { lastSaw: s.lastSaw > s.now ? s.now : s.lastSaw, greet: false };
  }
  return { lastSaw: s.now, greet: s.lastSaw >= 0 && s.now - s.lastSaw >= GREETING_AFTER };
}

/** How long the greeting pose runs, in ticks (LittleBird.greetingTicks: a chirp; a cockatiel's whistle takes longer). */
export function greetingTicks(kind: string): number {
  return kind === "cockatiel" ? 40 : 30;
}
