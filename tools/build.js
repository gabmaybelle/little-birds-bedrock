#!/usr/bin/env node
// Builds the two packs and the .mcaddon.
//
//   node tools/build.js [--java <Java repo folder>] [--ref <git ref>]
//
// The art, the sounds, the names and the model shapes are the Java edition's: they are read from the
// Java repo (gabmaybelle/little-birds) at the ref in java-source.json, never copied here by hand,
// so both editions share one source. The Java repo is taken from ../little-birds if it is there,
// else cloned into .cache/. Output:
//   build/packs/bp, build/packs/rp   the behaviour and resource packs
//   build/packs/bp-test              the self-test pack (test worlds only, never shipped)
//   dist/LittleBirds-<version>.mcaddon
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { birds } = require('./birds.js');
const packs = require('./packs.js');
const { convert } = require('./java-model-to-geo.js');
const { zip } = require('./zip.js');
const { javaRepo, ASSETS: A, MODELS } = require('./java-source.js');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const NS = packs.NS;

// ---------------------------------------------------------------- helpers

const out = path.join(root, 'build', 'packs');
const writeFile = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const writeJson = (p, obj) => writeFile(p, JSON.stringify(obj, null, '\t') + '\n');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = (why) => { console.error('build failed: ' + why); process.exit(1); };

// The manifests carry the version from package.json, and the script module version the typings
// were installed at, so the pack never asks the game for an API the code wasn't checked against.
function manifest(file) {
	const m = readJson(file);
	const v = pkg.version.split('.').map(Number);
	m.header.version = v;
	for (const mod of m.modules) mod.version = v;
	for (const d of m.dependencies || []) {
		if (d.module_name === '@minecraft/server') d.version = pkg.devDependencies['@minecraft/server'];
		else if (d.uuid) d.version = v;
	}
	return m;
}

// Java's lang file, in Bedrock's keys.
function lang(javaLang) {
	const lines = [];
	for (const [k, v] of Object.entries(javaLang)) {
		let m;
		if ((m = /^entity\.little_birds\.(\w+)$/.exec(k))) lines.push(`entity.${NS}:${m[1]}.name=${v}`);
		else if ((m = /^item\.little_birds\.(\w+)_spawn_egg$/.exec(k))) lines.push(`item.spawn_egg.entity.${NS}:${m[1]}.name=${v}`);
		else if ((m = /^block\.little_birds\.(\w+)$/.exec(k))) lines.push(`tile.${NS}:${m[1]}.name=${v}`);
		else if (/^subtitles\.little_birds\./.test(k)) lines.push(`${k}=${v}`);
	}
	return lines.join('\n') + '\n';
}

// Java's sounds.json as Bedrock sound definitions: "little_birds:budgie/chatter1" is
// sounds/little_birds/budgie/chatter1.ogg in the resource pack.
function soundDefinitions(javaSounds) {
	const defs = {};
	for (const [event, def] of Object.entries(javaSounds)) {
		defs[`${NS}.${event}`] = {
			category: 'neutral',
			subtitle: def.subtitle,
			sounds: def.sounds.map((s) => {
				const o = typeof s === 'string' ? { name: s } : s;
				const entry = { name: 'sounds/' + o.name.replace(/^little_birds:/, `${NS}/`) };
				if (o.volume !== undefined) entry.volume = o.volume;
				if (o.pitch !== undefined) entry.pitch = o.pitch;
				if (o.weight !== undefined) entry.weight = o.weight;
				return entry;
			}),
		};
	}
	return { format_version: '1.20.20', sound_definitions: defs };
}

// What each bird sounds like: its own chatter; hurt, death, steps, flapping and eating are the
// parrot's, as on Java.
function entitySounds() {
	const entities = {};
	for (const b of birds) {
		entities[`${NS}:${b.id}`] = {
			volume: 1.0,
			pitch: [0.8, 1.2],
			events: {
				ambient: `${NS}.${b.id}_chatter`,
				hurt: { sound: 'mob.parrot.hurt', volume: 1.0, pitch: [0.8, 1.0] },
				death: { sound: 'mob.parrot.death', volume: 1.0, pitch: [0.8, 1.0] },
				step: { sound: 'mob.parrot.step', volume: 0.15, pitch: 1.0 },
				fly: 'mob.parrot.fly',
				eat: 'mob.parrot.eat',
			},
		};
	}
	return { entity_sounds: { entities } };
}

// ---------------------------------------------------------------- build

function build() {
	const java = javaRepo({ dir: opt('--java', null), ref: opt('--ref', undefined) });
	console.log(`Java edition assets: ${java.repo} at ${java.ref} (${java.commit.slice(0, 10)})`);

	fs.rmSync(out, { recursive: true, force: true });
	const bp = path.join(out, 'bp'), rp = path.join(out, 'rp'), bpTest = path.join(out, 'bp-test');

	writeJson(path.join(bp, 'manifest.json'), manifest(path.join(root, 'packs', 'bp', 'manifest.json')));
	writeJson(path.join(rp, 'manifest.json'), manifest(path.join(root, 'packs', 'rp', 'manifest.json')));
	writeJson(path.join(bpTest, 'manifest.json'), manifest(path.join(root, 'test', 'manifest.json')));
	const icon = java.read('art/icon.png');
	writeFile(path.join(bp, 'pack_icon.png'), icon);
	writeFile(path.join(rp, 'pack_icon.png'), icon);

	let textures = 0, sounds = 0;
	// Each bird: textures, model, animations, entity files.
	for (const b of birds) {
		for (const c of b.colours) {
			const p = `${A}textures/entity/${b.id}/${b.id}_${c}.png`;
			if (!java.list(p).length) fail(`the Java repo has no ${p}: the colours in tools/birds.js don't match Java's`);
			writeFile(path.join(rp, 'textures', 'entity', b.id, `${b.id}_${c}.png`), java.read(p));
			textures++;
		}
		const geo = convert(java.text(`${MODELS}${b.model}.java`), `geometry.${NS}.${b.id}`);
		writeJson(path.join(rp, 'models', 'entity', `${b.id}.geo.json`), geo);
		const bones = new Set(geo['minecraft:geometry'][0].bones.map((x) => x.name));
		const anims = packs.animations(b);
		for (const [an, def] of Object.entries(anims.animations)) {
			for (const bone of Object.keys(def.bones)) if (!bones.has(bone)) fail(`${an} moves a bone "${bone}" that ${b.model} has no part for`);
		}
		writeJson(path.join(rp, 'animations', `${b.id}.animation.json`), anims);
		writeJson(path.join(rp, 'entity', `${b.id}.entity.json`), packs.clientEntity(b));
		writeJson(path.join(rp, 'render_controllers', `${b.id}.render_controllers.json`), packs.renderController(b));
		writeJson(path.join(bp, 'entities', `${b.id}.json`), packs.entity(b));
		writeJson(path.join(bp, 'spawn_rules', `${b.id}.json`), packs.spawnRules(b));
	}
	writeJson(path.join(rp, 'animation_controllers', `${NS}.animation_controllers.json`), packs.animationControllers());

	// Item sprites (the spawn eggs now; the millet spray for a later session) and the perch texture.
	const itemTextures = {};
	for (const p of java.list(`${A}textures/item/`)) {
		const n = path.posix.basename(p, '.png');
		writeFile(path.join(rp, 'textures', 'items', `${n}.png`), java.read(p));
		itemTextures[`${NS}_${n}`] = { textures: `textures/items/${n}` };
		textures++;
	}
	for (const b of birds) if (!itemTextures[`${NS}_${b.id}_spawn_egg`]) fail(`no spawn egg sprite for ${b.id} in the Java repo`);
	writeJson(path.join(rp, 'textures', 'item_texture.json'), { resource_pack_name: 'little_birds', texture_name: 'atlas.items', texture_data: itemTextures });
	writeFile(path.join(rp, 'textures', 'blocks', 'perch.png'), java.read(`${A}textures/block/perch.png`));
	textures++;

	// Sounds: every OGG, the definitions, and which ones each bird plays.
	for (const p of java.list(`${A}sounds/`)) {
		if (!p.endsWith('.ogg')) continue;
		writeFile(path.join(rp, 'sounds', NS, ...p.slice(`${A}sounds/`.length).split('/')), java.read(p));
		sounds++;
	}
	const javaSounds = JSON.parse(java.text(`${A}sounds.json`));
	const defs = soundDefinitions(javaSounds);
	for (const [n, d] of Object.entries(defs.sound_definitions)) {
		for (const s of d.sounds) if (!fs.existsSync(path.join(rp, s.name + '.ogg'))) fail(`${n} plays ${s.name}.ogg, which isn't in the Java repo`);
	}
	writeJson(path.join(rp, 'sounds', 'sound_definitions.json'), defs);
	writeJson(path.join(rp, 'sounds.json'), entitySounds());
	for (const b of birds) if (!defs.sound_definitions[`${NS}.${b.id}_chatter`]) fail(`no ${b.id}_chatter sound in the Java repo`);

	// Names.
	writeFile(path.join(rp, 'texts', 'en_US.lang'), lang(JSON.parse(java.text(`${A}lang/en_us.json`))));
	writeJson(path.join(rp, 'texts', 'languages.json'), ['en_US']);

	// Scripts: TypeScript to JavaScript.
	const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
	if (!fs.existsSync(tsc)) fail('TypeScript is not installed: run npm install');
	fs.rmSync(path.join(root, 'build', 'js'), { recursive: true, force: true });
	cp.execFileSync(process.execPath, [tsc, '-p', path.join(root, 'tsconfig.json')], { stdio: 'inherit' });
	fs.cpSync(path.join(root, 'build', 'js', 'src'), path.join(bp, 'scripts'), { recursive: true });
	fs.cpSync(path.join(root, 'build', 'js', 'test'), path.join(bpTest, 'scripts'), { recursive: true });

	// The .mcaddon: both packs, each in its own folder.
	const files = [];
	for (const [dir, prefix] of [[bp, 'LittleBirds_BP'], [rp, 'LittleBirds_RP']]) {
		(function walk(d) {
			for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
				const p = path.join(d, e.name);
				if (e.isDirectory()) walk(p);
				else files.push({ name: prefix + '/' + path.relative(dir, p).split(path.sep).join('/'), data: fs.readFileSync(p) });
			}
		})(dir);
	}
	const addon = path.join(root, 'dist', `LittleBirds-${pkg.version}.mcaddon`);
	writeFile(addon, zip(files));
	console.log(`built: ${birds.length} birds, ${textures} textures, ${sounds} sounds; ${path.relative(root, addon)} (${files.length} files, ${Math.round(fs.statSync(addon).size / 1024)} KB)`);
}

build();
