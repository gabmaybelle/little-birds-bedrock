// Little Birds for Bedrock: the behaviour pack's script.
//
// The birds themselves (colours, taming, sitting, following, flying, sounds, wild spawns) are the
// entity files and need no script. The script does what the JSON can't: the perch as a home
// (perch.ts), dusk (sky.ts), the shoulder (shoulder.ts), the greeting (greeting.ts), lovebird pairs
// (pairs.ts), the songs (songs.ts) and breeding and chicks (breeding.ts), each with its rules
// in a *-logic.ts file the unit tests run; treats and the settings form come in later.
import { system } from "@minecraft/server";
import "./perch.js";
import "./shoulder.js";
import "./greeting.js";
import "./pairs.js";
import "./songs.js";
import "./breeding.js";
import "./test-hooks.js";

export const VERSION = "0.1.0";

system.run(() => {
  console.log(`Little Birds ${VERSION}: script loaded`);
});
