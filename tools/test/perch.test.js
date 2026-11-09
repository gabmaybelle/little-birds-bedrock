// Unit tests for the perch: its rules (src/perch-logic.ts, compiled here on the fly) against the
// Java edition's PerchBlock, FindPerchGoal, RoostGoal and LittleBird, and its generated files.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), Module = require('module');
const ts = require('typescript');
const { birds } = require('../birds.js');
const packs = require('../packs.js');
const { javaRepo, ASSETS, DATA } = require('../java-source.js');

const root = path.resolve(__dirname, '..', '..');
function loadTs(file) {
	const src = fs.readFileSync(path.join(root, file), 'utf8');
	const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
	const m = new Module(file);
	m._compile(js, path.join(root, file));
	return m.exports;
}
const L = loadTs('src/perch-logic.ts');
const java = javaRepo();

const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} is not ${b}`);
const bird = (id, kind, x, z, extra = {}) => ({ id, kind, location: { x, y: 64, z }, ...extra });
const BLOCK = { x: 10, y: 64, z: 20 };
const KEY = L.perchKey('minecraft:overworld', BLOCK);

// ---------------------------------------------------------------- seats

test('the seat is the middle of the bar, at the top of the bar', () => {
	const s = L.seat(BLOCK, 'north');
	close(s.x, 10.5, 'x'); close(s.z, 20.5, 'z');
	close(s.y, 64 + 12 / 16 + L.SEAT_LIFT, 'y');
	const javaBlock = java.text('common/src/main/java/com/gabbymaybelle/littlebirds/PerchBlock.java');
	assert.match(javaBlock, /SEAT_HEIGHT = 12\.0 \/ 16\.0/, 'Java moved the seat');
	assert.match(javaBlock, /CALL_REACH = 16\.0/);
});

test('a bird sits facing back at whoever placed the perch', () => {
	// The state is the way the placer faced: a placer facing north (-z) is looked at from the south
	// side, so the bird faces south (yaw 0), and so on round.
	assert.deepStrictEqual(['north', 'south', 'east', 'west'].map(L.seatYaw), [0, 180, 90, -90]);
	for (const f of ['north', 'south', 'east', 'west']) {
		const yaw = L.seatYaw(f) * Math.PI / 180;
		const looks = { x: -Math.sin(yaw), z: Math.cos(yaw) }; // the way an entity at this yaw looks
		const placerFaced = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 } }[f];
		close(looks.x, -placerFaced.x, `${f} x`); close(looks.z, -placerFaced.z, `${f} z`);
	}
});

test('two birds sit either side of the middle, along the bar', () => {
	close(L.seat(BLOCK, 'north', 0.2).x, 10.7, 'north: along x');
	close(L.seat(BLOCK, 'south', -0.2).x, 10.3, 'south: along x');
	close(L.seat(BLOCK, 'east', 0.2).z, 20.7, 'east: along z');
	close(L.seat(BLOCK, 'west', 0.2).x, 10.5, 'west: x stays');
});

// ---------------------------------------------------------------- sharing

test('one bird to a perch, except a lovebird pair or two finches', () => {
	const budgie = bird('1', 'budgie', 0, 0), other = bird('2', 'budgie', 0, 0);
	assert.ok(L.hasSeatFor(budgie, []), 'an empty perch');
	assert.ok(L.hasSeatFor(budgie, [budgie]), 'its own perch');
	assert.ok(!L.hasSeatFor(budgie, [other]), 'another budgie\'s perch');
	const f1 = bird('3', 'zebra_finch', 0, 0), f2 = bird('4', 'zebra_finch', 0, 0), f3 = bird('5', 'zebra_finch', 0, 0);
	assert.ok(L.hasSeatFor(f1, [f2]), 'two finches share');
	assert.ok(!L.hasSeatFor(f3, [f1, f2]), 'a third finch looks elsewhere');
	assert.ok(!L.hasSeatFor(f1, [budgie]), 'a finch doesn\'t share with a budgie');
	assert.ok(!L.hasSeatFor(budgie, [f1]), 'nor a budgie with a finch');
	const l1 = bird('6', 'lovebird', 0, 0, { partner: '7' }), l2 = bird('7', 'lovebird', 0, 0, { partner: '6' }), l3 = bird('8', 'lovebird', 0, 0);
	assert.ok(L.hasSeatFor(l1, [l2]), 'a lovebird shares with its partner');
	assert.ok(!L.hasSeatFor(l3, [l1]), 'a lone lovebird doesn\'t share with someone else\'s');
	assert.ok(!L.hasSeatFor(l1, [l2, l3]), 'no third on the bar');
});

test('two that share take opposite sides and agree on which', () => {
	const l1 = bird('-12', 'lovebird', 0, 0, { partner: '5' }), l2 = bird('5', 'lovebird', 0, 0, { partner: '-12' });
	assert.strictEqual(L.seatOffset(l1, []), -0.2, 'the lower id takes the left');
	assert.strictEqual(L.seatOffset(l2, []), 0.2);
	assert.strictEqual(L.seatOffset(bird('9', 'lovebird', 0, 0), []), 0, 'a lone lovebird sits in the middle');
	const f1 = bird('100', 'zebra_finch', 0, 0, { perch: KEY }), f2 = bird('99', 'zebra_finch', 0, 0, { perch: KEY });
	assert.strictEqual(L.seatOffset(f1, [f1]), 0, 'a finch on its own sits in the middle');
	assert.strictEqual(L.seatOffset(f1, [f1, f2]), 0.2);
	assert.strictEqual(L.seatOffset(f2, [f1, f2]), -0.2, 'ids compare as numbers, not text');
	assert.strictEqual(L.seatOffset(bird('1', 'budgie', 0, 0), [f1]), 0);
});

test('home birds are the ones naming the perch within reach of it', () => {
	const near = bird('1', 'budgie', 20, 30, { perch: KEY }), far = bird('2', 'budgie', 40, 20, { perch: KEY }), elsewhere = bird('3', 'budgie', 11, 21, { perch: 'x' });
	assert.deepStrictEqual(L.homeBirds([near, far, elsewhere], KEY, BLOCK).map((b) => b.id), ['1']);
});

// ---------------------------------------------------------------- finding a perch

test('a bird makes the nearest free perch within reach its home', () => {
	const p = (x, y, z) => ({ key: `k${x},${y},${z}`, block: { x, y, z } });
	const b = bird('1', 'budgie', 0.5, 0.5);
	const near = p(3, 64, 0), nearer = p(-2, 64, 0), tooFar = p(9, 64, 0), tooHigh = p(1, 69, 0), edge = p(8, 68, -8);
	assert.strictEqual(L.nearestFreePerch(b, [near, nearer, tooFar, tooHigh], () => []).key, nearer.key);
	assert.strictEqual(L.nearestFreePerch(b, [tooFar, tooHigh], () => []), undefined);
	assert.strictEqual(L.nearestFreePerch(b, [edge], () => []).key, edge.key, '8 across and 4 up is still in reach');
	const taken = (q) => (q === nearer ? [bird('2', 'budgie', 0, 0)] : []);
	assert.strictEqual(L.nearestFreePerch(b, [near, nearer], taken).key, near.key, 'a claimed perch is passed over');
});

// ---------------------------------------------------------------- home and away

test('the owner is away beyond 16 blocks of the perch, or not here', () => {
	const c = { x: 10.5, y: 64.5, z: 20.5 };
	assert.ok(!L.ownerAway({ ...c, x: c.x + 15.9 }, BLOCK));
	assert.ok(L.ownerAway({ ...c, x: c.x + 16 }, BLOCK));
	assert.ok(L.ownerAway(undefined, BLOCK), 'offline or in another world');
	assert.ok(L.staysHome({ ...c, x: c.x + 31 }, BLOCK, undefined), 'a bird 31 blocks out stays home');
	assert.ok(!L.staysHome({ ...c, x: c.x + 32 }, BLOCK, undefined), 'a bird 32 blocks out is any pet');
	assert.ok(!L.staysHome(c, BLOCK, { ...c, x: c.x + 3 }), 'its owner is home');
});

test('when a bird goes home and how long it stays', () => {
	const go = (o) => L.goesHome({ called: false, night: false, staysHome: false, visitRoll: 1, ...o });
	assert.ok(!go({}), 'a sunny day with its owner about: out and about');
	assert.ok(go({ called: true }) && go({ night: true }) && go({ staysHome: true }) && go({ visitRoll: 0 }));
	const keeps = (o) => L.keepsSeat({ night: false, staysHome: false, dwell: 0, ...o });
	assert.ok(!keeps({}), 'its daytime sit is over');
	assert.ok(keeps({ night: true }) && keeps({ staysHome: true }) && keeps({ dwell: 1 }));
	assert.strictEqual(L.dwellTicks(0), 400);
	assert.strictEqual(L.dwellTicks(0.9999), 1199, '20 to 60 seconds, as on Java');
	const roost = java.text('common/src/main/java/com/gabbymaybelle/littlebirds/RoostGoal.java');
	assert.match(roost, /this\.dwell = 400 \+ this\.bird\.getRandom\(\)\.nextInt\(800\)/, 'Java changed the daytime sit');
	assert.match(roost, /FLY_HOME_RANGE = 32\.0/);
	assert.match(roost, /DAYTIME_VISIT_CHANCE = 600/);
});

// ---------------------------------------------------------------- calling

test('using a perch calls your own bird first, then your nearest bird it has a seat for', () => {
	const c = (id, x, z, o = {}) => ({ ...bird(id, 'budgie', x, z), owner: 'me', onShoulder: false, sitting: false, perched: false, ...o });
	const call = (cands, home = []) => L.birdToCall(cands, KEY, BLOCK, 'me', () => home);
	const own = c('own', 25, 20, { perch: KEY }), newcomer = c('new', 11, 21);
	assert.strictEqual(call([newcomer, own], [own]).id, 'own', 'its own bird, though farther');
	assert.strictEqual(call([newcomer, { ...own, perched: true }], [own]), undefined, 'its own bird is on it already: a newcomer has no seat');
	assert.strictEqual(call([newcomer, c('newer', 12, 20)]).id, 'new', 'the nearest');
	assert.strictEqual(call([c('theirs', 11, 20, { owner: 'them' })]), undefined, 'not someone else\'s bird');
	assert.strictEqual(call([c('nobody', 11, 20, { owner: undefined })]).id, 'nobody', 'a bird with no owner on record answers anyone');
	assert.strictEqual(call([c('sits', 11, 20, { sitting: true })]), undefined, 'a sitting bird stays put');
	assert.strictEqual(call([c('held', 11, 20, { onShoulder: true })]), undefined, 'a shoulder bird is set down, not called');
	assert.strictEqual(call([c('far', 28, 20)]), undefined, 'beyond 16 blocks');
	assert.strictEqual(call([c('edge', 27, 20)]).id, 'edge', '16 blocks out from the block\'s edge is in reach');
});

// ---------------------------------------------------------------- the flight

test('the flight home comes down onto the seat from above, and lands on it exactly', () => {
	const seatAt = L.seat(BLOCK, 'east');
	let at = { x: 0, y: 70, z: 5 }, phase = 0, landed = false, ticks = 0, wentAbove = false;
	while (!landed && ticks < 1000) {
		const s = L.flightStep(at, seatAt, phase);
		if (s.phase === 1 && phase === 0) wentAbove = at.y > seatAt.y + 0.5;
		at = s.to; phase = s.phase; landed = s.landed; ticks++;
	}
	assert.ok(landed, 'never landed');
	assert.ok(wentAbove, 'came at the bar from the side instead of from above');
	assert.deepStrictEqual(at, seatAt);
	assert.ok(ticks < L.GIVE_UP_TICKS, `${ticks} ticks is past the give-up time`);
	assert.ok(!L.offSeat({ ...seatAt, x: seatAt.x + 0.4 }, seatAt) && L.offSeat({ ...seatAt, x: seatAt.x + 0.6 }, seatAt) && L.offSeat({ ...seatAt, y: seatAt.y - 0.6 }, seatAt));
	close(L.yawTowards({ x: 0, y: 0, z: 1 }), 0, 'south'); close(L.yawTowards({ x: -1, y: 0, z: 0 }), 90, 'west');
});

test('perch keys read back', () => {
	assert.deepStrictEqual(L.parsePerchKey(L.perchKey('minecraft:the_nether', { x: -5, y: -60, z: 300 })), { dimensionId: 'minecraft:the_nether', block: { x: -5, y: -60, z: 300 } });
	assert.strictEqual(L.parsePerchKey('nonsense'), undefined);
	assert.strictEqual(L.parsePerchKey('a|1|x|3'), undefined);
});

// ---------------------------------------------------------------- the generated files

test('the perch model is Java\'s block model, the same as the one seen in the game', () => {
	const approved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'perch-approved.geo.json'), 'utf8'));
	const geo = packs.blockModelToGeo(JSON.parse(java.text(`${ASSETS}models/block/perch.json`)), 'geometry.little_birds.perch');
	assert.deepStrictEqual(geo, approved);
});

test('the perch block turns its bar for east and west, as Java\'s blockstates do', () => {
	const b = packs.perchBlock()['minecraft:block'];
	const states = JSON.parse(java.text(`${ASSETS}blockstates/perch.json`)).variants;
	assert.strictEqual((states['facing=east'].y / 90) % 2, 1, 'Java turns east a quarter');
	assert.strictEqual((states['facing=north'].y || 0) % 180, 0);
	const turned = b.permutations.find((p) => p.components['minecraft:transformation']);
	assert.match(turned.condition, /'east'/); assert.match(turned.condition, /'west'/);
	assert.deepStrictEqual(turned.components['minecraft:transformation'].rotation, [0, 90, 0]);
	assert.strictEqual(b.components['minecraft:collision_box'].size[1], 12, 'the collision box reaches the seat');
});

test('the perch recipe is Java\'s', () => {
	const javaRecipe = JSON.parse(java.text(`${DATA}recipe/perch.json`));
	const r = packs.perchRecipe(javaRecipe)['minecraft:recipe_shaped'];
	assert.deepStrictEqual(r.pattern, javaRecipe.pattern);
	assert.deepStrictEqual(r.key, { S: { item: 'minecraft:string' }, '/': { item: 'minecraft:stick' }, P: { tag: 'minecraft:planks' } });
	assert.deepStrictEqual(r.unlock, [{ item: 'minecraft:string' }]);
});

test('each perch event leaves a bird in exactly one body', () => {
	for (const b of birds) {
		const e = packs.entity(b)['minecraft:entity'];
		const bodies = ['free_body', 'held_body', 'asleep_body', 'shoulder_body'].map((g) => `little_birds:${g}`);
		for (const ev of ['hold', 'sleep', 'shoulder', 'release', 'release_wild']) {
			const def = e.events[`little_birds:${ev}`];
			const added = def.add.component_groups.filter((g) => bodies.includes(g));
			const removed = def.remove.component_groups.filter((g) => bodies.includes(g));
			assert.strictEqual(added.length, 1, `${b.id} ${ev} adds one body`);
			assert.deepStrictEqual([...added, ...removed].sort(), bodies.slice().sort(), `${b.id} ${ev} takes the other bodies off`);
		}
		for (const ev of ['hold', 'sleep', 'shoulder']) assert.ok(e.events[`little_birds:${ev}`].remove.component_groups.includes('little_birds:pet_goals'), `${ev}: no following while held`);
		assert.ok(!e.component_groups['little_birds:asleep_body']['minecraft:ambient_sound_interval'], 'quiet asleep');
		assert.ok(e.component_groups['little_birds:held_body']['minecraft:ambient_sound_interval'], 'chatters on its perch by day, as on Java');
	}
});

test('every bird has the settle sound it murmurs on its perch at night', () => {
	const sounds = JSON.parse(java.text(`${ASSETS}sounds.json`));
	for (const b of birds) assert.ok(sounds[`${b.id}_settle`], b.id);
});
