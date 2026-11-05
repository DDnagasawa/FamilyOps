export class Scheduler {
  constructor({ runtime, taskQueue }) {
    this.runtime = runtime;
    this.taskQueue = taskQueue;
    this.jobs = [];
    this.timer = null;
  }

  registerJob(job) {
    this.jobs.push({
      enabled: true,
      ...job,
    });
  }

  listJobs() {
    return this.jobs.map(({ run, ...job }) => job);
  }

  enqueueDueJobs(now = new Date()) {
    const enqueued = [];
    for (const job of this.jobs) {
      if (!job.enabled) continue;
      if (job.shouldRun && !job.shouldRun(now)) continue;
      const task = {
        type: "skill",
        skillName: job.skillName,
        input: job.input || {},
        source: "scheduler",
        jobName: job.name,
      };
      this.taskQueue.add(task);
      enqueued.push(task);
    }
    return enqueued;
  }

  async runDueJobsOnce(now = new Date()) {
    this.enqueueDueJobs(now);
    return this.taskQueue.drain((task) => this.runtime.runSkill(task.skillName, task.input));
  }

  start({ intervalMs = 60_000 } = {}) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runDueJobsOnce().catch((error) => {
        console.error(`Scheduler run failed: ${error.message}`);
      });
    }, intervalMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
