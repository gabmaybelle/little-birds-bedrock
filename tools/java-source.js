// Reads files from the Java edition's repo (gabmaybelle/little-birds) at one git ref, without
// checking anything out: the art, sounds, names and model classes the Bedrock packs are built from.
// The repo is ../little-birds if it is there (or the folder given), else a clone in .cache/.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'java-source.json'), 'utf8'));

function javaRepo({ dir = null, ref = source.ref } = {}) {
	if (!dir) {
		const sibling = path.resolve(root, '..', 'little-birds');
		dir = fs.existsSync(path.join(sibling, '.git')) ? sibling : path.join(root, '.cache', 'little-birds');
	}
	if (!fs.existsSync(path.join(dir, '.git'))) {
		console.log(`cloning ${source.repo} into ${path.relative(root, dir)}`);
		cp.execFileSync('git', ['clone', '--quiet', '--no-checkout', source.repo, dir], { stdio: 'inherit' });
	}
	const git = (a, encoding) => cp.execFileSync('git', ['-C', dir, ...a], { encoding, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
	try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], 'utf8'); } catch {
		git(['fetch', '--quiet', '--tags', 'origin'], 'utf8');
	}
	const commit = git(['rev-parse', `${ref}^{commit}`], 'utf8').trim();
	return {
		repo: source.repo,
		ref,
		commit,
		list: (prefix) => git(['ls-tree', '-r', '--name-only', commit, '--', prefix], 'utf8').split('\n').filter(Boolean),
		read: (p) => git(['show', `${commit}:${p}`]),
		text: (p) => git(['show', `${commit}:${p}`], 'utf8'),
	};
}

const ASSETS = 'common/src/main/resources/assets/little_birds/';
const MODELS = 'common/src/main/java/com/gabbymaybelle/littlebirds/client/';
const DATA = 'common/src/main/resources/data/little_birds/';

module.exports = { javaRepo, ASSETS, MODELS, DATA };
