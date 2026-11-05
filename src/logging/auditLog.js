import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const AUDIT_PATH = path.join(process.cwd(), "data", "audit.log");

export class AuditLog {
  constructor(filePath = AUDIT_PATH) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  write(entry) {
    const record = {
      id: entry.id || randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  list(limit = 50) {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs.readFileSync(this.filePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line));
  }
}
