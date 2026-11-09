// Little Birds for Bedrock: the behaviour pack's script.
//
// The birds themselves (colours, taming, sitting, following, flying, sounds, wild spawns) are the
// entity files and need no script. The script grows with the features the JSON can't do: the
// perch as a home, the shoulder, the greeting, pairs and songs, treats and the settings form.
import { system } from "@minecraft/server";

export const VERSION = "0.1.0";

system.run(() => {
  console.log(`Little Birds ${VERSION}: script loaded`);
});
