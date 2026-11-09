// The five birds: one table, so the generated entity, model, animation, sound and spawn files can't
// drift apart. Numbers come from the Java edition (Birds.java, each bird's class and model class);
// where Bedrock needs a different number, the reason is next to it.
'use strict';

// Java radians per tick -> Molang degrees per second of query.anim_time (20 ticks a second).
const perTick = (rad) => Math.round(rad * 20 * (180 / Math.PI) * 10) / 10;
const deg = (rad) => Math.round(rad * (180 / Math.PI) * 100) / 100;

const birds = [
	{
		id: 'budgie',
		model: 'BudgieModel',
		// Java's EntityType size (width, height) and health.
		width: 0.4, height: 0.7, health: 5,
		// Colours in the Java order (Budgie.Colour); the number is the colour property's value.
		colours: ['green', 'blue', 'yellow', 'white'],
		tails: ['tail'],
		// How far the body drops when it sits or roosts, and how much further the head sinks asleep.
		sitDrop: 1.4, roostHead: 0.8,
		walkBob: 0.6,
		greeting: { ticks: 30, rate: 0.9, lift: 1.2, nod: 0.25, nodBias: 0, wings: 0.5 },
		// Natural spawns. Java's weights (savanna 15, jungle 10) filled the savanna on Bedrock,
		// whose weights work differently; the spike's 5 and 4 with flocks of 2 to 3 looked right,
		// and the other birds keep Java's proportions to the budgie (a third of Java's weight).
		spawns: [
			{ tag: 'savanna', weight: 5, herd: [2, 3], on: ['minecraft:grass_block'] },
			{ tag: 'jungle', weight: 4, herd: [2, 3], on: ['minecraft:grass_block', 'minecraft:oak_leaves', 'minecraft:jungle_leaves'] },
		],
	},
	{
		id: 'cockatiel',
		model: 'CockatielModel',
		width: 0.5, height: 0.9, health: 6,
		colours: ['grey', 'lutino', 'whiteface'],
		tails: ['tail'],
		sitDrop: 2.0, roostHead: 0.8,
		walkBob: 0.6,
		greeting: { ticks: 40, rate: 0.7, lift: 1.0, nod: 0.2, nodBias: -0.15, wings: 0.4 },
		// The crest lifts (CREST_CALM -1.1 to CREST_UP -0.25) while it greets or flies, and lies
		// flatter (0.3 more) asleep.
		crest: { up: deg(-0.25 - -1.1), asleep: deg(-0.3) },
		spawns: [{ tag: 'savanna', weight: 3, herd: [2, 3], on: ['minecraft:grass_block'] }],
	},
	{
		id: 'lovebird',
		model: 'LovebirdModel',
		width: 0.4, height: 0.7, health: 5,
		colours: ['peach', 'fischer', 'blue'],
		tails: ['tail'],
		sitDrop: 1.4, roostHead: 0.8,
		walkBob: 0.6,
		greeting: { ticks: 30, rate: 0.9, lift: 1.2, nod: 0.25, nodBias: 0, wings: 0.5 },
		spawns: [{ tag: 'savanna', weight: 2, herd: [2, 2], on: ['minecraft:grass_block'] }],
	},
	{
		id: 'canary',
		model: 'CanaryModel',
		width: 0.35, height: 0.5, health: 4,
		colours: ['yellow', 'red', 'white'],
		tails: ['left_tail', 'right_tail'],
		sitDrop: 1.4, roostHead: 0.7,
		walkBob: 0.5,
		greeting: { ticks: 30, rate: 0.9, lift: 1.0, nod: 0.25, nodBias: 0, wings: 0.5 },
		// The song pose: head up, beak opening in time, tail flicking; about seven seconds.
		song: { ticks: 140, headUp: 0.45, headLift: 0.3, beakRate: 1.4, tailRate: 0.35, tailFlick: 0.25 },
		spawns: [{ tags: ['flower_forest', 'meadow', 'cherry_grove'], weight: 3, herd: [2, 3], on: ['minecraft:grass_block'] }],
	},
	{
		id: 'zebra_finch',
		model: 'ZebraFinchModel',
		width: 0.3, height: 0.45, health: 3,
		colours: ['grey', 'fawn', 'white'],
		tails: ['tail'],
		sitDrop: 1.4, roostHead: 0.6,
		walkBob: 0.5,
		greeting: { ticks: 30, rate: 0.9, lift: 0.9, nod: 0.25, nodBias: 0, wings: 0.5 },
		// A phrase: a second and a half.
		song: { ticks: 30, headUp: 0.35, headLift: 0.2, beakRate: 1.8, tailRate: 0.5, tailFlick: 0.3 },
		spawns: [{ tag: 'plains', weight: 2, herd: [3, 3], on: ['minecraft:grass_block'] }],
	},
];

module.exports = { birds, perTick, deg };
