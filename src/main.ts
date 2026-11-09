// Little Birds for Bedrock: the behaviour pack's script.
//
// The birds themselves (colours, taming, sitting, following, flying, sounds, wild spawns) are the
// entity files and need no script. The script does what the JSON can't: the perch as a home
// (perch.ts, its rules in perch-logic.ts); the shoulder, the greeting, pairs and songs, treats and
// the settings form come in later.
import { system } from "@minecraft/server";
import "./perch.js";
import "./test-hooks.js";

export const VERSION = "0.1.0";

system.run(() => {
  console.log(`Little Birds ${VERSION}: script loaded`);
});
