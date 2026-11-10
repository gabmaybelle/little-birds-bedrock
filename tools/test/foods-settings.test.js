// Unit tests for the millet spray, snacks, refused foods and the settings: their rules
// (src/food-logic.ts and src/settings-logic.ts, compiled here on the fly) against the Java edition's
// Foods, LittleBird, Canary, ZebraFinch and Settings and its tags, recipe and names, and the food and
// spawn parts of the generated pack files.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), Module = require('module');
const ts = require('typescript');
const { birds } = require('../birds.js');
const packs = require('../packs.js');
const { javaRepo, DATA, ASSETS } = require('../java-source.js');

const root = path.resolve(__dirname, '..', '..');
function loadTs(file) {
	const src = fs.readFileSync(path.join(root, file), 'utf8');
	const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
	const m = new Module(file);
	m._compile(js, path.join(root, file));
	return m.exports;
}
const F = loadTs('src/food-logic.ts');
const S = loadTs('src/settings-logic.ts');
const java = javaRepo();
const JAVA = 'common/src/main/java/com/gabbymaybelle/littlebirds/';
const foods = java.text(`${JAVA}Foods.java`);
const littleBird = java.text(`${JAVA}LittleBird.java`);
const settingsJava = java.text(`${JAVA}Settings.java`);
const NS = 'little_birds';
const ent = (id) => packs.entity(birds.find((b) => b.id === id))['minecraft:entity'];
const tag = (name) => JSON.parse(java.text(`${DATA}tags/item/${name}.json`)).values;

// ---------------------------------------------------------------- the foods

test('the foods are Java\'s: the treat, the snacks and the refused, with its numbers', () => {
	assert.strictEqual(F.MILLET, 'little_birds:millet_spray');
	assert.match(foods, /MILLET_SPRAY_ID = LittleBirds\.id\("millet_spray"\)/);
	assert.deepStrictEqual(F.SNACKS, tag('snacks'));
	assert.deepStrictEqual(F.REFUSED, tag('refused'));
	assert.deepStrictEqual(packs.SNACKS, F.SNACKS, 'the generator and the script list the same snacks');
	assert.strictEqual(packs.MILLET, F.MILLET);
	assert.match(foods, /TREAT_FULL = 600;/);
	assert.match(foods, /SNACK_FULL = 100;/);
	assert.strictEqual(F.TREAT_FULL, 600);
	assert.strictEqual(F.SNACK_FULL, 100);
	assert.match(littleBird, /id == SHAKE_EVENT\) \{\s*this\.shakeTicks = 20;/);
	assert.strictEqual(F.SHAKE_TICKS, 20);
	assert.strictEqual((littleBird.match(/this\.heal\(1\.0F\);/g) || []).length, 2, 'a treat and a snack each heal 1');
	assert.strictEqual(F.HEAL, 1);
	assert.strictEqual(F.healed(3, 5), 4);
	assert.strictEqual(F.healed(5, 5), 5, 'never above its most');
	assert.strictEqual(F.healed(4.5, 5), 5);
	// Java's birds play no eating sound for them: Animal.playEatingSound is empty and no bird overrides it.
	assert.ok(!/void playEatingSound/.test(littleBird));
});

const bird = (o) => ({ tame: true, baby: false, owner: 'p1', treatUntil: 0, snackUntil: 0, ...o });

test('a refused food: any bird shakes its head, from anyone', () => {
	assert.match(littleBird, /if \(Foods\.isRefused\(stack\)\) \{[\s\S]{0,200}SHAKE_EVENT/);
	for (const item of F.REFUSED) {
		assert.strictEqual(F.foodAction(item, bird(), 'p1', 0), 'shake');
		assert.strictEqual(F.foodAction(item, bird({ tame: false, owner: undefined }), 'p2', 0), 'shake', 'a wild bird too');
		assert.strictEqual(F.foodAction(item, bird(), 'p2', 0), 'shake', 'someone else\'s too');
		assert.strictEqual(F.foodAction(item, bird({ baby: true }), 'p1', 0), 'shake', 'a chick too');
	}
});

test('the millet spray: tames a wild bird at once, treats its owner\'s bird once in half a minute', () => {
	// takeTreat: wild -> tamed; not the owner's, or full -> nothing; else the treat.
	assert.match(littleBird, /if \(!this\.isTame\(\)\) \{\s*this\.usePlayerItem[\s\S]{0,80}this\.tame\(player\);/);
	assert.match(littleBird, /if \(!this\.isOwnedBy\(player\) \|\| this\.fullOfTreat > 0\) \{\s*return InteractionResult\.SUCCESS;/);
	assert.strictEqual(F.foodAction(F.MILLET, bird({ tame: false, owner: undefined }), 'p1', 0), 'tame');
	assert.strictEqual(F.foodAction(F.MILLET, bird({ tame: false, owner: undefined, baby: true }), 'p1', 0), 'tame', 'a wild chick too');
	assert.strictEqual(F.foodAction(F.MILLET, bird(), 'p1', 100), 'treat');
	assert.strictEqual(F.foodAction(F.MILLET, bird({ owner: undefined }), 'p1', 100), 'treat', 'nobody on record: anyone');
	assert.strictEqual(F.foodAction(F.MILLET, bird(), 'p2', 100), 'refuse', 'someone else\'s bird');
	assert.strictEqual(F.foodAction(F.MILLET, bird({ treatUntil: 700 }), 'p1', 100), 'refuse', 'full of a treat');
	assert.strictEqual(F.foodAction(F.MILLET, bird({ treatUntil: 700 }), 'p1', 700), 'treat', 'full no longer');
	assert.strictEqual(F.foodAction(F.MILLET, bird({ snackUntil: 700 }), 'p1', 100), 'treat', 'a snack doesn\'t fill it for a treat');
});

test('a snack: only from its owner, to a tamed bird, once in five seconds', () => {
	assert.match(littleBird, /if \(Foods\.isSnack\(stack\) && this\.isTame\(\) && this\.isOwnedBy\(player\)\)/);
	assert.match(littleBird, /if \(this\.fullOfSnack > 0\) \{\s*return InteractionResult\.SUCCESS;/);
	for (const item of F.SNACKS) {
		assert.strictEqual(F.foodAction(item, bird(), 'p1', 0), 'snack');
		assert.strictEqual(F.foodAction(item, bird({ snackUntil: 100 }), 'p1', 50), 'refuse', 'full of a snack');
		assert.strictEqual(F.foodAction(item, bird({ snackUntil: 100 }), 'p1', 100), 'snack');
		assert.strictEqual(F.foodAction(item, bird({ treatUntil: 600 }), 'p1', 50), 'snack', 'a treat doesn\'t fill it for a snack');
		assert.strictEqual(F.foodAction(item, bird(), 'p2', 0), 'refuse', 'someone else\'s bird');
		assert.strictEqual(F.foodAction(item, bird({ tame: false, owner: undefined }), 'p1', 0), 'refuse', 'a wild bird');
	}
	// Anything else is not the foods' business.
	for (const item of ['minecraft:wheat_seeds', 'minecraft:stick', 'minecraft:bread']) assert.strictEqual(F.foodAction(item, bird(), 'p1', 0), undefined);
	assert.ok(F.isFood(F.MILLET) && F.isFood('minecraft:carrot') && F.isFood('minecraft:cocoa_beans') && !F.isFood('minecraft:wheat_seeds'));
});

test('a treat brings a bob, a song or a finch\'s phrase; a chick\'s food grows it through the game', () => {
	assert.match(littleBird, /protected void enjoyTreat\(\) \{\s*this\.level\(\)\.broadcastEntityEvent\(this, GREET_EVENT\);/);
	for (const id of ['Canary', 'ZebraFinch']) assert.match(java.text(`${JAVA}${id}.java`), /protected void enjoyTreat\(\) \{\s*this\.sing\(\);/);
	for (const id of ['Budgie', 'Cockatiel', 'Lovebird']) assert.ok(!/enjoyTreat/.test(java.text(`${JAVA}${id}.java`)), `${id} keeps the bob`);
	assert.deepStrictEqual(birds.map((b) => F.enjoys(b.id)), ['bob', 'bob', 'bob', 'song', 'phrase']);
	// Both foods grow a chick (ageUp); seeds already do through the game's ageable.
	assert.strictEqual((littleBird.match(/if \(this\.isBaby\(\)\) \{\s*this\.ageUp\(AgeableMob\.getSpeedUpSecondsWhenFeeding/g) || []).length, 2);
	assert.ok(F.grownByGame('treat', true) && F.grownByGame('snack', true));
	assert.ok(!F.grownByGame('treat', false) && !F.grownByGame('tame', true) && !F.grownByGame('refuse', true) && !F.grownByGame('shake', true));
});

test('the entity: millet tempts a free bird, tames a wild one, and with the snacks grows a chick', () => {
	assert.match(littleBird, /addGoal\(1, new TemptGoal\(this, 1\.0, Foods::isTreat, false\)\)/);
	for (const b of birds) {
		const e = ent(b.id);
		const t = e.component_groups[`${NS}:free_body`]['minecraft:behavior.tempt'];
		assert.ok(t, `${b.id} has no tempt goal`);
		assert.deepStrictEqual(t.items, [F.MILLET]);
		assert.strictEqual(t.priority, 1, 'Java\'s priority');
		assert.strictEqual(t.within_radius, 10, 'Java\'s tempt range');
		assert.strictEqual(t.can_get_scared, false);
		// Only a free bird: not on its perch, asleep or on a shoulder.
		for (const g of ['held_body', 'asleep_body', 'shoulder_body']) assert.ok(!e.component_groups[`${NS}:${g}`]['minecraft:behavior.tempt'], `${g} is tempted`);
		assert.ok(!e.components['minecraft:behavior.tempt']);
		assert.ok(e.component_groups[`${NS}:wild`]['minecraft:tameable'].tame_items.includes(F.MILLET));
		const feed = e.component_groups[`${NS}:chick`]['minecraft:ageable'].feed_items;
		for (const f of [F.MILLET, ...F.SNACKS]) assert.ok(feed.includes(f), `a chick isn't grown by ${f}`);
		for (const f of F.REFUSED) assert.ok(!feed.includes(f), `a chick eats ${f}`);
		assert.strictEqual(e.description.properties[`${NS}:shaking`].client_sync, true, 'the head shake reaches the players');
	}
	// The head shake pose plays while the property is on (built in session 2).
	const ctl = JSON.stringify(packs.animationControllers());
	assert.match(ctl, /"shake":"variable\.shaking"/);
});

test('the millet spray item, recipe, name and crumbs are Java\'s', () => {
	const item = packs.milletItem()['minecraft:item'];
	assert.strictEqual(item.description.identifier, F.MILLET);
	assert.strictEqual(item.components['minecraft:icon'], `${NS}_millet_spray`, 'the sprite the build names from the Java texture');
	assert.ok(java.list(`${ASSETS}textures/item/millet_spray.png`).length === 1);
	const lang = JSON.parse(java.text(`${ASSETS}lang/en_us.json`));
	assert.strictEqual(lang[item.components['minecraft:display_name'].value], 'Millet Spray');
	// The recipe: wheat and two seeds make two, unlocked by wheat (Java's recipe and its advancement).
	const r = packs.shapelessRecipe(JSON.parse(java.text(`${DATA}recipe/millet_spray.json`)), JSON.parse(java.text(`${DATA}advancement/recipes/millet_spray.json`)))['minecraft:recipe_shapeless'];
	assert.deepStrictEqual(r.ingredients, [{ item: 'minecraft:wheat', count: 1 }, { item: 'minecraft:wheat_seeds', count: 2 }]);
	assert.deepStrictEqual(r.result, { item: F.MILLET, count: 2 });
	assert.deepStrictEqual(r.unlock, [{ item: 'minecraft:wheat' }]);
	assert.deepStrictEqual(r.tags, ['crafting_table']);
	// Crumbs: six bits of the snack's own sprite (Java sends 6 ITEM particles of it), one particle each.
	assert.match(littleBird, /new ItemParticleOption\(ParticleTypes\.ITEM, stack\.getItem\(\)\)[^;]*, 6, 0\.1, 0\.1, 0\.1, 0\.05\)/);
	const sprites = { 'minecraft:carrot': 'carrot', 'minecraft:apple': 'apple', 'minecraft:melon_slice': 'melon', 'minecraft:sweet_berries': 'sweet_berries', 'minecraft:glow_berries': 'glow_berries', 'minecraft:beetroot': 'beetroot' };
	for (const s of F.SNACKS) {
		const p = packs.crumbs(s).particle_effect;
		assert.strictEqual(p.description.identifier, `${NS}:crumbs_${s.slice('minecraft:'.length)}`);
		assert.strictEqual(p.description.basic_render_parameters.texture, `textures/items/${sprites[s]}`, 'Bedrock\'s own sprite for it');
		assert.strictEqual(p.components['minecraft:emitter_rate_instant'].num_particles, 6);
	}
	// The built name file has the item's name, if a build is there.
	const built = path.join(root, 'build', 'packs', 'rp', 'texts', 'en_US.lang');
	if (fs.existsSync(built)) assert.match(fs.readFileSync(built, 'utf8'), /^item\.little_birds\.millet_spray=Millet Spray$/m);
});

// ---------------------------------------------------------------- the settings

test('the settings are Java\'s two, with its defaults and its clamp', () => {
	assert.match(settingsJava, /public static boolean naturalSpawning = true;/);
	assert.match(settingsJava, /public static int spawnChance = 100;/);
	assert.strictEqual(S.DEFAULT_NATURAL_SPAWNING, true);
	assert.strictEqual(S.DEFAULT_SPAWN_CHANCE, 100);
	// Settings.clamp: 0 to 100; anything not a whole number is 100.
	assert.match(settingsJava, /Math\.max\(0, Math\.min\(100, Integer\.parseInt\(value\.trim\(\)\)\)\)/);
	assert.match(settingsJava, /catch \(NumberFormatException e\) \{\s*return 100;/);
	for (const [v, want] of [[50, 50], [0, 0], [100, 100], [-5, 0], [150, 100], ['42', 42], [' 7 ', 7], ['abc', 100], ['5.5', 100], ['', 100], [undefined, 100], [true, 100], [33.9, 33]]) {
		assert.strictEqual(S.clampChance(v), want, `clamp(${JSON.stringify(v)})`);
	}
	// The only settings Java 0.3.0 has (its file writes these two keys).
	assert.deepStrictEqual([...settingsJava.matchAll(/props\.setProperty\("(\w+)"/g)].map((m) => m[1]), ['natural_spawning', 'spawn_chance']);
});

test('a natural spawn stays only while spawning is on, at the spawn chance', () => {
	assert.match(littleBird, /if \(!Settings\.naturalSpawning \|\| random\.nextInt\(100\) >= Settings\.spawnChance\) \{\s*return false;/);
	for (let roll = 0; roll < 100; roll++) {
		assert.strictEqual(S.naturalSpawnStays(true, 100, roll), true);
		assert.strictEqual(S.naturalSpawnStays(true, 0, roll), false);
		assert.strictEqual(S.naturalSpawnStays(false, 100, roll), false);
		assert.strictEqual(S.naturalSpawnStays(true, 30, roll), roll < 30);
	}
});

test('natural spawns, and only they, are marked for the settings', () => {
	for (const b of birds) {
		const e = ent(b.id);
		const rules = packs.spawnRules(b)['minecraft:spawn_rules'].conditions;
		for (const c of rules) {
			assert.strictEqual(c['minecraft:herd'].event, packs.SPAWNED_WILD, `${b.id}'s spawn rules don't mark the bird`);
			assert.strictEqual(c['minecraft:herd'].event_skip_count, 0, 'every bird of the herd is marked');
		}
		const plain = e.events['minecraft:entity_spawned'], wild = e.events[packs.SPAWNED_WILD];
		assert.ok(wild, 'no natural spawn event');
		// The same bird as any other new one (colour, wild, free, grown), and marked.
		assert.deepStrictEqual(wild.add, plain.add);
		assert.strictEqual(wild.set_property[`${NS}:colour`], plain.set_property[`${NS}:colour`]);
		assert.strictEqual(wild.set_property[`${NS}:natural_spawn`], true);
		assert.ok(!plain.set_property[`${NS}:natural_spawn`], 'eggs and commands are marked too');
		assert.strictEqual(e.description.properties[`${NS}:natural_spawn`].default, false);
		assert.ok(!e.events[`${NS}:born`].set_property, 'chicks are marked');
	}
	// The script reads the same names.
	const src = fs.readFileSync(path.join(root, 'src', 'settings.ts'), 'utf8');
	assert.match(src, /const NATURAL = `\$\{NS\}:natural_spawn`;/);
	assert.strictEqual(packs.SPAWNED_WILD, `${NS}:spawned_wild`);
});
