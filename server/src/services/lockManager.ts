import Redis from 'ioredis';

export class LockManager {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async acquireLock(key: string, ttl: number = 30000): Promise<boolean> {
    try {
      const result = await this.redis.set(key, '1', 'PX', ttl, 'NX');
      return result === 'OK';
    } catch (error: any) {
      console.error('Failed to acquire lock:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async releaseLock(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);
      return result === 1;
    } catch (error: any) {
      console.error('Failed to release lock:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }
} 