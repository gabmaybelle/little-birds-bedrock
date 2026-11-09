// Unit tests for the generated pack files: node --test tools/test/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { birds } = require('../birds.js');
const packs = require('../packs.js');
const { convert } = require('../java-model-to-geo.js');
const { crc32 } = require('../zip.js');
const { javaRepo, ASSETS, MODELS } = require('../java-source.js');

const java = javaRepo();

test('no component is both in the base and in a component group', () => {
	// Removing a group takes its components away but never brings a base value back, so a base
	// component that a group also sets is lost for good the first time the group comes off.
	for (const b of birds) {
		const e = packs.entity(b)['minecraft:entity'];
		const base = new Set(Object.keys(e.components));
		// The one exception: the collision box. The base has the bird's size (no group may set it as
		// a bird appears: new flocks then stood still); the shoulder body shrinks it; every event that
		// takes the shoulder body off adds own_size, which sets the bird's size back.
		const sizers = ['little_birds:shoulder_body', 'little_birds:own_size'];
		for (const [g, comps] of Object.entries(e.component_groups)) {
			for (const c of Object.keys(comps)) {
				if (c === 'minecraft:collision_box' && sizers.includes(g)) continue;
				assert.ok(!base.has(c), `${b.id}: ${c} is in the base and in ${g}`);
			}
		}
		for (const [name, ev] of Object.entries(e.events)) {
			const adds = (ev.add && ev.add.component_groups) || [], removes = (ev.remove && ev.remove.component_groups) || [];
			if (removes.includes('little_birds:shoulder_body')) assert.ok(adds.includes('little_birds:own_size'), `${b.id}: ${name} takes the shoulder off but not the small box`);
			if (adds.includes('little_birds:shoulder_body')) assert.ok(removes.includes('little_birds:own_size'), `${b.id}: ${name} leaves own_size on the shoulder`);
		}
		assert.ok(!e.events['minecraft:entity_spawned'].add.component_groups.includes('little_birds:own_size'), `${b.id}: a new bird gets its size from a group`);
		assert.deepStrictEqual(e.components['minecraft:collision_box'], { width: b.width, height: b.height }, `${b.id}: base size`);
		assert.deepStrictEqual(e.component_groups['little_birds:own_size']['minecraft:collision_box'], { width: b.width, height: b.height }, `${b.id}: own_size`);
	}
});

test('every event names only groups that exist', () => {
	for (const b of birds) {
		const e = packs.entity(b)['minecraft:entity'];
		for (const [name, ev] of Object.entries(e.events)) {
			for (const k of ['add', 'remove']) for (const g of (ev[k] && ev[k].component_groups) || []) assert.ok(e.component_groups[g], `${b.id}: ${name} names ${g}`);
		}
	}
});

test('the budgie converts to the geometry approved in the game', () => {
	const approved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'budgie-approved.geo.json'), 'utf8'));
	const geo = convert(java.text(`${MODELS}BudgieModel.java`), 'geometry.little_birds.budgie');
	assert.deepStrictEqual(geo, approved);
});

test('every Java model part becomes a bone, and every animated bone exists', () => {
	for (const b of birds) {
		const src = java.text(`${MODELS}${b.model}.java`);
		const parts = [...src.matchAll(/addOrReplaceChild\(\s*"(\w+)"/g)].map((m) => m[1]);
		const bones = convert(src, 'x')['minecraft:geometry'][0].bones.map((x) => x.name);
		assert.deepStrictEqual(bones.slice().sort(), [...new Set(parts)].sort(), b.id);
		for (const [a, def] of Object.entries(packs.animations(b).animations)) {
			for (const bone of Object.keys(def.bones)) assert.ok(bones.includes(bone), `${a}: no bone ${bone}`);
		}
	}
});

test('the colours match the Java textures, in order', () => {
	for (const b of birds) {
		const files = java.list(`${ASSETS}textures/entity/${b.id}/`).map((p) => path.posix.basename(p, '.png').slice(b.id.length + 1));
		assert.deepStrictEqual(b.colours.slice().sort(), files.sort(), b.id);
		const javaClass = java.text(`common/src/main/java/com/gabbymaybelle/littlebirds/${b.model.replace('Model', '')}.java`);
		const order = /enum Colour \{([\s\S]*?);/.exec(javaClass)[1].replace(/\/\*\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
		assert.deepStrictEqual(b.colours, order, `${b.id}: the colour numbers must follow Java's Colour order`);
	}
});

test('sizes and health match the Java edition', () => {
	const src = java.text('common/src/main/java/com/gabbymaybelle/littlebirds/Birds.java');
	for (const b of birds) {
		const m = new RegExp(`${b.model.replace('Model', '')}::new, MobCategory\\.CREATURE, ([\\d.]+)F, ([\\d.]+)F`).exec(src);
		assert.ok(m, b.id);
		assert.strictEqual(b.width, +m[1], `${b.id} width`);
		assert.strictEqual(b.height, +m[2], `${b.id} height`);
		const cls = java.text(`common/src/main/java/com/gabbymaybelle/littlebirds/${b.model.replace('Model', '')}.java`);
		assert.strictEqual(b.health, +/birdAttributes\(([\d.]+)\)/.exec(cls)[1], `${b.id} health`);
	}
});

test('the zip CRC is the standard one', () => {
	assert.strictEqual(crc32(Buffer.from('123456789')).toString(16), 'cbf43926');
});
