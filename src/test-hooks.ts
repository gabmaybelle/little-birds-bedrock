// Hooks for the self-test pack (test/main.ts), which runs on a dedicated server with no player and
// can't read this pack's saved values. Each is a /scriptevent, so it needs cheats, and none of them
// does anything a player could notice in a world without the self-test:
//
//   little_birds:debug own <bird id> <owner id>          record a bird's owner
//   little_birds:debug stand_in <owner id> <x> <y> <z>   an owner "standing" there (overworld)
//   little_birds:debug stand_in <owner id> none          that owner gone (offline)
//   little_birds:debug perch_added <x> <y> <z>           a perch placed by command (overworld)
//   little_birds:debug use <owner id> <x> <y> <z> [sneak] [face]
//                                                        that owner uses the block with an empty hand
//   little_birds:debug state <bird id>                   replies with what this pack knows of the bird
//
// Replies come back as /scriptevent little_birds:debug_reply <json>.
import { world, system, Direction } from "@minecraft/server";
import { NS, addPerch, blockUse, debugState, ownerIdOf, perchList, standIns } from "./perch.js";

const reply = (o: object) => system.sendScriptEvent(`${NS}:debug_reply`, JSON.stringify(o));
const overworld = () => world.getDimension("minecraft:overworld");

function run(message: string) {
  const [cmd, ...a] = message.trim().split(/\s+/);
  if (cmd === "own") {
    world.getEntity(a[0])?.setDynamicProperty(`${NS}:owner`, a[1]);
  } else if (cmd === "stand_in") {
    if (a[1] === "none") standIns.delete(a[0]);
    else standIns.set(a[0], { dimensionId: "minecraft:overworld", location: { x: +a[1], y: +a[2], z: +a[3] } });
  } else if (cmd === "perch_added") {
    addPerch(overworld(), { x: +a[0], y: +a[1], z: +a[2] });
  } else if (cmd === "use") {
    const [ownerId, x, y, z] = a;
    const sneak = a.includes("sneak");
    const face = (a.find((s) => Object.values(Direction).includes(s as Direction)) as Direction | undefined) ?? Direction.Up;
    const at = standIns.get(ownerId)?.location ?? { x: +x + 0.5, y: +y, z: +z + 2.5 };
    const block = overworld().getBlock({ x: +x, y: +y, z: +z });
    const act = block && blockUse({ id: ownerId, dimension: overworld(), location: at, sneaking: sneak, emptyHand: true }, block, face);
    if (act) act();
    reply({ cmd: "use", acted: !!act });
  } else if (cmd === "state") {
    const bird = world.getEntity(a[0]);
    reply({
      cmd: "state",
      id: a[0],
      valid: !!bird?.isValid,
      mode: bird?.getDynamicProperty(`${NS}:mode`) ?? "free",
      perch: bird?.getDynamicProperty(`${NS}:perch`) ?? null,
      owner: bird ? ownerIdOf(bird) ?? null : null,
      active: debugState(a[0]),
      perches: perchList().length,
    });
  }
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== `${NS}:debug`) return;
  try {
    run(ev.message);
  } catch (e) {
    console.warn(`Little Birds: debug ${ev.message}: ${e}`);
  }
});
