import { GameState, GameAction } from '../types';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

interface DecisionCacheKey {
  aiCards: string;
  playerCards: string;
  lastPlay?: string;
  gamePhase: 'early' | 'mid' | 'late';
}

interface ModelPredictionCacheKey {
  playerHistory: string;
  recentMoves: string;
  gamePhase: string;
}

export class CacheService {
  private static readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private static readonly DECISION_CACHE_TTL = 30 * 1000; // 30 seconds
  private static readonly PREDICTION_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

  private cache: Map<string, CacheEntry<any>> = new Map();

  constructor(private maxEntries: number = 1000) {
    // Periodically clean expired entries
    setInterval(() => this.cleanExpiredEntries(), 60 * 1000);
  }

  private cleanExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private createCacheKey(obj: DecisionCacheKey | ModelPredictionCacheKey): string {
    const key = JSON.stringify(obj);
    if (!key) {
      throw new Error('Failed to create cache key');
    }
    return key;
  }

  private getGamePhase(gameState: GameState): 'early' | 'mid' | 'late' {
    const totalCards = gameState.aiHand.length + gameState.playerHand.length;
    if (totalCards > 40) return 'early';
    if (totalCards > 20) return 'mid';
    return 'late';
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl: number = CacheService.DEFAULT_TTL): Promise<void> {
    if (!key || key.trim() === '') {
      throw new Error('Key cannot be undefined or empty');
    }
    
    // Ensure we don't exceed max entries
    if (this.cache.size >= this.maxEntries) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl
    });
  }

  async cacheDecision(gameState: GameState, decision: GameAction): Promise<void> {
    const cacheKey = this.createCacheKey({
      aiCards: JSON.stringify(gameState.aiHand),
      playerCards: JSON.stringify(gameState.playerHand),
      lastPlay: gameState.lastPlay ? JSON.stringify(gameState.lastPlay) : undefined,
      gamePhase: this.getGamePhase(gameState)
    });

    await this.set(cacheKey, decision, CacheService.DECISION_CACHE_TTL);
  }

  async getCachedDecision(gameState: GameState): Promise<GameAction | null> {
    const cacheKey = this.createCacheKey({
      aiCards: JSON.stringify(gameState.aiHand),
      playerCards: JSON.stringify(gameState.playerHand),
      lastPlay: gameState.lastPlay ? JSON.stringify(gameState.lastPlay) : undefined,
      gamePhase: this.getGamePhase(gameState)
    });

    return this.get<GameAction>(cacheKey);
  }

  async cacheModelPrediction(
    gameState: GameState,
    recentMoves: GameAction[],
    prediction: any
  ): Promise<void> {
    const cacheKey = this.createCacheKey({
      playerHistory: JSON.stringify(gameState.playerHand),
      recentMoves: JSON.stringify(recentMoves),
      gamePhase: this.getGamePhase(gameState)
    });

    await this.set(cacheKey, prediction, CacheService.PREDICTION_CACHE_TTL);
  }

  async getCachedModelPrediction(
    gameState: GameState,
    recentMoves: GameAction[]
  ): Promise<any | null> {
    const cacheKey = this.createCacheKey({
      playerHistory: JSON.stringify(gameState.playerHand),
      recentMoves: JSON.stringify(recentMoves),
      gamePhase: this.getGamePhase(gameState)
    });

    return this.get(cacheKey);
  }

  async invalidateCache(): Promise<void> {
    this.cache.clear();
  }

  async invalidateDecisionCache(gameState: GameState): Promise<void> {
    const cacheKey = this.createCacheKey({
      aiCards: JSON.stringify(gameState.aiHand),
      playerCards: JSON.stringify(gameState.playerHand),
      lastPlay: gameState.lastPlay ? JSON.stringify(gameState.lastPlay) : undefined,
      gamePhase: this.getGamePhase(gameState)
    });

    this.cache.delete(cacheKey);
  }

  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0 // TODO: Implement hit rate tracking
    };
  }
} 