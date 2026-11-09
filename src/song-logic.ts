// The rules for the songs (the Java edition's Canary and ZebraFinch), with no game objects, so the
// unit tests run them. songs.ts applies them to the world.
//
// A canary sings once each morning, from sunrise through the first three hours, if it is tamed,
// grown, awake and on its feet or its seat. A tamed zebra finch sings a short phrase every 20 to 60
// seconds by day; a finch that hears one (tamed or wild) answers a moment later, so two or three
// keep up a little back-and-forth. An answer calls for no answers of its own.
//
// Java counts these down tick by tick; here each is a deadline on the tick clock, looked at every
// few ticks, which comes to the same timings.

/** The canary's morning, on the day clock (Canary.MORNING_FROM, MORNING_UNTIL). */
export const MORNING_FROM = 0;
export const MORNING_UNTIL = 3000;
/** How long each song's pose holds, in ticks (Canary.songTicks, ZebraFinch.songTicks). */
export const SONG_TICKS: Record<string, number> = { canary: 140, zebra_finch: 30 };
/** How far a finch's phrase carries to other finches (ZebraFinch.HEARING). */
export const HEARING = 8;
/** A tamed finch's wait between phrases of its own: 20 to 60 seconds (SONG_WAIT_MIN, SONG_WAIT_SPAN). */
export const SONG_WAIT_MIN = 400;
export const SONG_WAIT_SPAN = 800;
/** How soon a finch answers one it heard (ANSWER_MIN, ANSWER_SPAN), how long after a phrase it stays quiet (QUIET_AFTER). */
export const ANSWER_MIN = 20;
export const ANSWER_SPAN = 20;
export const QUIET_AFTER = 100;
/** How long an answer that is due waits for the finch to be able to sing before it is dropped (ANSWER_PATIENCE). */
export const ANSWER_PATIENCE = 100;
/** How often the finches are looked at, in ticks. */
export const FINCH_STEP = 5;

/** Whether it is the canary's morning on the day clock (Canary.isMorning). */
export function isMorning(clock: number): boolean {
  const hour = ((clock % 24000) + 24000) % 24000;
  return hour >= MORNING_FROM && hour < MORNING_UNTIL;
}

/** The day number on the day clock. */
export const dayOf = (clock: number) => Math.floor(clock / 24000);

/** What a song bird is doing: whether it is in a state to sing (awake, on its feet or its seat). */
export interface Singer {
  tame: boolean;
  baby: boolean;
  /** In the air: off the ground and not on its perch. */
  flying: boolean;
  /** Asleep on its perch. */
  roosting: boolean;
  onShoulder: boolean;
}

const awakeAndSettled = (s: Singer) => !s.baby && !s.flying && !s.roosting && !s.onShoulder;

/**
 * Whether a canary sings its morning song now (Canary.singInTheMorning): tamed, grown, awake and
 * settled, in the morning, and not already this morning. Returns the day to remember, or undefined.
 */
export function canarySings(s: Singer, clock: number, lastSongDay: number): number | undefined {
  if (!s.tame || !awakeAndSettled(s)) return undefined;
  const day = dayOf(clock);
  if (!isMorning(clock) || lastSongDay === day) return undefined;
  return day;
}

/** Whether a finch can sing now (ZebraFinch.canSing): grown, settled, awake, and not dark outside. */
export const finchCanSing = (s: Singer, dark: boolean) => awakeAndSettled(s) && !dark;

/** A finch's voice: the deadlines Java keeps as countdowns (nextSong, answerIn, answerDue, quiet). */
export interface FinchVoice {
  /** The tick of its next phrase of its own. */
  nextSong: number;
  /** The tick it answers one it heard; 0 when it isn't about to. */
  answerAt: number;
  /** The last tick an answer that has fallen due may still be sung; 0 when none is due. */
  dueUntil: number;
  /** Until this tick it won't answer (it has just sung). */
  quietUntil: number;
}

/** A finch first seen: its first phrase 20 to 60 seconds off (Java sets nextSong on its first tick). */
export function newVoice(now: number, random: number): FinchVoice {
  return { nextSong: now + SONG_WAIT_MIN + Math.floor(random * SONG_WAIT_SPAN), answerAt: 0, dueUntil: 0, quietUntil: 0 };
}

/** After any phrase: quiet for a while, its next one 20 to 60 seconds off (ZebraFinch.sing). */
export function sang(v: FinchVoice, now: number, random: number) {
  v.quietUntil = now + QUIET_AFTER;
  v.nextSong = now + SONG_WAIT_MIN + Math.floor(random * SONG_WAIT_SPAN);
}

/** A finch hears another's phrase: unless quiet or already about to answer, it answers in 1 to 2 seconds. */
export function hear(v: FinchVoice, now: number, random: number): boolean {
  if (now < v.quietUntil || v.answerAt !== 0 || v.dueUntil !== 0) return false;
  v.answerAt = now + ANSWER_MIN + Math.floor(random * ANSWER_SPAN);
  return true;
}

/**
 * A look at a finch (ZebraFinch.customServerAiStep): "answer" when an answer that is due can be
 * sung now, "song" when its own phrase is due and it is tamed and can sing, else undefined. A
 * phrase that is due but can't be sung waits another 20 seconds; an answer waits up to 5 seconds
 * and is then dropped. The caller sings and calls {@link sang}.
 */
export function step(v: FinchVoice, now: number, tame: boolean, canSing: boolean): "answer" | "song" | undefined {
  if (v.answerAt !== 0 && now >= v.answerAt) {
    v.dueUntil = v.answerAt + ANSWER_PATIENCE;
    v.answerAt = 0;
  }
  if (v.dueUntil !== 0) {
    if (now > v.dueUntil) v.dueUntil = 0;
    else if (canSing) {
      v.dueUntil = 0;
      return "answer";
    }
  }
  if (now >= v.nextSong) {
    if (tame && canSing) return "song";
    v.nextSong = now + SONG_WAIT_MIN;
  }
  return undefined;
}
