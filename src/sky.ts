// Dusk: whether it is dark outside where a bird is, the way the Java edition counts it (the rules are
// in day-logic.ts). The Nether and the End have no day, so it is never dark outside there, as on Java.
//
// The script API can't ask what the weather is, only hear it change, so the last change heard is
// kept on the world; a world that hasn't changed its weather since the pack came is taken as clear.
import { world, WeatherType } from "@minecraft/server";
import { Weather, dayClock, isDark } from "./day-logic.js";

const W_WEATHER = "little_birds:weather";
let weather: Weather | undefined;

function readWeather(): Weather {
  if (weather === undefined) {
    const saved = world.getDynamicProperty(W_WEATHER);
    weather = saved === "rain" || saved === "thunder" ? saved : "clear";
  }
  return weather;
}

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (!dimension.endsWith("overworld")) return;
  weather = newWeather === WeatherType.Thunder ? "thunder" : newWeather === WeatherType.Rain ? "rain" : "clear";
  world.setDynamicProperty(W_WEATHER, weather);
});

/** Whether it is dark outside in this dimension now: dusk to dawn, a thunderstorm, never in the Nether or the End. */
export function darkOutside(dimensionId: string): boolean {
  return dimensionId === "minecraft:overworld" && isDark(world.getTimeOfDay(), readWeather());
}

/** The day clock the greeting reads: days and the time of day, which a time command moves. */
export function now(): number {
  return dayClock(world.getDay(), world.getTimeOfDay());
}
