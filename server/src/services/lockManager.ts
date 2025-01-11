import Redis from 'ioredis';

export class LockManager {
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.redis = new Redis(redisUrl, {
      retryStrategy: (times: number) => {
        if (times > 3) {
          console.error('Failed to connect to Redis after 3 retries');
          return null; // stop retrying
        }
        return Math.min(times * 1000, 3000); // retry with exponential backoff
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true // Don't connect immediately
    });

    // Handle connection events
    this.redis.on('connect', () => {
      console.log('Connected to Redis');
      this.isConnected = true;
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      console.log('Redis connection closed');
      this.isConnected = false;
    });
  }

  async init(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      console.error('Failed to initialize Redis connection:', error);
      throw error;
    }
  }

  async acquireLock(key: string, ttl: number = 30000): Promise<boolean> {
    if (!this.isConnected) {
      console.warn('Redis is not connected, cannot acquire lock');
      return false;
    }

    try {
      const result = await this.redis.set(key, '1', 'PX', ttl, 'NX');
      return result === 'OK';
    } catch (error: any) {
      console.error('Failed to acquire lock:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async releaseLock(key: string): Promise<boolean> {
    if (!this.isConnected) {
      console.warn('Redis is not connected, cannot release lock');
      return false;
    }

    try {
      const result = await this.redis.del(key);
      return result === 1;
    } catch (error: any) {
      console.error('Failed to release lock:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      this.isConnected = false;
    } catch (error) {
      console.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }
} 