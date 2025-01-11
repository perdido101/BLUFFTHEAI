import { GameHistory, GameState, GameAction, DecisionMetrics, ModelPerformance } from '../types';

interface PerformanceMetrics {
  gameHistory: GameHistory[];
  aggregateMetrics: {
    winRate: number;
    averageGameDuration: number;
    totalGamesPlayed: number;
  };
}

interface Patterns {
  successfulPatterns: GameAction[];
  failedPatterns: GameAction[];
}

export interface PersistenceService {
  init(): Promise<void>;
  
  saveQTable(qTable: Record<string, number>): Promise<void>;
  loadQTable(): Promise<Record<string, number>>;
  
  loadModelHistory(): Promise<{
    decisions: DecisionMetrics[];
    performance: ModelPerformance;
  } | null>;
  
  saveModelHistory(history: {
    decisions: DecisionMetrics[];
    performance: ModelPerformance;
  }): Promise<void>;
  
  loadPatterns(): Promise<Patterns | null>;
  savePatterns(patterns: Patterns): Promise<void>;
  
  loadPerformanceMetrics(): Promise<PerformanceMetrics | null>;
  savePerformanceMetrics(metrics: PerformanceMetrics): Promise<void>;
  
  saveGameHistory(history: GameHistory): Promise<void>;
  loadGameHistory(): Promise<GameHistory[]>;

  saveMetrics(metrics: {
    modelUpdates: Array<{
      timestamp: number;
      result: 'win' | 'loss';
      success: boolean;
    }>;
    modelUpdateSuccessRate: number;
  }): Promise<void>;

  loadMetrics(): Promise<{
    modelUpdates: Array<{
      timestamp: number;
      result: 'win' | 'loss';
      success: boolean;
    }>;
    modelUpdateSuccessRate: number;
  } | null>;
}

export { PerformanceMetrics, Patterns }; 