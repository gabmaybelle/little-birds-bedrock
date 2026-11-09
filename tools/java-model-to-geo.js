#!/usr/bin/env node
// Turns one of Little Birds' Java model classes (vanilla-style EntityModel code: addOrReplaceChild,
// CubeListBuilder.addBox, PartPose.offset / offsetAndRotation) into Bedrock geometry JSON, box for
// box, so the Bedrock bird is the same shape as the Java one and wears the same texture.
//
//   node tools/java-model-to-geo.js <BudgieModel.java> <geometry.identifier> <out.geo.json> [--negate-xy]
//
// The build calls convert() directly on the model classes it reads from the Java repo.
//
// Mapping, checked against vanilla's parrot in both editions (ParrotModel.java vs parrot.geo.json):
// Java models run y downward from 0 at the top of a block to 24 at the ground, Bedrock models run y
// upward from 0 at the ground; x and z are the same in both. So a pivot (x, y, z) becomes
// (x, 24 - y, z) and a box's bottom corner becomes (px + x0, 24 - (py + y0 + h), pz + z0). Child parts
// in Java are placed relative to their parent's pivot; Bedrock bones are placed in model space, so
// the offsets are summed down the chain. Rotation signs: Bedrock rotates in degrees with the same
// signs as Java on all three axes (checked in the game on the budgie: it leans forward in one
// piece); --negate-xy applies the other rule, x and y negated, in case a model ever needs it.
'use strict';
const fs = require('fs');

function convert(java, identifier, { negateXY = false } = {}) {
	// Named float constants (private static final float CREST_CALM = -1.1F;) are used in poses.
	const constants = new Map();
	for (const m of java.matchAll(/static\s+final\s+float\s+(\w+)\s*=\s*([^;]+);/g)) constants.set(m[1], m[2]);

	// A Java float expression ("-1.5F", "(float) -Math.PI", "(float) (Math.PI / 2)", a constant) as a number.
	function num(expr) {
		let s = expr.trim();
		if (constants.has(s)) s = constants.get(s);
		s = s.replace(/\(float\)/g, '').replace(/(\d)[Ff]\b/g, '$1').replace(/Math\.PI/g, String(Math.PI)).replace(/Mth\.HALF_PI/g, String(Math.PI / 2)).trim();
		if (!/^[\d\s.+\-*/()eE]+$/.test(s)) throw new Error('not a number: ' + expr);
		return Function('"use strict"; return (' + s + ');')();
	}
	const args = (s) => s.split(',').map((a) => num(a));

	// Texture size: LayerDefinition.create(mesh, W, H).
	const tex = /LayerDefinition\.create\(\s*\w+\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(java);
	if (!tex) throw new Error('no LayerDefinition.create(mesh, w, h) found');
	const texW = +tex[1], texH = +tex[2];

	// Cubes from a CubeListBuilder chain: every addBox takes the texOffs and mirror set before it.
	function cubesOf(chain) {
		const cubes = [];
		let uv = [0, 0], mirror = false;
		const re = /\.(texOffs|mirror|addBox)\(([^)]*)\)/g;
		let m;
		while ((m = re.exec(chain))) {
			if (m[1] === 'texOffs') uv = args(m[2]);
			else if (m[1] === 'mirror') mirror = true;
			else {
				const a = args(m[2]);
				cubes.push({ x0: a[0], y0: a[1], z0: a[2], w: a[3], h: a[4], d: a[5], uv: uv.slice(), mirror });
			}
		}
		return cubes;
	}

	// Named builders: CubeListBuilder leg = CubeListBuilder.create()...;
	const builders = new Map();
	for (const m of java.matchAll(/CubeListBuilder\s+(\w+)\s*=\s*(CubeListBuilder\.create\(\)[^;]*);/g)) builders.set(m[1], m[2]);

	// PartDefinition variables name their part: PartDefinition head = root.addOrReplaceChild("head", ...
	const partVars = new Map([['root', null]]);
	for (const m of java.matchAll(/PartDefinition\s+(\w+)\s*=\s*\w+\.addOrReplaceChild\(\s*"(\w+)"/g)) partVars.set(m[1], m[2]);

	const parts = new Map(); // name -> { parent, offset, rotation, cubes }
	// The pose arguments may hold "(float) -Math.PI", so one level of brackets is allowed inside them.
	const callRe = /(\w+)\.addOrReplaceChild\(\s*"(\w+)"\s*,\s*([\s\S]*?),\s*PartPose\.(offset|offsetAndRotation)\(((?:[^()]|\([^()]*\))*)\)\s*\)/g;
	let m;
	while ((m = callRe.exec(java))) {
		const [, receiver, name, builderExpr, poseKind, poseArgs] = m;
		if (!partVars.has(receiver)) throw new Error(`part "${name}" is added to "${receiver}", which is not a known PartDefinition`);
		const chain = builders.get(builderExpr.trim()) || builderExpr;
		const pose = args(poseArgs);
		parts.set(name, {
			parent: partVars.get(receiver),
			offset: pose.slice(0, 3),
			rotation: poseKind === 'offsetAndRotation' ? pose.slice(3, 6) : [0, 0, 0],
			cubes: cubesOf(chain),
		});
	}
	if (!parts.size) throw new Error('no addOrReplaceChild calls found');

	// Model-space pivot: the part's offset plus its parents' offsets.
	function pivotOf(name) {
		const p = parts.get(name);
		const base = p.parent ? pivotOf(p.parent) : [0, 0, 0];
		return [base[0] + p.offset[0], base[1] + p.offset[1], base[2] + p.offset[2]];
	}
	const deg = (r) => Math.round((r * 180) / Math.PI * 1000) / 1000;
	const r3 = (v) => Math.round(v * 1000) / 1000;

	const bones = [];
	for (const [name, p] of parts) {
		const [px, py, pz] = pivotOf(name);
		const bone = { name, pivot: [r3(px), r3(24 - py), r3(pz)] };
		if (p.parent) bone.parent = p.parent;
		const [rx, ry, rz] = p.rotation;
		if (rx || ry || rz) bone.rotation = negateXY ? [deg(-rx), deg(-ry), deg(rz)] : [deg(rx), deg(ry), deg(rz)];
		bone.cubes = p.cubes.map((c) => {
			const cube = {
				origin: [r3(px + c.x0), r3(24 - (py + c.y0 + c.h)), r3(pz + c.z0)],
				size: [c.w, c.h, c.d],
				uv: c.uv,
			};
			if (c.mirror) cube.mirror = true;
			return cube;
		});
		bones.push(bone);
	}

	return {
		format_version: '1.21.0',
		'minecraft:geometry': [
			{
				description: {
					identifier,
					texture_width: texW,
					texture_height: texH,
					visible_bounds_width: 2,
					visible_bounds_height: 1.5,
					visible_bounds_offset: [0, 0.5, 0],
				},
				bones,
			},
		],
	};
}

module.exports = { convert };

if (require.main === module) {
	const [, , src, identifier, out, ...flags] = process.argv;
	if (!src || !identifier || !out) {
		console.error('usage: node tools/java-model-to-geo.js <Model.java> <geometry.identifier> <out.geo.json> [--negate-xy]');
		process.exit(2);
	}
	const negateXY = flags.includes('--negate-xy');
	const geo = convert(fs.readFileSync(src, 'utf8'), identifier, { negateXY });
	fs.writeFileSync(out, JSON.stringify(geo, null, '\t') + '\n');
	const bones = geo['minecraft:geometry'][0].bones;
	console.log(`${out}: ${bones.length} bones, ${bones.reduce((n, b) => n + b.cubes.length, 0)} cubes${negateXY ? ', x and y rotations negated' : ''}`);
}
