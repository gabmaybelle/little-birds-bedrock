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
/** The treat and the snacks (Java's Foods; src/food-logic.ts has the same lists and the rules). */
const MILLET = `${NS}:millet_spray`;
const SNACKS = ['minecraft:carrot', 'minecraft:apple', 'minecraft:melon_slice', 'minecraft:sweet_berries', 'minecraft:glow_berries', 'minecraft:beetroot'];
/** The event a bird's spawn rules fire: a natural spawn, which src/settings.ts looks at. */
const SPAWNED_WILD = `${NS}:spawned_wild`;

// ---------------------------------------------------------------- behaviour pack

function properties(bird) {
	const p = {
		[`${NS}:colour`]: { type: 'int', range: [0, bird.colours.length - 1], default: 0, client_sync: true },
		// Set by the scripts (perch, shoulder, greeting, refused food); the poses read them.
		// perched: on its perch (awake by day or asleep at night); roosting: asleep on it.
		[`${NS}:perched`]: { type: 'bool', default: false, client_sync: true },
		[`${NS}:roosting`]: { type: 'bool', default: false, client_sync: true },
		// Told to sit: the sittable component's sit and stand events keep this, so the scripts can
		// tell (the script API has no way to read it).
		[`${NS}:sitting`]: { type: 'bool', default: false, client_sync: false },
		[`${NS}:shoulder`]: { type: 'bool', default: false, client_sync: true },
		[`${NS}:greeting`]: { type: 'bool', default: false, client_sync: true },
		[`${NS}:shaking`]: { type: 'bool', default: false, client_sync: true },
		// Set by the spawn rules' event on a bird the game spawned on its own; the settings script
		// looks at it the moment the bird appears, then clears it.
		[`${NS}:natural_spawn`]: { type: 'bool', default: false, client_sync: false },
	};
	if (bird.song) p[`${NS}:singing`] = { type: 'bool', default: false, client_sync: true };
	// A lovebird pair's slot (src/pairs.ts): 0 for none; the follow goal reads it.
	if (bird.id === 'lovebird') p[`${NS}:pair`] = { type: 'int', range: [0, PAIR_SLOTS], default: 0, client_sync: false };
	return p;
}

/** How many pair slots there are; src/pair-logic.ts has the same number and says why. */
const PAIR_SLOTS = 15;
/** A chick grows up in 24000 ticks, as on Java. */
const GROW_UP = 1200;
/** A chick is drawn and sized at half its parents' size, as Java's young are (ageScale 0.5). */
const CHICK_SCALE = 0.5;

/**
 * Keeping close (the Java edition's Lovebird.KeepTogetherGoal and ZebraFinch.KeepCompanyGoal): a
 * lovebird flies back to its partner (the lovebird with the same pair slot), a finch to the nearest
 * finch, coming to within 2 blocks; never to one on a shoulder. At the wandering's priority, so the
 * one doesn't cut the other short.
 */
function keepClose(bird) {
	const notOnShoulder = { test: 'bool_property', subject: 'other', domain: `${NS}:shoulder`, operator: '==', value: false };
	if (bird.id === 'lovebird') {
		const sameSlot = [];
		for (let k = 1; k <= PAIR_SLOTS; k++) {
			sameSlot.push({ all_of: [
				{ test: 'int_property', subject: 'self', domain: `${NS}:pair`, operator: '==', value: k },
				{ test: 'int_property', subject: 'other', domain: `${NS}:pair`, operator: '==', value: k },
			] });
		}
		return { 'minecraft:behavior.follow_mob': {
			priority: 4, search_range: 16, stop_distance: 2, speed_multiplier: 1, preferred_actor_type: `${NS}:lovebird`,
			filters: { all_of: [{ test: 'is_family', subject: 'other', value: 'lovebird' }, notOnShoulder, { any_of: sameSlot }] },
		} };
	}
	if (bird.id === 'zebra_finch') {
		return { 'minecraft:behavior.follow_mob': {
			priority: 4, search_range: 8, stop_distance: 2, speed_multiplier: 1, preferred_actor_type: `${NS}:zebra_finch`,
			filters: { all_of: [{ test: 'is_family', subject: 'other', value: 'zebra_finch' }, notOnShoulder] },
		} };
	}
	return {};
}

/** The bird's collision box on a shoulder; src/shoulder-logic.ts has the same number and says why. */
const SHOULDER_BOX = 0.1;

function entity(bird) {
	// What it shrugs off, in every body but the shoulder's.
	const body = {
		'minecraft:damage_sensor': { triggers: { cause: 'fall', deals_damage: 'no' } },
	};
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
				// The one exception to the rule above. The bird's size is here, so a new bird has it
				// from the start and no group sets it as it appears: with a group setting the size on
				// spawning, new wild flocks often stood still (the fly check on Preview 1.26.70: a
				// flock stuck in 7 of 10 runs, against none in 5 with the size here only). The
				// shoulder body shrinks it, and every event that takes the shoulder body off adds
				// own_size, which sets it back, so it is never lost.
				'minecraft:collision_box': { width: bird.width, height: bird.height },
				'minecraft:conditional_bandwidth_optimization': {},
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
					// The millet spray tames on the first try; the food script does that (src/foods.ts) and
					// stops the game's own try. It is listed here so a phone shows the interact button for it.
					'minecraft:tameable': { probability: 0.33, tame_items: [...SEEDS, MILLET], tame_event: { event: 'minecraft:on_tame', target: 'self' } },
				},
				// A grown bird. Breeding is the script's (src/breeding.ts): the game's own breeding didn't
				// finish with flying birds and can't keep a lovebird to its partner. A chick gives no
				// experience, as on Java.
				[`${NS}:adult`]: {
					'minecraft:experience_reward': { on_death: 'query.last_hit_by_player ? Math.Random(1,3) : 0' },
				},
				// A chick: half size, grows up in twenty minutes (seeds hurry it), keeps near a parent.
				[`${NS}:chick`]: {
					'minecraft:is_baby': {},
					'minecraft:scale': { value: CHICK_SCALE },
					// Seeds, the millet spray and the snacks each grow it a little (Java's ageUp for a tenth of
					// the time left). Only this component can change a chick's age, so the food script lets
					// a treat or a snack its owner gives go on to it (src/foods.ts).
					'minecraft:ageable': { duration: GROW_UP, feed_items: [...SEEDS, MILLET, ...SNACKS], grow_up: { event: `${NS}:grown_up`, target: 'self' } },
					'minecraft:behavior.follow_parent': { priority: 5, speed_multiplier: 1.1 },
				},
				[`${NS}:tame`]: {
					'minecraft:is_tamed': {},
					'minecraft:sittable': { sit_event: { event: `${NS}:sat`, target: 'self' }, stand_event: { event: `${NS}:stood`, target: 'self' } },
				},
				// What a tamed bird does when it is free: sits when told, follows its owner.
				[`${NS}:pet_goals`]: {
					'minecraft:behavior.stay_while_sitting': { priority: 2 },
					'minecraft:behavior.follow_owner': { priority: 3, speed_multiplier: 1, start_distance: 5, stop_distance: 1 },
				},
				// A bird free to move: walks and flies about, can be pushed, chatters. The perch script
				// swaps it for held_body (flying home, or awake on the perch) or asleep_body, and the
				// shoulder script for shoulder_body.
				[`${NS}:free_body`]: {
					...body,
					'minecraft:movement': { value: 0.4 },
					'minecraft:pushable': { is_pushable: true, is_pushable_by_piston: true },
					...keepClose(bird),
					// Millet in a hand within 10 blocks wins over wandering and following (Java's TemptGoal at
					// priority 1, its range 10, not scared off). Only a free bird: one on its perch, its
					// seat for the night, or a shoulder isn't moved by it.
					'minecraft:behavior.tempt': { priority: 1, speed_multiplier: 1, within_radius: 10, can_tempt_vertically: true, can_get_scared: false, items: [MILLET] },
					'minecraft:behavior.random_fly': { priority: 4, avoid_damage_blocks: true, can_land_on_trees: true, y_offset: 0, speed_multiplier: 1, xz_dist: 15, y_dist: 1 },
					'minecraft:ambient_sound_interval': { event_name: 'ambient', value: 4, range: 4 },
				},
				// Moved by the script alone (flying home to its perch, sitting on it by day): no
				// movement of its own, no pushing, no goals; it still chatters, as on Java.
				[`${NS}:held_body`]: {
					...body,
					'minecraft:movement': { value: 0 },
					'minecraft:pushable': { is_pushable: false, is_pushable_by_piston: false },
					'minecraft:ambient_sound_interval': { event_name: 'ambient', value: 4, range: 4 },
				},
				// Asleep on its perch for the night: held the same way, and quiet until morning.
				[`${NS}:asleep_body`]: {
					...body,
					'minecraft:movement': { value: 0 },
					'minecraft:pushable': { is_pushable: false, is_pushable_by_piston: false },
				},
				// On its owner's shoulder (src/shoulder.ts): moved by the script alone, like the held
				// body, still chattering. Bedrock pushes a player out of any box that overlaps theirs,
				// so its collision box shrinks to SHOULDER_BOX (it clears the player at every angle);
				// the hit box keeps the bird's own size, so it is as easy to sneak-use off as on. It
				// can't suffocate in a wall beside its owner (Java's shoulder bird has no physics).
				[`${NS}:shoulder_body`]: {
					'minecraft:collision_box': { width: SHOULDER_BOX, height: SHOULDER_BOX },
					'minecraft:custom_hit_test': { hitboxes: [{ pivot: [0, bird.height / 2, 0], width: bird.width, height: bird.height }] },
					'minecraft:damage_sensor': { triggers: [{ cause: 'fall', deals_damage: 'no' }, { cause: 'suffocation', deals_damage: 'no' }] },
					'minecraft:movement': { value: 0 },
					'minecraft:pushable': { is_pushable: false, is_pushable_by_piston: false },
					'minecraft:ambient_sound_interval': { event_name: 'ambient', value: 4, range: 4 },
				},
				// The bird's own size again, once it has been off a shoulder (see the base).
				[`${NS}:own_size`]: {
					'minecraft:collision_box': { width: bird.width, height: bird.height },
				},
			},
			events: {
				// Every new bird (natural spawn, egg, /summon) picks one of its colours at random, as on Java.
				'minecraft:entity_spawned': {
					set_property: { [`${NS}:colour`]: `math.random_integer(0, ${bird.colours.length - 1})` },
					add: { component_groups: [`${NS}:wild`, `${NS}:free_body`, `${NS}:adult`] },
				},
				// A natural spawn (the spawn rules' herd fires this one after the event above): the same,
				// and marked, so the settings script can let it stay or take it away again (Java's spawn
				// check: src/settings.ts). It repeats the above in case it ever runs in its place.
				[SPAWNED_WILD]: {
					set_property: { [`${NS}:colour`]: `math.random_integer(0, ${bird.colours.length - 1})`, [`${NS}:natural_spawn`]: true },
					add: { component_groups: [`${NS}:wild`, `${NS}:free_body`, `${NS}:adult`] },
				},
				// A chick from breeding (src/breeding.ts): wild for the moment it takes to tame it to its
				// parents' owner, free to move; its colour is a parent's, set by the script.
				[`${NS}:born`]: {
					add: { component_groups: [`${NS}:chick`, `${NS}:wild`, `${NS}:free_body`] },
				},
				[`${NS}:grown_up`]: {
					remove: { component_groups: [`${NS}:chick`] },
					add: { component_groups: [`${NS}:adult`] },
				},
				'minecraft:on_tame': {
					add: { component_groups: [`${NS}:tame`, `${NS}:pet_goals`] },
					remove: { component_groups: [`${NS}:wild`] },
				},
				[`${NS}:sat`]: { set_property: { [`${NS}:sitting`]: true } },
				[`${NS}:stood`]: { set_property: { [`${NS}:sitting`]: false } },
				// The perch script's bodies (src/main.ts). Each takes the others off, so the bird is
				// always in exactly one of free_body, held_body and asleep_body.
				[`${NS}:hold`]: {
					add: { component_groups: [`${NS}:held_body`, `${NS}:own_size`] },
					remove: { component_groups: [`${NS}:free_body`, `${NS}:asleep_body`, `${NS}:shoulder_body`, `${NS}:pet_goals`] },
				},
				[`${NS}:sleep`]: {
					add: { component_groups: [`${NS}:asleep_body`, `${NS}:own_size`] },
					remove: { component_groups: [`${NS}:free_body`, `${NS}:held_body`, `${NS}:shoulder_body`, `${NS}:pet_goals`] },
				},
				// The shoulder script's body (src/shoulder.ts).
				[`${NS}:shoulder`]: {
					add: { component_groups: [`${NS}:shoulder_body`] },
					remove: { component_groups: [`${NS}:free_body`, `${NS}:held_body`, `${NS}:asleep_body`, `${NS}:own_size`, `${NS}:pet_goals`] },
				},
				[`${NS}:release`]: {
					add: { component_groups: [`${NS}:free_body`, `${NS}:pet_goals`, `${NS}:own_size`] },
					remove: { component_groups: [`${NS}:held_body`, `${NS}:asleep_body`, `${NS}:shoulder_body`] },
				},
				// A wild bird found without its free body (it never has a perch): just the body back.
				[`${NS}:release_wild`]: {
					add: { component_groups: [`${NS}:free_body`, `${NS}:own_size`] },
					remove: { component_groups: [`${NS}:held_body`, `${NS}:asleep_body`, `${NS}:shoulder_body`] },
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
				// The herd's event marks every bird of it as a natural spawn, for the settings
				// (src/settings.ts). It runs after the bird's own spawn event, as vanilla horses' coat
				// events do. (A condition's spawn_event was tried first: a natural finch came without
				// the mark, in a simulated player's world.)
				'minecraft:herd': { min_size: s.herd[0], max_size: s.herd[1], event: SPAWNED_WILD, event_skip_count: 0 },
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
		`variable.perched = query.property('${NS}:perched');`,
		`variable.roosting = query.property('${NS}:roosting');`,
		`variable.shoulder = query.property('${NS}:shoulder');`,
		`variable.greeting = query.property('${NS}:greeting');`,
		`variable.shaking = query.property('${NS}:shaking');`,
		// 0 flying, 1 standing, 2 sitting (told to, on its perch by day, or on a shoulder), 3 asleep
		// on its perch. A bird on its perch is held by the script, never on the ground or flying.
		'variable.state = variable.roosting ? 3 : ((query.is_sitting || variable.perched || variable.shoulder) ? 2 : ((!query.is_on_ground && !query.is_jumping) ? 0 : 1));',
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

// ---------------------------------------------------------------- the perch

// Java's perch (PerchBlock, models/block/perch.json, recipe/perch.json). The model facing north has
// the bar along x; Java turns it 90 degrees for east and west, and so does the block here. The
// block state is the way the placer faced (the bird on it faces back at them: src/perch-logic.ts).
// Its shape, as Java's, is the base, the post and the bar; Bedrock takes one collision box, so it
// is the base's footprint up to the top of the bar (a bird stands on it at the seat height), and the
// selection box is the bar's length across. Ambient occlusion 0 is the exponent on the shading:
// none, as the spike's false (the schema now takes a number).
function perchBlock() {
	return {
		format_version: '1.26.0',
		'minecraft:block': {
			description: {
				identifier: `${NS}:perch`,
				// Java puts it with the functional blocks; Bedrock's nearest is the items tab.
				menu_category: { category: 'items' },
				traits: { 'minecraft:placement_direction': { enabled_states: ['minecraft:cardinal_direction'] } },
			},
			components: {
				'minecraft:geometry': `geometry.${NS}.perch`,
				'minecraft:material_instances': { '*': { texture: `${NS}_perch`, render_method: 'alpha_test', ambient_occlusion: 0 } },
				'minecraft:collision_box': { origin: [-3, 0, -3], size: [6, 12, 6] },
				'minecraft:selection_box': { origin: [-6, 0, -3], size: [12, 12, 6] },
				// Needs a block under it, like a candle: it goes only on top of a block, and pops off
				// when that block goes.
				'minecraft:placement_filter': { conditions: [{ allowed_faces: ['up'] }] },
				// Java's strength 0.5, wood.
				'minecraft:destructible_by_mining': { seconds_to_destroy: 0.5 },
				'minecraft:destructible_by_explosion': { explosion_resistance: 0.5 },
				'minecraft:light_dampening': 0,
				'minecraft:map_color': '#8f7748',
			},
			permutations: [
				{
					condition: "q.block_state('minecraft:cardinal_direction') == 'east' || q.block_state('minecraft:cardinal_direction') == 'west'",
					components: {
						'minecraft:transformation': { rotation: [0, 90, 0] },
						'minecraft:selection_box': { origin: [-3, 0, -6], size: [6, 12, 12] },
					},
				},
			],
		},
	};
}

// Java's shaped recipe as Bedrock's: same pattern and keys (a tag stays a tag), unlocked by what
// Java's advancement unlocks it with (holding the first ingredient, string).
function perchRecipe(javaRecipe) {
	const key = {};
	for (const [k, v] of Object.entries(javaRecipe.key)) key[k] = v.startsWith('#') ? { tag: v.slice(1) } : { item: v };
	const first = javaRecipe.pattern.join('').replace(/\s/g, '')[0];
	return {
		format_version: '1.20.10',
		'minecraft:recipe_shaped': {
			description: { identifier: javaRecipe.result.id },
			tags: ['crafting_table'],
			pattern: javaRecipe.pattern,
			key,
			unlock: [key[first]],
			result: { item: javaRecipe.result.id },
		},
	};
}

// A Java block model (elements in 0..16 block space, face uv as [u1, v1, u2, v2]) as Bedrock block
// geometry (x and z centred on the block, -8..8, y 0..16; per-face uv as a corner and a size). Faces
// Java leaves out (the post's ends) are left out here too, so they don't render.
function blockModelToGeo(javaModel, identifier, textureSize = 16) {
	const cubes = javaModel.elements.map((el) => {
		if (el.rotation && el.rotation.angle) throw new Error(`${identifier}: rotated elements are not converted`);
		const uv = {};
		for (const [face, f] of Object.entries(el.faces)) uv[face] = { uv: [f.uv[0], f.uv[1]], uv_size: [f.uv[2] - f.uv[0], f.uv[3] - f.uv[1]] };
		return {
			origin: [el.from[0] - 8, el.from[1], el.from[2] - 8],
			size: [el.to[0] - el.from[0], el.to[1] - el.from[1], el.to[2] - el.from[2]],
			uv,
		};
	});
	return {
		format_version: '1.21.0',
		'minecraft:geometry': [{
			description: {
				identifier, texture_width: textureSize, texture_height: textureSize,
				visible_bounds_width: 2, visible_bounds_height: 1.5, visible_bounds_offset: [0, 0.75, 0],
			},
			bones: [{ name: 'perch', pivot: [0, 0, 0], cubes }],
		}],
	};
}

// ---------------------------------------------------------------- the foods

// Java's millet spray (Foods.MILLET_SPRAY): a plain item, in the food part of the creative menu, its
// sprite and name from the Java repo. What it does is the food script's (src/foods.ts).
function milletItem() {
	return {
		format_version: '1.21.60',
		'minecraft:item': {
			description: { identifier: MILLET, menu_category: { category: 'equipment', group: 'minecraft:itemGroup.name.miscFood' } },
			components: {
				'minecraft:icon': `${NS}_millet_spray`,
				'minecraft:display_name': { value: `item.${NS}.millet_spray` },
				'minecraft:max_stack_size': 64,
			},
		},
	};
}

// Java's shapeless recipe as Bedrock's: the same ingredients (a repeated one as a count) and result,
// unlocked by what Java's recipe advancement unlocks it with (the items its inventory check names).
function shapelessRecipe(javaRecipe, javaAdvancement) {
	const counts = new Map();
	for (const i of javaRecipe.ingredients) counts.set(i, (counts.get(i) || 0) + 1);
	const ingredients = [...counts].map(([item, count]) => (item.startsWith('#') ? { tag: item.slice(1), count } : { item, count }));
	const unlock = [];
	for (const c of Object.values(javaAdvancement.criteria)) {
		if (c.trigger !== 'minecraft:inventory_changed') continue;
		for (const i of c.conditions.items) unlock.push({ item: i.items });
	}
	return {
		format_version: '1.20.10',
		'minecraft:recipe_shapeless': {
			description: { identifier: javaRecipe.result.id },
			tags: ['crafting_table'],
			unlock,
			ingredients,
			result: { item: javaRecipe.result.id, count: javaRecipe.result.count || 1 },
		},
	};
}

// The crumbs a snack leaves (Java: ITEM particles of the snack, 6, spread 0.1, speed 0.05): bits of
// the snack's own vanilla sprite, a quarter of it each, falling like Bedrock's item-break bits. One
// particle per snack, since a particle's texture is fixed.
function crumbs(snack) {
	const name = snack.replace('minecraft:', '');
	// The vanilla sprite's name where it differs from the item's.
	const sprite = { melon_slice: 'melon' }[name] || name;
	return {
		format_version: '1.10.0',
		particle_effect: {
			description: {
				identifier: `${NS}:crumbs_${name}`,
				basic_render_parameters: { material: 'particles_alpha', texture: `textures/items/${sprite}` },
			},
			components: {
				'minecraft:emitter_rate_instant': { num_particles: 6 },
				'minecraft:emitter_lifetime_once': { active_time: 0 },
				'minecraft:emitter_shape_point': {
					offset: ['math.random(-0.1, 0.1)', 'math.random(-0.1, 0.1)', 'math.random(-0.1, 0.1)'],
					direction: ['math.random(-1, 1)', 'math.random(0, 1)', 'math.random(-1, 1)'],
				},
				'minecraft:particle_lifetime_expression': { max_lifetime: '0.2 / (math.random(0, 1) * 0.9 + 0.1)' },
				'minecraft:particle_initial_speed': 'math.random(0.5, 1.5)',
				'minecraft:particle_motion_dynamic': { linear_acceleration: [0, -9.8, 0], linear_drag_coefficient: 0.5 },
				'minecraft:particle_motion_collision': { collision_drag: 5, coefficient_of_restitution: 0.1, collision_radius: 0.05 },
				'minecraft:particle_appearance_billboard': {
					size: ['variable.particle_random_1 * 0.04 + 0.04', 'variable.particle_random_1 * 0.04 + 0.04'],
					facing_camera_mode: 'lookat_xyz',
					uv: { texture_width: 16, texture_height: 16, uv: ['math.floor(variable.particle_random_3 * 12)', 'math.floor(variable.particle_random_4 * 12)'], uv_size: [4, 4] },
				},
				'minecraft:particle_appearance_lighting': {},
			},
		},
	};
}

module.exports = { NS, MILLET, SNACKS, SEEDS, SPAWNED_WILD, entity, spawnRules, clientEntity, renderController, animations, animationControllers, perchBlock, perchRecipe, blockModelToGeo, milletItem, shapelessRecipe, crumbs };
