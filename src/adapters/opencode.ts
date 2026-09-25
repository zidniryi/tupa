import { createOpencodeFamilyAdapter } from "./lib/opencode-family.js";

export const opencodeAdapter = createOpencodeFamilyAdapter({
  id: "opencode",
  name: "opencode",
  dirName: "opencode",
  dbFileName: "opencode.db",
  envOverrideVar: "TUPA_OPENCODE_DIR",
  resumeCommand: (id) => `opencode -s ${id}`,
  launchWithContext: (handoffPath) => `opencode "Read ${handoffPath} and continue from 'Next steps'."`,
});
