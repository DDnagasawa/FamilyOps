import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROFILES_PATH = path.join(process.cwd(), "config", "agent_profiles.json");

export class AgentProfiles {
  constructor(filePath = DEFAULT_PROFILES_PATH) {
    this.filePath = filePath;
  }

  list() {
    if (!fs.existsSync(this.filePath)) return [];
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  get(id = "default") {
    const profile = this.list().find((item) => item.id === id);
    if (!profile) throw new Error(`Agent profile not found: ${id}`);
    return profile;
  }
}
