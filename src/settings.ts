// The settings: the Java edition's Settings (its config file's natural_spawning and spawn_chance) as
// a form, since a Bedrock add-on has no config file. An operator types /little_birds:settings and a
// form opens with both; the values are kept on the world, so they travel with it, and take effect at
// once (Java reads its file at start-up).
//
// - Wild birds spawn: whether wild birds appear on their own at all. Spawn eggs, commands and chicks
//   always work.
// - Spawn chance: 0 to 100, how often a natural spawn the game picks actually happens. 100 is the
//   rate the birds' spawn rules give; lower it for rarer birds.
//
// A spawn rule's weight can't change while the game runs, so both work the way Java's spawn check
// does: a bird the game spawns naturally (its spawn rules' herd fires the spawned_wild event, which
// marks it) is looked at as it appears and taken away again unless the settings let it stay.
import { world, system, Entity, EntityInitializationCause, Player, CommandPermissionLevel, CustomCommandStatus, CustomCommandOrigin } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { NS } from "./perch.js";
import { DEFAULT_NATURAL_SPAWNING, DEFAULT_SPAWN_CHANCE, clampChance, naturalSpawnStays } from "./settings-logic.js";

const P_NATURAL_SPAWNING = `${NS}:natural_spawning`;
const P_SPAWN_CHANCE = `${NS}:spawn_chance`;
/** Set by the spawn rules' event on a bird the game spawned on its own. */
const NATURAL = `${NS}:natural_spawn`;
const FAMILY = "little_bird";

export interface Settings {
  naturalSpawning: boolean;
  spawnChance: number;
}

/** The settings kept on the world, or Java's defaults (on, 100). */
export function settings(): Settings {
  const on = world.getDynamicProperty(P_NATURAL_SPAWNING);
  return { naturalSpawning: on === undefined ? DEFAULT_NATURAL_SPAWNING : on === true, spawnChance: clampChance(world.getDynamicProperty(P_SPAWN_CHANCE) ?? DEFAULT_SPAWN_CHANCE) };
}

export function saveSettings(s: Settings) {
  world.setDynamicProperty(P_NATURAL_SPAWNING, s.naturalSpawning);
  world.setDynamicProperty(P_SPAWN_CHANCE, clampChance(s.spawnChance));
}

/** How many natural spawns were let stay and taken away since the script loaded (for the self-test). */
export const spawnCounts = { kept: 0, removed: 0 };

/** A bird just spawned: if the game spawned it on its own, it stays only if the settings let it. */
export function checkNaturalSpawn(bird: Entity) {
  if (bird.getProperty(NATURAL) !== true) return;
  bird.setProperty(NATURAL, false);
  const s = settings();
  if (naturalSpawnStays(s.naturalSpawning, s.spawnChance, Math.floor(Math.random() * 100))) {
    spawnCounts.kept++;
    return;
  }
  spawnCounts.removed++;
  bird.remove();
}

// The game reports natural spawns, eggs, commands and script spawns all as "Spawned" (a spawn with
// an event as "Event"), so the mark tells them apart. The herd's event that sets it can come after
// this event, so a bird without it yet is looked at again a tick later, by its id. A bird loading
// from the save was looked at when it first appeared.
world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  if (cause === EntityInitializationCause.Loaded || !entity.typeId.startsWith(`${NS}:`)) return;
  const id = entity.id;
  const check = () => {
    try {
      const bird = world.getEntity(id);
      if (bird?.isValid && bird.matches({ families: [FAMILY] })) checkNaturalSpawn(bird);
    } catch (e) {
      console.warn(`Little Birds: spawn check: ${e}`);
    }
  };
  check();
  system.runTimeout(check, 1);
});

/** The form, for a player; saves what they choose. */
export async function openSettings(player: Player) {
  const s = settings();
  const form = new ModalFormData()
    .title("Little Birds")
    .toggle("Wild birds spawn", { defaultValue: s.naturalSpawning, tooltip: "Whether wild birds appear in the world on their own. Spawn eggs always work." })
    .slider("Spawn chance (%)", 0, 100, { defaultValue: s.spawnChance, valueStep: 1, tooltip: "How often a natural spawn actually happens. 100 is the usual rate; lower it for rarer birds." })
    .submitButton("Save");
  const r = await form.show(player);
  if (r.canceled || !r.formValues) return;
  const on = r.formValues.find((v) => typeof v === "boolean");
  const chance = r.formValues.find((v) => typeof v === "number");
  saveSettings({ naturalSpawning: on === undefined ? s.naturalSpawning : on === true, spawnChance: chance === undefined ? s.spawnChance : (chance as number) });
}

/** What the command does: the form for a player in the game; a reply for anything else (a console, a command block). */
export function settingsCommand(origin: CustomCommandOrigin) {
  const player = origin.sourceEntity ?? origin.initiator;
  if (!(player instanceof Player)) {
    const s = settings();
    return { status: CustomCommandStatus.Failure, message: `Little Birds: open this as a player in the game. Now: wild birds ${s.naturalSpawning ? "spawn" : "don't spawn"}, spawn chance ${s.spawnChance}.` };
  }
  system.run(() => {
    openSettings(player).catch((e) => console.warn(`Little Birds: settings form: ${e}`));
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: `${NS}:settings`, description: "Little Birds settings: wild bird spawning and spawn chance.", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => settingsCommand(origin),
  );
});
