// Unit tests for lovebird pairs, finch company, breeding, chicks and songs: their rules
// (src/pair-logic.ts, src/breed-logic.ts and src/song-logic.ts, compiled here on the fly) against the
// Java edition's Lovebird, ZebraFinch, Canary and LittleBird and vanilla's Animal and BreedGoal, and
// the chick and follow parts of the generated entity.
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
const P = loadTs('src/pair-logic.ts');
const G = loadTs('src/song-logic.ts');
const B = loadTs('src/breed-logic.ts');
const java = javaRepo();
const JAVA = 'common/src/main/java/com/gabbymaybelle/littlebirds/';
const lovebird = java.text(`${JAVA}Lovebird.java`);
const finch = java.text(`${JAVA}ZebraFinch.java`);
const canary = java.text(`${JAVA}Canary.java`);
const littleBird = java.text(`${JAVA}LittleBird.java`);
const NS = 'little_birds';
const ent = (id) => packs.entity(birds.find((b) => b.id === id))['minecraft:entity'];

// ---------------------------------------------------------------- lovebird pairs

test('the pair and company numbers are Java\'s', () => {
	assert.match(lovebird, /PAIR_REACH = 8\.0/);
	assert.match(lovebird, /TOGETHER_RANGE = 4\.0/);
	assert.match(lovebird, /distanceToSqr\(this\.partner\) > 2\.0 \* 2\.0/, 'comes to within 2');
	assert.match(lovebird, /nextInt\(reducedTickDelay\(60\)\) != 0/, 'tries one tick in reducedTickDelay(60)');
	assert.match(finch, /COMPANY_REACH = 8\.0/);
	assert.match(finch, /COMPANY_RANGE = 4\.0/);
	assert.match(finch, /distanceToSqr\(this\.company\) > 2\.0 \* 2\.0/);
	assert.strictEqual(P.PAIR_REACH, 8);
	assert.strictEqual(P.TOGETHER_RANGE, 4);
	assert.strictEqual(P.TOGETHER_STOP, 2);
	assert.strictEqual(P.COMPANY_REACH, 8);
	// reducedTickDelay(60) is 30: one second of those tries finds a mate about half the time.
	assert.ok(Math.abs(P.PAIR_TRY_PER_SECOND - (1 - Math.pow(29 / 30, 20))) < 1e-12);
	assert.ok(P.PAIR_TRY_PER_SECOND > 0.48 && P.PAIR_TRY_PER_SECOND < 0.5);
});

test('a lone lovebird pairs with the nearest grown lovebird on its own within 8 blocks', () => {
	const lb = (id, x, o = {}) => ({ id, location: { x, y: 64, z: 0 }, slot: 0, baby: false, ...o });
	const me = lb('a', 0);
	assert.strictEqual(P.findMate(me, [me, lb('b', 5), lb('c', 3)]).id, 'c');
	// Already paired, chicks, and beyond the box are passed over.
	assert.strictEqual(P.findMate(me, [lb('b', 2, { partner: 'x' }), lb('c', 1, { baby: true }), lb('d', 8.5)]), undefined);
	// The box is a box: 8 along each axis counts, even at a slant (Java's inflate).
	assert.strictEqual(P.findMate(me, [{ id: 'e', location: { x: 8, y: 72, z: 8 }, slot: 0, baby: false }]).id, 'e');
	// A paired bird or a chick doesn't look at all.
	assert.strictEqual(P.findMate(lb('a', 0, { partner: 'z' }), [lb('b', 1)]), undefined);
	assert.strictEqual(P.findMate(lb('a', 0, { baby: true }), [lb('b', 1)]), undefined);
	// Java's goal checks the same: partnerless, grown, both sides.
	assert.match(lovebird, /this\.bird\.hasPartner\(\) \|\| this\.bird\.isBaby\(\)/);
	assert.match(lovebird, /!other\.hasPartner\(\) && !other\.isBaby\(\)/);
});

test('each pair carries a slot no pair near it has', () => {
	const pair = (id, partner, slot, x) => ({ id, partner, slot, location: { x, y: 64, z: 0 }, baby: false });
	const here = { x: 0, y: 64, z: 0 };
	assert.strictEqual(P.chooseSlot(here, []), 1);
	assert.strictEqual(P.chooseSlot(here, [pair('a', 'b', 1, 3), pair('c', 'd', 2, 5)]), 3);
	// Far pairs don't count.
	assert.strictEqual(P.chooseSlot(here, [pair('a', 'b', 1, 40)]), 1);
	// All taken: the least used.
	const many = [];
	for (let s = 1; s <= P.PAIR_SLOTS; s++) many.push(pair(`a${s}`, `b${s}`, s, 1), pair(`b${s}`, `a${s}`, s, 1));
	many.push(pair('x', 'y', 1, 2));
	assert.strictEqual(P.chooseSlot(here, many), 2);
	// Two pairs that meet with the same slot: only one of them moves.
	const ab = pair('a', 'b', 4, 0), cd = pair('c', 'd', 4, 10);
	const others = [ab, pair('b', 'a', 4, 1), cd, pair('d', 'c', 4, 11)];
	assert.strictEqual(P.slotClashes(ab, others), false, 'a sorts first: a and b keep 4');
	assert.strictEqual(P.slotClashes(cd, others), true, 'c and d move');
	assert.strictEqual(P.slotClashes({ ...cd, location: { x: 50, y: 64, z: 0 } }, others.slice(0, 2)), false, 'far apart: no clash');
	// The entity has as many slots as the script hands out.
	const prop = ent('lovebird').description.properties[`${NS}:pair`];
	assert.deepStrictEqual(prop.range, [0, P.PAIR_SLOTS]);
	assert.strictEqual(prop.default, 0);
	for (const b of birds.filter((b) => b.id !== 'lovebird')) assert.ok(!ent(b.id).description.properties[`${NS}:pair`], `${b.id} has no pair`);
});

test('a lovebird keeps to its partner, a finch to its company, never to a shoulder bird', () => {
	const follow = (id) => ent(id).component_groups[`${NS}:free_body`]['minecraft:behavior.follow_mob'];
	const lf = follow('lovebird');
	assert.strictEqual(lf.stop_distance, P.TOGETHER_STOP);
	const all = lf.filters.all_of;
	assert.ok(all.some((f) => f.test === 'is_family' && f.subject === 'other' && f.value === 'lovebird'));
	assert.ok(all.some((f) => f.test === 'bool_property' && f.domain === `${NS}:shoulder` && f.value === false && f.subject === 'other'));
	const slots = all.find((f) => f.any_of).any_of;
	assert.strictEqual(slots.length, P.PAIR_SLOTS, 'one alternative per slot');
	slots.forEach((alt, i) => {
		const [self, other] = alt.all_of;
		assert.ok(self.subject === 'self' && other.subject === 'other' && self.value === i + 1 && other.value === i + 1, `slot ${i + 1}`);
	});
	const ff = follow('zebra_finch');
	assert.strictEqual(ff.search_range, P.COMPANY_REACH);
	assert.strictEqual(ff.stop_distance, 2);
	assert.ok(ff.filters.all_of.some((f) => f.test === 'is_family' && f.value === 'zebra_finch'));
	// Only free birds follow (not perched, held, asleep or on a shoulder), and no other kind does.
	for (const b of birds) {
		const groups = ent(b.id).component_groups;
		for (const [name, g] of Object.entries(groups)) {
			if (name !== `${NS}:free_body` || !['lovebird', 'zebra_finch'].includes(b.id)) assert.ok(!g['minecraft:behavior.follow_mob'], `${b.id} ${name} follows`);
		}
	}
	// At the wandering's priority, so neither cuts the other short.
	assert.strictEqual(lf.priority, ent('lovebird').component_groups[`${NS}:free_body`]['minecraft:behavior.random_fly'].priority);
});

// ---------------------------------------------------------------- breeding and chicks

// Vanilla's Animal and BreedGoal (Minecraft 26.3): in love 600 ticks with a heart every 10, a mate
// within 8 blocks, a chick after 60 ticks courting within 3 blocks, then both rest 6000 ticks.
test('the breeding numbers are vanilla\'s', () => {
	assert.match(littleBird, /new BreedGoal\(this, 1\.0\)/, 'the Java birds breed with vanilla\'s goal');
	assert.strictEqual(B.LOVE_TICKS, 600);
	assert.strictEqual(B.HEARTS_EVERY, 10);
	assert.strictEqual(B.COOLDOWN_TICKS, 6000);
	assert.strictEqual(B.MATE_REACH, 8);
	assert.strictEqual(B.COURT_TICKS, 60);
	assert.strictEqual(B.BREED_DIST, 3);
	// The script's seeds are the entity's (they tame wild birds and grow chicks).
	const e = ent('budgie');
	const tameItems = e.component_groups[`${NS}:wild`]['minecraft:tameable'].tame_items;
	const src = fs.readFileSync(path.join(root, 'src/breeding.ts'), 'utf8');
	const seeds = JSON.parse(src.match(/export const SEEDS = (\[[^\]]*\])/)[1]);
	assert.deepStrictEqual(seeds, tameItems.map((i) => `minecraft:${i}`));
	assert.deepStrictEqual(e.component_groups[`${NS}:chick`]['minecraft:ageable'].feed_items, tameItems);
});

const br = (o) => ({ id: 'a', kind: 'budgie', location: { x: 0, y: 64, z: 0 }, tame: true, baby: false, loveUntil: 0, readyAt: 0, ...o });

test('seeds from its owner make a tamed grown bird fall in love; a lovebird only once paired', () => {
	assert.match(littleBird, /if \(this\.isTame\(\) && this\.isOwnedBy\(player\) && this\.isFood\(stack\)\)/);
	assert.ok(B.fallsInLove(br(), 100, 'p1', 'p1'));
	assert.ok(B.fallsInLove(br(), 100, undefined, 'p1'), 'nobody on record: anyone');
	assert.ok(!B.fallsInLove(br(), 100, 'p1', 'p2'), 'someone else\'s bird');
	assert.ok(!B.fallsInLove(br({ tame: false }), 100, undefined, 'p1'), 'wild (seeds tame it instead)');
	assert.ok(!B.fallsInLove(br({ baby: true }), 100, 'p1', 'p1'), 'a chick (seeds grow it instead)');
	assert.ok(!B.fallsInLove(br({ loveUntil: 200 }), 100, 'p1', 'p1'), 'in love already');
	assert.ok(!B.fallsInLove(br({ readyAt: 6100 }), 100, 'p1', 'p1'), 'resting after a chick');
	assert.ok(B.fallsInLove(br({ readyAt: 100 }), 100, 'p1', 'p1'), 'rested');
	assert.ok(!B.fallsInLove(br({ kind: 'lovebird' }), 100, 'p1', 'p1'), 'a lovebird on its own');
	assert.ok(B.fallsInLove(br({ kind: 'lovebird', partner: 'b' }), 100, 'p1', 'p1'));
});

test('two in love of a kind within 8 blocks mate; a lovebird only with its partner', () => {
	assert.match(littleBird, /return this\.isTame\(\) && partner instanceof LittleBird other && other\.isTame\(\) && super\.canMate\(partner\)/);
	assert.match(lovebird, /return partner == this\.getPartner\(\) && super\.canMate\(partner\)/);
	const now = 100;
	const me = br({ loveUntil: 500 });
	const near = br({ id: 'b', location: { x: 3, y: 64, z: 0 }, loveUntil: 500 });
	const nearer = br({ id: 'c', location: { x: 1, y: 64, z: 0 }, loveUntil: 500 });
	assert.strictEqual(B.findMate(me, [me, near, nearer], now).id, 'c');
	assert.strictEqual(B.findMate(me, [br({ id: 'd', location: { x: 8.5, y: 64, z: 0 }, loveUntil: 500 })], now), undefined, 'beyond 8');
	assert.strictEqual(B.findMate(me, [br({ id: 'e', loveUntil: 0 })], now), undefined, 'not in love');
	assert.strictEqual(B.findMate(me, [br({ id: 'f', kind: 'canary', loveUntil: 500 })], now), undefined, 'another kind');
	assert.strictEqual(B.findMate(me, [br({ id: 'g', tame: false, loveUntil: 500 })], now), undefined, 'wild');
	assert.strictEqual(B.findMate(br({ loveUntil: 50 }), [near], now), undefined, 'its own love has run out');
	const lb = (id, partner, x) => br({ id, kind: 'lovebird', partner, loveUntil: 500, location: { x, y: 64, z: 0 } });
	const a = lb('a', 'b', 0);
	assert.strictEqual(B.findMate(a, [lb('c', 'd', 1), lb('b', 'a', 4)], now).id, 'b', 'its partner, not a nearer lovebird');
	assert.strictEqual(B.findMate(a, [lb('c', 'd', 1)], now), undefined, 'not with another pair\'s');
	// A chick after 60 ticks courting, within 3 blocks.
	assert.ok(B.breedsNow(60, { x: 0, y: 64, z: 0 }, { x: 2.9, y: 64, z: 0 }));
	assert.ok(!B.breedsNow(59, { x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }));
	assert.ok(!B.breedsNow(80, { x: 0, y: 64, z: 0 }, { x: 3, y: 64, z: 0 }));
	// Closing in: a step at the flight's speed, stopping when they touch.
	const s = B.courtStep({ x: 0, y: 64, z: 0 }, { x: 5, y: 64, z: 0 });
	assert.ok(Math.abs(s.x - B.COURT_SPEED) < 1e-9 && s.y === 64);
	assert.deepStrictEqual(B.courtStep({ x: 0, y: 64, z: 0 }, { x: 0.5, y: 64, z: 0 }), { x: 0, y: 64, z: 0 });
	const last = B.courtStep({ x: 0, y: 64, z: 0 }, { x: 0.7, y: 64, z: 0 });
	assert.ok(Math.abs(last.x - 0.1) < 1e-9, 'never past the mate');
});

test('a chick is half size, grows up in twenty minutes (seeds hurry it) and keeps near a parent', () => {
	assert.match(littleBird, /protected boolean canBeABaby\(\) \{\s*return true;/);
	for (const b of birds) {
		const e = ent(b.id);
		const chick = e.component_groups[`${NS}:chick`];
		assert.ok(chick['minecraft:is_baby']);
		assert.strictEqual(chick['minecraft:scale'].value, 0.5, 'vanilla ageScale for the young');
		assert.strictEqual(chick['minecraft:ageable'].duration, 1200, '24000 ticks');
		assert.deepStrictEqual(chick['minecraft:ageable'].grow_up, { event: `${NS}:grown_up`, target: 'self' });
		assert.ok(chick['minecraft:behavior.follow_parent']);
		assert.ok(!chick['minecraft:experience_reward'], 'a chick gives no experience');
		assert.ok(!e.components['minecraft:experience_reward'], 'experience in the base');
		assert.ok(e.component_groups[`${NS}:adult`]['minecraft:experience_reward']);
		// Every new bird is grown; growing up swaps the chick body for the grown one.
		assert.ok(e.events['minecraft:entity_spawned'].add.component_groups.includes(`${NS}:adult`));
		assert.deepStrictEqual(e.events[`${NS}:grown_up`], { remove: { component_groups: [`${NS}:chick`] }, add: { component_groups: [`${NS}:adult`] } });
		// Hatched by the script: a chick, wild for the moment it takes to tame, free to move, no colour picked.
		assert.deepStrictEqual(e.events[`${NS}:born`], { add: { component_groups: [`${NS}:chick`, `${NS}:wild`, `${NS}:free_body`] } });
		// The game's own breeding is not used anywhere.
		assert.ok(!JSON.stringify(e).includes('breedable'), `${b.id} has a breedable component`);
	}
});

test('the chick takes one parent\'s colour and the owner on record', () => {
	assert.match(littleBird, /chick\.setVariant\(this\.random\.nextBoolean\(\) \? this\.getVariant\(\) : other\.getVariant\(\)\)/);
	assert.match(littleBird, /chick\.setOwnerReference\(this\.getOwnerReference\(\)\)/);
	const mum = { colour: 2, owner: 'p1' }, dad = { colour: 1 };
	assert.deepStrictEqual(B.chickOf(mum, dad, 0), { colour: 2, owner: 'p1' });
	assert.deepStrictEqual(B.chickOf(mum, dad, 1), { colour: 1, owner: 'p1' });
	assert.deepStrictEqual(B.chickOf(dad, mum, 0), { colour: 1, owner: 'p1' });
	assert.deepStrictEqual(B.chickOf({ colour: 0, owner: 'p2' }, mum, 1), { colour: 2, owner: 'p2' }, 'the breeding parent\'s owner first');
});

// ---------------------------------------------------------------- songs

test('the song numbers are Java\'s, and match the bird table\'s poses', () => {
	assert.match(canary, /MORNING_FROM = 0L/);
	assert.match(canary, /MORNING_UNTIL = 3000L/);
	assert.match(canary, /protected int songTicks\(\) \{\s*return 140;/);
	assert.match(finch, /protected int songTicks\(\) \{\s*return 30;/);
	for (const [k, v] of Object.entries({ HEARING: '8\\.0', SONG_WAIT_MIN: '400', SONG_WAIT_SPAN: '800', ANSWER_MIN: '20', ANSWER_SPAN: '20', QUIET_AFTER: '100', ANSWER_PATIENCE: '100' })) {
		assert.match(finch, new RegExp(`${k} = ${v};`), k);
		assert.strictEqual(G[k], Number(v.replace('\\', '')), k);
	}
	assert.strictEqual(G.MORNING_FROM, 0);
	assert.strictEqual(G.MORNING_UNTIL, 3000);
	for (const b of birds.filter((b) => b.song)) assert.strictEqual(G.SONG_TICKS[b.id], b.song.ticks, b.id);
	assert.deepStrictEqual(Object.keys(G.SONG_TICKS).sort(), birds.filter((b) => b.song).map((b) => b.id).sort());
	// The canary checks once a second, as Java's tickCount % 20.
	assert.match(canary, /this\.tickCount % 20 == 0/);
});

test('a canary sings once each morning, tamed, grown, awake and settled', () => {
	const ok = { tame: true, baby: false, flying: false, roosting: false, onShoulder: false };
	assert.ok(G.isMorning(0) && G.isMorning(2999) && !G.isMorning(3000) && !G.isMorning(23999) && G.isMorning(24000 + 100));
	assert.strictEqual(G.canarySings(ok, 100, -1), 0);
	assert.strictEqual(G.canarySings(ok, 100, 0), undefined, 'once a morning');
	assert.strictEqual(G.canarySings(ok, 24000 + 2500, 0), 1, 'the next morning');
	assert.strictEqual(G.canarySings(ok, 3000, -1), undefined, 'after the morning');
	assert.strictEqual(G.canarySings(ok, 18000, -1), undefined, 'at night');
	for (const k of ['baby', 'flying', 'roosting', 'onShoulder']) assert.strictEqual(G.canarySings({ ...ok, [k]: true }, 100, -1), undefined, k);
	assert.strictEqual(G.canarySings({ ...ok, tame: false }, 100, -1), undefined, 'wild');
	assert.match(canary, /!this\.isTame\(\) \|\| this\.isBaby\(\) \|\| this\.isFlying\(\) \|\| this\.isRoosting\(\) \|\| this\.isOnShoulder\(\)/);
});

test('a finch sings by day, every 20 to 60 seconds, and the finches near it answer', () => {
	const ok = { tame: true, baby: false, flying: false, roosting: false, onShoulder: false };
	assert.ok(G.finchCanSing(ok, false));
	assert.ok(!G.finchCanSing(ok, true), 'not after dark');
	for (const k of ['baby', 'flying', 'roosting', 'onShoulder']) assert.ok(!G.finchCanSing({ ...ok, [k]: true }, false), k);
	assert.match(finch, /return !this\.isBaby\(\) && !this\.isFlying\(\) && !this\.isRoosting\(\) && !this\.isOnShoulder\(\) && !level\.isDarkOutside\(\)/);

	// Its first phrase 20 to 60 s off; then, tamed and able, a song; after it, quiet and the next one 20 to 60 s off.
	const v = G.newVoice(1000, 0.5);
	assert.strictEqual(v.nextSong, 1000 + 400 + 400);
	assert.strictEqual(G.step(v, 1799, true, true), undefined);
	assert.strictEqual(G.step(v, 1800, true, true), 'song');
	G.sang(v, 1800, 0);
	assert.strictEqual(v.nextSong, 2200);
	assert.strictEqual(v.quietUntil, 1900);
	// Due but can't sing (night, flying) or wild: it tries again 20 s later.
	assert.strictEqual(G.step(v, 2200, true, false), undefined);
	assert.strictEqual(v.nextSong, 2600);
	assert.strictEqual(G.step(v, 2600, false, true), undefined, 'a wild finch has no song of its own');

	// Hearing: a finch answers 1 to 2 s later, unless quiet or already answering.
	const h = G.newVoice(0, 0.99);
	assert.ok(G.hear(h, 100, 0.5));
	assert.strictEqual(h.answerAt, 130);
	assert.ok(!G.hear(h, 105, 0), 'already about to answer');
	assert.strictEqual(G.step(h, 125, false, true), undefined);
	assert.strictEqual(G.step(h, 130, false, true), 'answer', 'a wild finch answers too');
	G.sang(h, 130, 0);
	assert.ok(!G.hear(h, 200, 0), 'quiet for 5 s after a phrase');
	assert.ok(G.hear(h, 230, 0), 'and then listening again');
	// An answer waits up to 5 s for the finch to be able to sing (landing), then is dropped.
	const w = G.newVoice(0, 0.99);
	G.hear(w, 0, 0);
	assert.strictEqual(G.step(w, 20, true, false), undefined);
	assert.strictEqual(G.step(w, 115, true, true), 'answer', 'still within its patience');
	const d = G.newVoice(0, 0.99);
	G.hear(d, 0, 0);
	G.step(d, 20, true, false);
	assert.strictEqual(G.step(d, 121, true, true), undefined, 'dropped after 5 s');
	assert.ok(G.hear(d, 122, 0), 'free to hear again');
	// The look every few ticks is well inside the answer's window.
	assert.ok(G.FINCH_STEP <= G.ANSWER_SPAN / 2);
});
