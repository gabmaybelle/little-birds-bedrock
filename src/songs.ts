// The songs: the Java edition's Canary and ZebraFinch singing, on Bedrock. The rules are in
// song-logic.ts.
//
// A tamed canary sings its song once each morning, from wherever it sits. A tamed zebra finch sings
// a short phrase every 20 to 60 seconds by day, and the finches that hear it (within 8 blocks,
// tamed or wild) answer a moment later. Each song plays the bird's singing pose (its singing
// property, on for the song's length) and its song sound.
import { world, system, Entity } from "@minecraft/server";
import { NS } from "./perch.js";
import { isOnShoulder } from "./shoulder.js";
import { darkOutside, now } from "./sky.js";
import { inReach } from "./pair-logic.js";
import { FINCH_STEP, FinchVoice, HEARING, SONG_TICKS, Singer, canarySings, finchCanSing, hear, newVoice, sang, step } from "./song-logic.js";

const CANARY = `${NS}:canary`;
const FINCH = `${NS}:zebra_finch`;
const SINGING = `${NS}:singing`;
/** The day it last sang its morning song on (Java saves it as LastSongDay). */
const P_LAST_SONG_DAY = `${NS}:last_song_day`;
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const kindOf = (bird: Entity) => bird.typeId.slice(NS.length + 1);
const voicePitch = () => (Math.random() - Math.random()) * 0.1 + 1.0;
const boolProp = (bird: Entity, name: string) => bird.getProperty(`${NS}:${name}`) === true;

function singer(bird: Entity): Singer {
  const perched = boolProp(bird, "perched");
  return {
    tame: bird.getComponent("minecraft:is_tamed") !== undefined,
    baby: bird.getComponent("minecraft:is_baby") !== undefined,
    flying: !perched && !bird.isOnGround,
    roosting: boolProp(bird, "roosting"),
    onShoulder: isOnShoulder(bird),
  };
}

/** Birds singing now, and the tick each one's pose ends. */
const singing = new Map<string, number>();
/** How many songs each bird has sung since the script loaded (for the self-test, as Java's counter). */
export const songs = new Map<string, number>();
/** What the two watches cost, in milliseconds (the self-test's budget reads it). */
export const songPerf = { runs: 0, ms: 0, max: 0 };

/** Sings its song: heard around it, with the singing pose (LittleBird.sing). */
export function sing(bird: Entity) {
  const kind = kindOf(bird), ticks = SONG_TICKS[kind];
  if (ticks === undefined) return;
  songs.set(bird.id, (songs.get(bird.id) ?? 0) + 1);
  bird.dimension.playSound(`${NS}.${kind}_song`, bird.location, { volume: 1, pitch: voicePitch() });
  bird.setProperty(SINGING, true);
  const id = bird.id;
  singing.set(id, system.currentTick + ticks);
  system.runTimeout(() => endPose(id), ticks);
}

function endPose(id: string) {
  singing.delete(id);
  const bird = world.getEntity(id);
  try {
    if (bird?.isValid) bird.setProperty(SINGING, false);
  } catch {
    /* gone with its chunk: the watch turns it off when it is back */
  }
}

/** The pose matches whether it is singing (a save mid-song leaves it on; this puts it right). */
function mendPose(bird: Entity) {
  const on = singing.has(bird.id);
  if (boolProp(bird, "singing") !== on) bird.setProperty(SINGING, on);
}

// ---------------------------------------------------------------- canaries, once a second

function canaries() {
  for (const id of DIMENSIONS) {
    let birds: Entity[];
    try {
      birds = world.getDimension(id).getEntities({ type: CANARY });
    } catch {
      continue;
    }
    if (birds.length === 0) continue;
    const clock = now();
    for (const bird of birds) {
      try {
        mendPose(bird);
        const saved = bird.getDynamicProperty(P_LAST_SONG_DAY);
        const day = canarySings(singer(bird), clock, typeof saved === "number" ? saved : -1);
        if (day === undefined) continue;
        bird.setDynamicProperty(P_LAST_SONG_DAY, day);
        sing(bird);
      } catch (e) {
        console.warn(`Little Birds: songs: ${e}`);
      }
    }
  }
}

// ---------------------------------------------------------------- finches, every few ticks

const voices = new Map<string, FinchVoice>();
const voiceOf = (bird: Entity) => voices.get(bird.id) ?? voices.set(bird.id, newVoice(system.currentTick, Math.random())).get(bird.id)!;

/**
 * A finch sings a phrase; unless it is answering, the finches within hearing answer in a moment
 * (ZebraFinch.sing). The millet spray (later) and the test hooks call this too.
 */
export function finchSings(bird: Entity, answering = false) {
  sing(bird);
  sang(voiceOf(bird), system.currentTick, Math.random());
  if (answering) return;
  for (const other of bird.dimension.getEntities({ type: FINCH, location: bird.location, maxDistance: HEARING * 2 })) {
    if (other.id === bird.id || !inReach(bird.location, other.location, HEARING)) continue;
    hear(voiceOf(other), system.currentTick, Math.random());
  }
}

function finches() {
  const seen = new Set<string>();
  for (const id of DIMENSIONS) {
    let birds: Entity[];
    try {
      birds = world.getDimension(id).getEntities({ type: FINCH });
    } catch {
      continue;
    }
    if (birds.length === 0) continue;
    const dark = darkOutside(id);
    for (const bird of birds) {
      seen.add(bird.id);
      try {
        mendPose(bird);
        const s = singer(bird);
        const what = step(voiceOf(bird), system.currentTick, s.tame, finchCanSing(s, dark));
        if (what) finchSings(bird, what === "answer");
      } catch (e) {
        console.warn(`Little Birds: songs: ${e}`);
      }
    }
  }
  // Finches no longer loaded: their voices start afresh when they are back (as Java's do on loading).
  for (const id of voices.keys()) if (!seen.has(id)) voices.delete(id);
}

function timed(fn: () => void) {
  const t = Date.now();
  fn();
  const ms = Date.now() - t;
  songPerf.runs++;
  songPerf.ms += ms;
  if (ms > songPerf.max) songPerf.max = ms;
}

system.runInterval(() => timed(canaries), 20);
system.runInterval(() => timed(finches), FINCH_STEP);

/** For the self-test: a bird's songs and voice. */
export function debugSongs(bird: Entity) {
  const v = voices.get(bird.id);
  const saved = bird.getDynamicProperty(P_LAST_SONG_DAY);
  return {
    songs: songs.get(bird.id) ?? 0,
    singingPose: boolProp(bird, "singing"),
    lastSongDay: typeof saved === "number" ? saved : -1,
    voice: v ? { nextIn: v.nextSong - system.currentTick, answerIn: v.answerAt ? v.answerAt - system.currentTick : 0, due: v.dueUntil !== 0 } : null,
  };
}

/** For the self-test: its next phrase falls due now. */
export function songDueNow(bird: Entity) {
  voiceOf(bird).nextSong = system.currentTick;
}
