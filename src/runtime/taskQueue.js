import { randomUUID } from "node:crypto";

export class TaskQueue {
  constructor({ runHistory, failureNotifier } = {}) {
    this.runHistory = runHistory;
    this.failureNotifier = failureNotifier;
    this.queue = [];
    this.running = false;
  }

  add(task) {
    this.queue.push({
      id: task.id || randomUUID(),
      createdAt: new Date().toISOString(),
      ...task,
    });
  }

  list() {
    return [...this.queue];
  }

  async drain(handler) {
    if (this.running) return [];
    this.running = true;
    const results = [];

    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        try {
          const result = await handler(task);
          this.runHistory?.record({
            task,
            status: "success",
            result,
          });
          results.push({ task, status: "success", result });
        } catch (error) {
          this.runHistory?.record({
            task,
            status: "failed",
            error: error.message,
          });
          if (this.failureNotifier) {
            await this.failureNotifier({ task, error }).catch(() => {});
          }
          results.push({ task, status: "failed", error: error.message });
        }
      }
      return results;
    } finally {
      this.running = false;
    }
  }
}
