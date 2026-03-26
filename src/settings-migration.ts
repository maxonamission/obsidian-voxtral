// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe
/**
 * Versioned settings migration — ensures stored settings from older
 * plugin versions are safely upgraded to the current schema.
 *
 * To add a new migration:
 * 1. Increment CURRENT_VERSION
 * 2. Add a migration function for the previous version number
 *    e.g. migrations[2] upgrades from v2 → v3
 */

import { DEFAULT_SETTINGS, type VoxtralSettings } from "./types";

/** Current settings schema version. Bump when the schema changes. */
export const CURRENT_VERSION = 1;

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration registry. Each key is the version to migrate FROM.
 * The function transforms data from version N to version N+1.
 *
 * Example (when you need it later):
 *   migrations[1] = (data) => {
 *     // v1 → v2: rename 'apiKey' to 'mistralApiKey'
 *     data.mistralApiKey = data.apiKey;
 *     delete data.apiKey;
 *     return data;
 *   };
 */
const migrations: Record<number, Migration> = {
	// No migrations yet — v0 → v1 is handled by the default merge below
};

/**
 * Migrate stored settings data to the current schema version.
 * Applies migrations sequentially, then merges with defaults
 * to fill in any missing keys.
 */
export function migrateSettings(
	data: Record<string, unknown> | null
): VoxtralSettings {
	if (!data) {
		return { ...DEFAULT_SETTINGS, settingsVersion: CURRENT_VERSION };
	}

	let version = typeof data.settingsVersion === "number"
		? data.settingsVersion
		: 0;

	// Apply migrations in sequence
	while (migrations[version]) {
		data = migrations[version](data);
		version++;
	}

	data.settingsVersion = CURRENT_VERSION;

	// Merge with defaults to fill missing keys (shallow — sufficient for current schema)
	return { ...DEFAULT_SETTINGS, ...data } as VoxtralSettings;
}
