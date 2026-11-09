// Unit tests for dusk, the greeting and the shoulder: their rules (src/day-logic.ts and
// src/shoulder-logic.ts, compiled here on the fly) against the Java edition's LittleBird, Shoulder
// and RoostGoal, and the shoulder's body in the generated entity.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), Module = require('module');
const ts = require('typescript');
const { birds } = require('../birds.js');
const packs = require('../packs.js');
const { javaRepo } = require('../java-source.js');

const root = path.resolve(__dirname, '..', '..');
function loadTs(file) {
	const src = fs.readFileSync(path.join(root, file), 'utf8');
	const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
	const m = new Module(file);
	m._compile(js, path.join(root, file));
	return m.exports;
}
const D = loadTs('src/day-logic.ts');
const S = loadTs('src/shoulder-logic.ts');
const java = javaRepo();
const JAVA = 'common/src/main/java/com/gabbymaybelle/littlebirds/';
const littleBird = java.text(`${JAVA}LittleBird.java`);

const close = (a, b, why, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${why}: ${a} is not ${b}`);

// ---------------------------------------------------------------- dusk

test('dusk and dawn fall where the Java edition counts it dark outside', () => {
	// Clear: the sky light is full all day, and 4 or more down from about 12523 to 23477.
	for (const t of [0, 1000, 6000, 11867, 12500, 23500]) assert.ok(!D.isDark(t), `clear ${t} is dark`);
	for (const t of [12550, 13000, 18000, 23000, 23450, 24000 + 18000]) assert.ok(D.isDark(t), `clear ${t} is not dark`);
	close(D.skyLight(6000), 15, 'full by day');
	close(D.skyLight(18000), 4, 'night light', 1e-6);
	// Rain: still light by day, dusk at about 12001.
	assert.ok(!D.isDark(6000, 'rain') && !D.isDark(11950, 'rain') && D.isDark(12050, 'rain'));
	// A thunderstorm is dark all day (beds work, and the birds go home, as on Java).
	for (const t of [0, 6000, 12000]) assert.ok(D.isDark(t, 'thunder'), `thunder ${t}`);
	// The roost goal is keyed to it on Java.
	const roost = java.text(`${JAVA}RoostGoal.java`);
	assert.match(roost, /isDarkOutside\(\) \|\| this\.bird\.staysHome\(\)/);
	assert.match(littleBird, /return this\.isPerched\(\) && this\.level\(\)\.isDarkOutside\(\)/, 'roosting is perched after dark');
	assert.match(littleBird, /return this\.isRoosting\(\) \? null : this\.chatterSound\(\)/, 'quiet once roosting');
});

// ---------------------------------------------------------------- the greeting

test('the greeting numbers are Java\'s', () => {
	assert.match(littleBird, /GREETING_REACH = 8\.0/);
	assert.match(littleBird, /GREETING_AFTER = 1000L/);
	assert.match(littleBird, /this\.tickCount % 10 == 0\) \{\s*this\.watchForOwner/);
	assert.match(littleBird, /level\.getOverworldClockTime\(\)/, 'keyed to the day clock');
	assert.strictEqual(D.GREETING_REACH, 8);
	assert.strictEqual(D.GREETING_AFTER, 1000);
	assert.strictEqual(D.WATCH_EVERY, 10);
	assert.match(littleBird, /protected int greetingTicks\(\) \{\s*return 30;/);
	assert.match(java.text(`${JAVA}Cockatiel.java`), /protected int greetingTicks\(\) \{\s*return 40;/);
	// The pose length the script uses is the one the bird table (and its animation) has.
	for (const b of birds) assert.strictEqual(D.greetingTicks(b.id), b.greeting.ticks, b.id);
});

test('the day clock runs on across midnight', () => {
	assert.strictEqual(D.dayClock(0, 23000), 23000);
	assert.strictEqual(D.dayClock(1, 500), 24500);
});

test('a bird says hello once when its owner comes back after an hour or more away', () => {
	const bird = { x: 0, y: 64, z: 0 };
	const near = { x: 5, y: 64, z: 5 }, far = { x: 20, y: 64, z: 0 };
	const w = (o) => D.watchForOwner({ lastSaw: 1000, now: 1500, bird, owner: near, onShoulder: false, ...o });
	// Within reach: keeps the time; hello only after an hour away.
	assert.deepStrictEqual(w({}), { lastSaw: 1500, greet: false });
	assert.deepStrictEqual(w({ now: 2000 }), { lastSaw: 2000, greet: true });
	assert.deepStrictEqual(w({ now: 1999 }), { lastSaw: 1999, greet: false });
	// Exactly 8 blocks is within reach (Java compares the squares with >).
	assert.ok(w({ now: 2000, owner: { x: 8, y: 64, z: 0 } }).greet);
	assert.ok(!w({ now: 2000, owner: { x: 8.01, y: 64, z: 0 } }).greet);
	// Away or gone: the last time stays as it was.
	assert.deepStrictEqual(w({ now: 5000, owner: far }), { lastSaw: 1000, greet: false });
	assert.deepStrictEqual(w({ now: 5000, owner: undefined }), { lastSaw: 1000, greet: false });
	// The clock turned back while away: counting starts again from now, with no hello on return.
	assert.deepStrictEqual(w({ now: 500, owner: far }), { lastSaw: 500, greet: false });
	// No time kept yet (no owner seen): the first sight is no homecoming.
	assert.deepStrictEqual(w({ lastSaw: -1, now: 90000 }), { lastSaw: 90000, greet: false });
	// On its owner's shoulder it is never away, however far the numbers say.
	assert.deepStrictEqual(w({ now: 1600, owner: far, onShoulder: true }), { lastSaw: 1600, greet: false });
	// Day after day: back the next morning is a hello.
	assert.ok(w({ lastSaw: 12000, now: 24000 + 1000 }).greet);
});

// ---------------------------------------------------------------- the shoulder

test('the shoulder seat is Java\'s sums: up 1.2, out to the right', () => {
	assert.match(littleBird, /SHOULDER_UP = 1\.2;/);
	assert.match(littleBird, /owner\.getX\(\) - Mth\.cos\(rad\) \* SHOULDER_OUT/);
	assert.match(littleBird, /owner\.getZ\(\) - Mth\.sin\(rad\) \* SHOULDER_OUT/);
	const at = { x: 10, y: 64, z: 20 };
	const s0 = S.shoulderSeat(at, 0); // facing +z: the right hand is -x
	close(s0.x, 10 - S.SHOULDER_OUT, 'yaw 0 x'); close(s0.y, 65.2, 'y'); close(s0.z, 20, 'yaw 0 z');
	const s90 = S.shoulderSeat(at, 90); // facing -x: the right hand is -z
	close(s90.x, 10, 'yaw 90 x', 1e-9); close(s90.z, 20 - S.SHOULDER_OUT, 'yaw 90 z');
	const s180 = S.shoulderSeat(at, 180);
	close(s180.x, 10 + S.SHOULDER_OUT, 'yaw 180 x');
});

test('a bird on a shoulder clears the player\'s box at every angle', () => {
	const owner = { x: 0, y: 64, z: 0 };
	for (let yaw = -180; yaw < 180; yaw += 1) assert.ok(!S.overlapsPlayer(S.shoulderSeat(owner, yaw), owner), `overlaps at yaw ${yaw}`);
	// Why the box shrinks: a full-size budgie (0.4 wide) at this seat overlaps at a slant.
	assert.ok(S.overlapsPlayer(S.shoulderSeat(owner, 45), owner, 0.4));
	// And the generated body says the same size, with the bird's own hit box to sneak-use it off.
	for (const b of birds) {
		const body = packs.entity(b)['minecraft:entity'].component_groups['little_birds:shoulder_body'];
		assert.deepStrictEqual(body['minecraft:collision_box'], { width: S.SHOULDER_BOX, height: S.SHOULDER_BOX }, b.id);
		const hit = body['minecraft:custom_hit_test'].hitboxes[0];
		assert.ok(hit.width === b.width && hit.height === b.height, `${b.id} hit box`);
		assert.ok(body['minecraft:damage_sensor'].triggers.some((t) => t.cause === 'suffocation' && t.deals_damage === 'no'), `${b.id}: no suffocating in a wall beside its owner`);
		assert.ok(body['minecraft:ambient_sound_interval'], `${b.id}: chatters on a shoulder`);
		assert.strictEqual(body['minecraft:movement'].value, 0);
		// Off the shoulder, the bird's own size comes back (own_size; packs.test.js checks every event).
		assert.deepStrictEqual(packs.entity(b)['minecraft:entity'].component_groups['little_birds:own_size']['minecraft:collision_box'], { width: b.width, height: b.height }, b.id);
	}
});

test('song birds keep to their perches; the rest ride shoulders', () => {
	assert.deepStrictEqual(birds.map((b) => S.ridesShoulders(b.id)), [true, true, true, false, false]);
	for (const f of ['Canary', 'ZebraFinch']) assert.match(java.text(`${JAVA}${f}.java`), /public boolean ridesShoulders\(\) \{\s*return false;/, f);
	for (const f of ['Budgie', 'Cockatiel', 'Lovebird']) assert.doesNotMatch(java.text(`${JAVA}${f}.java`), /ridesShoulders/, f);
});

test('a sneak-use with an empty hand takes your bird on and off the shoulder', () => {
	const u = (o) => S.birdUse({ sneaking: true, emptyHand: true, tamed: true, kind: 'budgie', baby: false, owner: 'me', player: 'me', onShoulder: false, playerHasOne: false, ...o });
	assert.strictEqual(u({}), 'on');
	assert.strictEqual(u({ onShoulder: true }), 'off');
	assert.strictEqual(u({ playerHasOne: true }), 'nothing', 'one bird to a shoulder');
	assert.strictEqual(u({ owner: undefined }), 'on', 'a bird with no owner on record takes whoever uses it');
	assert.strictEqual(u({ owner: 'someone' }), 'pass', 'someone else\'s bird');
	assert.strictEqual(u({ tamed: false }), 'pass', 'a wild bird');
	assert.strictEqual(u({ baby: true }), 'nothing', 'a chick is too small');
	assert.strictEqual(u({ kind: 'canary' }), 'nothing', 'a song bird asks nothing of a sneak-use');
	assert.strictEqual(u({ kind: 'zebra_finch', tamed: false }), 'nothing');
	assert.strictEqual(u({ sneaking: false }), 'pass');
	assert.strictEqual(u({ emptyHand: false }), 'pass');
	// Java's order: a song bird is turned away before anything else; a chick is too small.
	assert.match(littleBird, /isShiftKeyDown\(\) && stack\.isEmpty\(\) && !this\.ridesShoulders\(\)\) \{[\s\S]*?return InteractionResult\.PASS/);
	assert.match(littleBird, /isShiftKeyDown\(\) && stack\.isEmpty\(\) && !this\.isBaby\(\)/);
	assert.match(littleBird, /else if \(Shoulder\.riding\(player\) == null\)/);
});

test('the shoulder entity events exist and take the other bodies off', () => {
	for (const b of birds) {
		const e = packs.entity(b)['minecraft:entity'];
		assert.deepStrictEqual(e.events['little_birds:shoulder'].add.component_groups, ['little_birds:shoulder_body']);
		assert.ok(e.events['little_birds:release'].remove.component_groups.includes('little_birds:shoulder_body'));
		// Its size is there from the start and set again by every body; what it shrugs off lives only in the bodies.
		assert.deepStrictEqual(e.components['minecraft:collision_box'], { width: b.width, height: b.height });
		assert.ok(!e.components['minecraft:damage_sensor']);
	}
});
