// The generated pack files for each bird: its behaviour entity, spawn rules, client entity, render
// controller and animations, plus the animation controllers all the birds share. tools/build.js
// writes them; tools/birds.js holds the numbers.
//
// Rule from the spike: a component that a component group sets is never also in the base
// components. Removing a group takes its components away but doesn't bring a base value back, so a
// base value under a group is lost for good (birds froze that way). Movement, pushing and the
// wandering live only in swapped groups.
'use strict';
const { perTick, deg } = require('./birds.js');

const NS = 'little_birds';
const SEEDS = ['wheat_seeds', 'pumpkin_seeds', 'melon_seeds', 'beetroot_seeds', 'pitcher_pod', 'torchflower_seeds'];

// ---------------------------------------------------------------- behaviour pack

function properties(bird) {
	const p = {
		[`${NS}:colour`]: { type: 'int', range: [0, bird.colours.length - 1], default: 0, client_sync: true },
		// Set by the scripts of later sessions (perch, shoulder, greeting, refused food); the poses
		// that read them are already in the resource pack.
		[`${NS}:roosting`]: { type: 'bool', default: false, client_sync: true },
		[`${NS}:shoulder`]: { type: 'bool', default: false, client_sync: true },
		[`${NS}:greeting`]: { type: 'bool', default: false, client_sync: true },
		[`${NS}:shaking`]: { type: 'bool', default: false, client_sync: true },
	};
	if (bird.song) p[`${NS}:singing`] = { type: 'bool', default: false, client_sync: true };
	return p;
}

function entity(bird) {
	return {
		format_version: '1.26.0',
		'minecraft:entity': {
			description: {
				identifier: `${NS}:${bird.id}`,
				is_spawnable: true,
				is_summonable: true,
				spawn_category: 'creature',
				properties: properties(bird),
			},
			components: {
				'minecraft:type_family': { family: ['little_bird', bird.id, 'mob'] },
				'minecraft:behavior.float': { priority: 1 },
				'minecraft:behavior.panic': { priority: 1, speed_multiplier: 1.25 },
				'minecraft:behavior.look_at_player': { priority: 2, look_distance: 8, look_time: { min: 1, max: 2 } },
				'minecraft:breathable': { suffocate_time: 0, total_supply: 15 },
				'minecraft:can_fly': {},
				'minecraft:collision_box': { width: bird.width, height: bird.height },
				'minecraft:conditional_bandwidth_optimization': {},
				'minecraft:damage_sensor': { triggers: { cause: 'fall', deals_damage: 'no' } },
				'minecraft:experience_reward': { on_death: 'query.last_hit_by_player ? Math.Random(1,3) : 0' },
				'minecraft:game_event_movement_tracking': { emit_flap: true },
				'minecraft:health': { max: bird.health, value: bird.health },
				'minecraft:hurt_on_condition': {
					damage_conditions: [{ cause: 'lava', damage_per_tick: 4, filters: { test: 'in_lava', subject: 'self', operator: '==', value: true } }],
				},
				'minecraft:is_hidden_when_invisible': {},
				'minecraft:jump.static': {},
				'minecraft:leashable': {},
				'minecraft:movement.fly': {},
				'minecraft:nameable': {},
				'minecraft:navigation.fly': { can_path_from_air: true, can_path_over_water: true },
				'minecraft:physics': {},
			},
			component_groups: {
				// A wild bird: seeds tame it, a third of the time, as on Java; far from players it
				// may despawn, like a vanilla parrot.
				[`${NS}:wild`]: {
					'minecraft:despawn': { despawn_from_distance: {} },
					'minecraft:tameable': { probability: 0.33, tame_items: SEEDS, tame_event: { event: 'minecraft:on_tame', target: 'self' } },
				},
				[`${NS}:tame`]: {
					'minecraft:is_tamed': {},
					'minecraft:sittable': {},
				},
				// What a tamed bird does when it is free: sits when told, follows its owner.
				[`${NS}:pet_goals`]: {
					'minecraft:behavior.stay_while_sitting': { priority: 2 },
					'minecraft:behavior.follow_owner': { priority: 3, speed_multiplier: 1, start_distance: 5, stop_distance: 1 },
				},
				// A bird free to move: walks and flies about, can be pushed, chatters. Later sessions
				// swap this for a roosting or held group.
				[`${NS}:free_body`]: {
					'minecraft:movement': { value: 0.4 },
					'minecraft:pushable': { is_pushable: true, is_pushable_by_piston: true },
					'minecraft:behavior.random_fly': { priority: 4, avoid_damage_blocks: true, can_land_on_trees: true, y_offset: 0, speed_multiplier: 1, xz_dist: 15, y_dist: 1 },
					'minecraft:ambient_sound_interval': { event_name: 'ambient', value: 4, range: 4 },
				},
			},
			events: {
				// Every new bird (natural spawn, egg, /summon) picks one of its colours at random, as on Java.
				'minecraft:entity_spawned': {
					set_property: { [`${NS}:colour`]: `math.random_integer(0, ${bird.colours.length - 1})` },
					add: { component_groups: [`${NS}:wild`, `${NS}:free_body`] },
				},
				'minecraft:on_tame': {
					add: { component_groups: [`${NS}:tame`, `${NS}:pet_goals`] },
					remove: { component_groups: [`${NS}:wild`] },
				},
			},
		},
	};
}

function spawnRules(bird) {
	return {
		format_version: '1.8.0',
		'minecraft:spawn_rules': {
			description: { identifier: `${NS}:${bird.id}`, population_control: 'animal' },
			// One condition per biome tag: a biome carries only one of a bird's tags, so this is the
			// same as one condition over any of them, in the shape most vanilla spawn rules use.
			conditions: bird.spawns.flatMap((s) => (s.tags || [s.tag]).map((tag) => ({
				'minecraft:spawns_on_surface': {},
				'minecraft:spawns_on_block_filter': s.on.length === 1 ? s.on[0] : s.on,
				'minecraft:brightness_filter': { min: 7, max: 15, adjust_for_weather: false },
				'minecraft:weight': { default: s.weight },
				'minecraft:herd': { min_size: s.herd[0], max_size: s.herd[1] },
				'minecraft:biome_filter': { test: 'has_biome_tag', operator: '==', value: tag },
			}))),
		},
	};
}

// ---------------------------------------------------------------- resource pack

function clientEntity(bird) {
	const textures = {};
	for (const c of bird.colours) textures[c] = `textures/entity/${bird.id}/${bird.id}_${c}`;
	const animations = {
		look_at_target: 'animation.common.look_at_target',
		flying: `animation.${NS}.${bird.id}.flying`,
		standing: `animation.${NS}.${bird.id}.standing`,
		sitting: `animation.${NS}.${bird.id}.sitting`,
		roosting: `animation.${NS}.${bird.id}.roosting`,
		greeting: `animation.${NS}.${bird.id}.greeting`,
		shake: `animation.${NS}.${bird.id}.shake`,
	};
	const controllers = [{ pose: `controller.animation.${NS}.pose` }, { extras: `controller.animation.${NS}.extras` }];
	const pre = [
		`variable.roosting = query.property('${NS}:roosting');`,
		`variable.shoulder = query.property('${NS}:shoulder');`,
		`variable.greeting = query.property('${NS}:greeting');`,
		`variable.shaking = query.property('${NS}:shaking');`,
		// 0 flying, 1 standing, 2 sitting (told to, or on a shoulder), 3 asleep on its perch.
		'variable.state = variable.roosting ? 3 : ((query.is_sitting || variable.shoulder) ? 2 : ((!query.is_on_ground && !query.is_jumping) ? 0 : 1));',
		// Java's flap angle: (sin(flap) + 1) * flap speed, in radians. The game's own
		// query.wing_flap_position and wing_flap_speed stay 0 for add-on mobs (only its parrot and
		// chicken fill them), so the bird keeps its own, as LittleBird.calculateFlapping does: the
		// flap speed jumps to 1 off the ground and fades over a few ticks once landed, and the wings
		// beat 2 radians a tick (2292 degrees a second).
		'variable.flap_speed = math.clamp((variable.flap_speed ?? 0.0) + ((!query.is_on_ground && !query.is_riding) ? 24.0 : -6.0) * query.delta_time, 0.0, 1.0);',
		'variable.wing_flap = (math.sin(query.life_time * 2292.0) + 1.0) * variable.flap_speed;',
	];
	if (bird.song) {
		animations.singing = `animation.${NS}.${bird.id}.singing`;
		controllers.push({ song: `controller.animation.${NS}.song` });
		pre.push(`variable.singing = query.property('${NS}:singing');`);
	}
	if (bird.crest) {
		animations.crest_up = `animation.${NS}.${bird.id}.crest_up`;
		controllers.push({ crest: `controller.animation.${NS}.crest` });
	}
	return {
		// 1.8.0: the format that takes a list of animation controllers (a 1.10.0 client entity
		// rejects the list and the whole bird with it, which showed as a white box).
		format_version: '1.8.0',
		'minecraft:client_entity': {
			description: {
				identifier: `${NS}:${bird.id}`,
				materials: { default: 'parrot' },
				textures,
				geometry: { default: `geometry.${NS}.${bird.id}` },
				scripts: { pre_animation: pre },
				animations,
				animation_controllers: controllers,
				render_controllers: [`controller.render.${NS}.${bird.id}`],
				spawn_egg: { texture: `${NS}_${bird.id}_spawn_egg`, texture_index: 0 },
			},
		},
	};
}

function renderController(bird) {
	return {
		format_version: '1.8.0',
		render_controllers: {
			[`controller.render.${NS}.${bird.id}`]: {
				arrays: { textures: { 'Array.skins': bird.colours.map((c) => `Texture.${c}`) } },
				geometry: 'Geometry.default',
				materials: [{ '*': 'Material.default' }],
				textures: [`Array.skins[query.property('${NS}:colour')]`],
			},
		},
	};
}

// The poses, from each Java model's setupAnim. Java's y runs down and Bedrock's up, so Java's
// "y += d" is a position of -d here; rotations keep Java's signs, in degrees. Bedrock adds the
// animations that play together, so the greeting and the other extras add to the pose underneath.
function animations(bird) {
	const a = {};
	const name = (k) => `animation.${NS}.${bird.id}.${k}`;
	const moving = ['body', 'head', 'left_wing', 'right_wing', ...bird.tails];
	const wingRest = 5.0; // Java's 0.0873 rad

	const flyBob = '-variable.wing_flap * 0.3';
	const flying = {};
	for (const b of moving) flying[b] = { position: [0, flyBob, 0] };
	flying.left_wing.rotation = [0, 0, `-${wingRest} - variable.wing_flap * 57.3 * 1.6`];
	flying.right_wing.rotation = [0, 0, `${wingRest} + variable.wing_flap * 57.3 * 1.6`];
	flying.left_leg = { rotation: [deg(0.7), 0, 0] };
	flying.right_leg = { rotation: [deg(0.7), 0, 0] };
	a[name('flying')] = { loop: true, bones: flying };

	// Little steps; the head bobs with them. Vanilla's walk: cos(distance * 38.17) * 80 * speed.
	const step = 'math.cos(query.modified_distance_moved * 38.17) * 80.0 * query.modified_move_speed';
	a[name('standing')] = {
		loop: true,
		bones: {
			head: { position: [0, `-math.abs(math.sin(query.modified_distance_moved * 38.17)) * ${bird.walkBob} * query.modified_move_speed`, 0] },
			// While it greets, the greeting moves the wings instead.
			left_wing: { rotation: [0, 0, `-${wingRest} - (variable.greeting ? 0.0 : variable.wing_flap * 57.3)`] },
			right_wing: { rotation: [0, 0, `${wingRest} + (variable.greeting ? 0.0 : variable.wing_flap * 57.3)`] },
			left_leg: { rotation: [step, 0, 0] },
			right_leg: { rotation: [`-${step}`, 0, 0] },
		},
	};

	const settled = (asleep) => {
		const bones = {};
		for (const b of moving) bones[b] = { position: [0, -bird.sitDrop, 0] };
		for (const t of bird.tails) bones[t].rotation = [deg(0.3), 0, 0];
		bones.left_wing.rotation = [0, 0, -wingRest];
		bones.right_wing.rotation = [0, 0, wingRest];
		bones.left_leg = { position: [0, -bird.sitDrop, 0], rotation: [90, 0, 0] };
		bones.right_leg = { position: [0, -bird.sitDrop, 0], rotation: [90, 0, 0] };
		if (asleep) {
			// The head sinks into the shoulders, turned a little to one side (the look is off).
			bones.head = { position: [0, -(bird.sitDrop + bird.roostHead), 0], rotation: [deg(0.5), deg(0.6), 0] };
			if (bird.crest) bones.crest = { rotation: [bird.crest.asleep, 0, 0] };
		}
		return { loop: true, bones };
	};
	a[name('sitting')] = settled(false);
	a[name('roosting')] = settled(true);

	// Hello: head bobs and a flutter of the wings. Plays while the greeting property is on; the
	// script turns it off after the Java length (g.ticks).
	const g = bird.greeting;
	const wave = `math.sin(query.anim_time * ${perTick(g.rate)})`;
	const nod = g.nodBias ? `${wave} * ${deg(g.nod)} + ${deg(g.nodBias)}` : `${wave} * ${deg(g.nod)}`;
	a[name('greeting')] = {
		loop: true,
		bones: {
			head: { position: [0, `-math.abs(${wave}) * ${g.lift}`, 0], rotation: [nod, 0, 0] },
			// Flying keeps its own wing beat.
			left_wing: { rotation: [0, 0, `variable.state == 0 ? 0.0 : -math.abs(${wave}) * ${deg(g.wings)}`] },
			right_wing: { rotation: [0, 0, `variable.state == 0 ? 0.0 : math.abs(${wave}) * ${deg(g.wings)}`] },
		},
	};

	// No, thank you: a quick shake of the head (a refused food; one second on Java).
	a[name('shake')] = { loop: true, bones: { head: { rotation: [0, `math.sin(query.anim_time * ${perTick(1.3)}) * ${deg(0.5)}`, 0] } } };

	if (bird.song) {
		const s = bird.song;
		const tail = `math.abs(math.sin(query.anim_time * ${perTick(s.tailRate)})) * ${deg(s.tailFlick)}`;
		const bones = {
			head: { position: [0, s.headLift, 0], rotation: [-deg(s.headUp), 0, 0] },
			beak: { rotation: [`math.abs(math.sin(query.anim_time * ${perTick(s.beakRate)})) * ${deg(0.35)}`, 0, 0] },
		};
		for (const t of bird.tails) bones[t] = { rotation: [tail, 0, 0] };
		a[name('singing')] = { loop: true, bones };
	}
	if (bird.crest) a[name('crest_up')] = { loop: true, bones: { crest: { rotation: [bird.crest.up, 0, 0] } } };

	return { format_version: '1.8.0', animations: a };
}

// Shared by every bird: they name their animations the same.
function animationControllers() {
	const states = ['flying', 'standing', 'sitting', 'roosting'];
	const pose = {};
	states.forEach((s) => {
		pose[s] = { animations: [s], transitions: states.filter((o) => o !== s).map((o) => ({ [o]: `variable.state == ${states.indexOf(o)}` })) };
	});
	return {
		format_version: '1.10.0',
		animation_controllers: {
			[`controller.animation.${NS}.pose`]: { initial_state: 'standing', states: pose },
			[`controller.animation.${NS}.extras`]: {
				initial_state: 'default',
				states: { default: { animations: [{ look_at_target: '!variable.roosting' }, { greeting: 'variable.greeting' }, { shake: 'variable.shaking' }] } },
			},
			[`controller.animation.${NS}.song`]: {
				initial_state: 'default',
				states: { default: { animations: [{ singing: 'variable.singing' }] } },
			},
			[`controller.animation.${NS}.crest`]: {
				initial_state: 'default',
				states: { default: { animations: [{ crest_up: '!variable.roosting && (variable.greeting || variable.state == 0)' }] } },
			},
		},
	};
}

module.exports = { NS, entity, spawnRules, clientEntity, renderController, animations, animationControllers };
