import fs from "node:fs";
import path from "node:path";

const DEFAULT_MEMORY_PATH = path.join(process.cwd(), "data", "memory.json");

export class LocalMemory {
  constructor(filePath = DEFAULT_MEMORY_PATH) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ preferences: {}, facts: [], decisions: [] }, null, 2));
    }
  }

  read() {
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  update(patch) {
    const current = this.read();
    const next = {
      ...current,
      ...patch,
      preferences: {
        ...(current.preferences || {}),
        ...(patch.preferences || {}),
      },
    };
    fs.writeFileSync(this.filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  setByPath(keyPath, value) {
    if (!keyPath || typeof keyPath !== "string") {
      throw new Error("Memory key path is required.");
    }
    const current = this.read();
    const parts = keyPath.split(".").filter(Boolean);
    let cursor = current;
    while (parts.length > 1) {
      const part = parts.shift();
      cursor[part] = cursor[part] && typeof cursor[part] === "object" ? cursor[part] : {};
      cursor = cursor[part];
    }
    cursor[parts[0]] = value;
    fs.writeFileSync(this.filePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
    return current;
  }

  addFact(fact) {
    const current = this.read();
    current.facts = current.facts || [];
    current.facts.push({ createdAt: new Date().toISOString(), fact });
    fs.writeFileSync(this.filePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
    return current;
  }
}
