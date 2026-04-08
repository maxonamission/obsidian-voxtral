// Voxtral Transcribe — Copyright (c) 2026 Max Kloosterman
// Licensed under GPL-3.0 — see LICENSE for details
// https://github.com/maxonamission/voxtral-transcribe

// Re-export shared types so existing imports keep working
export type { FocusBehavior, CustomCommand, VoxtralSettings } from "../../shared/src/types";
export { DEFAULT_SETTINGS } from "../../shared/src/types";

// Re-export from shared so existing imports still work
export { DEFAULT_CORRECT_PROMPT } from "../../shared/src";

/** Default built-in custom commands (table, callouts) */
export { getDefaultBuiltInCommands } from "./default-commands";
