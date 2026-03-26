#!/usr/bin/env node
/**
 * Bump plugin version in package.json, manifest.json, and versions.json.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch   # 0.6.0 → 0.6.1
 *   node scripts/bump-version.mjs minor   # 0.6.0 → 0.7.0
 *   node scripts/bump-version.mjs major   # 0.6.0 → 1.0.0
 *   node scripts/bump-version.mjs 0.7.0   # explicit version
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function readJSON(file) {
	return JSON.parse(readFileSync(resolve(root, file), "utf8"));
}

function writeJSON(file, data) {
	writeFileSync(resolve(root, file), JSON.stringify(data, null, "\t") + "\n");
}

function bumpVersion(current, type) {
	const [major, minor, patch] = current.split(".").map(Number);
	switch (type) {
		case "major": return `${major + 1}.0.0`;
		case "minor": return `${major}.${minor + 1}.0`;
		case "patch": return `${major}.${minor}.${patch + 1}`;
		default: return type; // explicit version string
	}
}

const arg = process.argv[2];
if (!arg) {
	console.error("Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>");
	process.exit(1);
}

const pkg = readJSON("package.json");
const manifest = readJSON("manifest.json");
const versions = readJSON("versions.json");

const oldVersion = manifest.version;
const newVersion = bumpVersion(oldVersion, arg);

// Validate semver format
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
	console.error(`Invalid version: ${newVersion}`);
	process.exit(1);
}

// Update all files
pkg.version = newVersion;
manifest.version = newVersion;
versions[newVersion] = manifest.minAppVersion;

writeJSON("package.json", pkg);
writeJSON("manifest.json", manifest);
writeJSON("versions.json", versions);

console.log(`${oldVersion} → ${newVersion}`);
console.log("Updated: package.json, manifest.json, versions.json");
