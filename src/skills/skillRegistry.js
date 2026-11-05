export class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  register(skill) {
    if (!skill?.name || typeof skill.run !== "function") {
      throw new Error("Skill must include name and run handler.");
    }
    const requiredFields = ["description", "riskLevel", "allowedTools"];
    for (const field of requiredFields) {
      if (!(field in skill)) {
        throw new Error(`Skill ${skill.name} is missing required field: ${field}`);
      }
    }
    if (!Array.isArray(skill.allowedTools)) {
      throw new Error(`Skill ${skill.name} allowedTools must be an array.`);
    }
    this.skills.set(skill.name, skill);
  }

  list() {
    return [...this.skills.values()].map(({ run, ...metadata }) => metadata);
  }

  get(name) {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Unknown skill: ${name}`);
    return skill;
  }
}
