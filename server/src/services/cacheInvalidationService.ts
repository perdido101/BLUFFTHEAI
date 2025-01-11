import { CacheService } from './cacheService';
import { GameState } from '../types';

export class CacheInvalidationService {
  constructor(private cacheService: CacheService) {}

  async invalidateGameStateCache(gameState: GameState): Promise<void> {
    await this.cacheService.invalidateDecisionCache(gameState);
  }

  async invalidateByKey(key: string): Promise<void> {
    if (typeof key === 'string' && key.length > 0) {
      await this.cacheService.invalidateCache();
    }
  }
} 