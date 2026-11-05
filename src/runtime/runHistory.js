import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_HISTORY_PATH = path.join(process.cwd(), "data", "run_history.json");

export class RunHistory {
  constructor(filePath = DEFAULT_HISTORY_PATH) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "[]\n", "utf8");
    }
  }

  record(entry) {
    const history = this.list();
    const item = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    history.push(item);
    fs.writeFileSync(this.filePath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
    return item;
  }

  list(limit = 50) {
    const history = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    return history.slice(-limit);
  }
}
