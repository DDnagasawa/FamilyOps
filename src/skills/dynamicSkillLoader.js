import fs from "node:fs";
import path from "node:path";

export function loadSkillsFromDisk({ skillsDir = path.join(process.cwd(), "skills"), handlers }) {
  if (!fs.existsSync(skillsDir)) return [];

  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsDir, entry.name, "skill.json"))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => {
      const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const handler = handlers[config.handler];
      if (!handler) {
        throw new Error(`No skill handler found for ${config.name}: ${config.handler}`);
      }
      return {
        ...config,
        run: handler,
      };
    });
}
