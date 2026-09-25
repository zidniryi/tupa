import { createOpencodeFamilyAdapter } from "./lib/opencode-family.js";

// Kilo CLI's local storage is schema-identical to opencode's (same session/message/part
// tables, same "ses_..." id format) — confirmed by inspecting both databases directly,
// not assumed from the name. Only the dir/db file names and resume command differ.
export const kiloAdapter = createOpencodeFamilyAdapter({
  id: "kilo",
  name: "Kilo CLI",
  dirName: "kilo",
  dbFileName: "kilo.db",
  envOverrideVar: "TUPA_KILO_DIR",
  resumeCommand: (id) => `kilo -s ${id}`,
  launchWithContext: (handoffPath) => `kilo "Read ${handoffPath} and continue from 'Next steps'."`,
});
