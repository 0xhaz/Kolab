import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ENV, type Env } from '../config/env.js';

type Handler<T> = (data: T) => Promise<void>;

/** pg-boss (Postgres-backed queue): one less service than Redis (architecture §11 #7). */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private boss: PgBoss | null = null;
  private readonly pending: Array<(boss: PgBoss) => Promise<void>> = [];

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit() {
    if (!this.env.WORKERS_ENABLED) return;
    const boss = new PgBoss(this.env.DATABASE_URL);
    boss.on('error', (err) => this.logger.error({ err }, 'pg-boss error'));
    await boss.start();
    this.boss = boss;
    for (const register of this.pending.splice(0)) await register(boss);
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true, timeout: 5_000 });
  }

  /** Registers a worker (and optional cron). Safe to call before the queue has started. */
  register<T extends object>(name: string, handler: Handler<T>, cron?: string) {
    const setup = async (boss: PgBoss) => {
      await boss.createQueue(name);
      await boss.work<T>(name, async (jobs) => {
        for (const job of jobs) await handler(job.data);
      });
      if (cron) await boss.schedule(name, cron);
    };
    if (this.boss) void setup(this.boss);
    else if (this.env.WORKERS_ENABLED) this.pending.push(setup);
  }

  async send<T extends object>(name: string, data: T, options?: { startAfter?: number | Date; singletonKey?: string }) {
    if (!this.boss) return null;
    return this.boss.send(name, data, options);
  }
}
