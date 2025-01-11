import { GameState, GameAction, Card } from '../types';
import { PersistenceService } from './persistenceService';

interface DecisionMetrics {
  timestamp: number;
  gameState: {
    aiCards: number;
    playerCards: number;
    centerPile: number;
    currentTurn: 'player' | 'ai';
  };
  mlInsights: {
    bluffProbability: number;
    challengeProbability: number;
    patternConfidence: number;
    riskLevel: number;
  };
  decision: {
    type: string;
    confidence: number;
    alternativesConsidered: string[];
  };
  outcome?: {
    successful: boolean;
    reward: number;
  };
}

interface ModelPerformance {
  accuracy: number;
  bluffSuccessRate: number;
  challengeSuccessRate: number;
  averageReward: number;
  gamesPlayed: number;
  totalMoves: number;
}

interface ModelUpdate {
  timestamp: number;
  gameState: GameState;
  result: 'win' | 'loss';
  success: boolean;
}

export class ModelMonitoringService {
  private readonly MAX_HISTORY_LENGTH = 1000;
  private decisionHistory: DecisionMetrics[] = [];
  private performance: ModelPerformance = {
    accuracy: 0,
    bluffSuccessRate: 0,
    challengeSuccessRate: 0,
    averageReward: 0,
    gamesPlayed: 0,
    totalMoves: 0
  };

  constructor(private persistenceService: PersistenceService) {
    this.loadHistory();
  }

  private async loadHistory() {
    const history = await this.persistenceService.loadModelHistory();
    if (history) {
      this.decisionHistory = history.decisions;
      this.performance = history.performance;
    }
  }

  async recordDecision(
    gameState: GameState,
    mlInsights: {
      bluffProbability: number;
      challengeProbability: number;
      patternConfidence: number;
      riskLevel: number;
    },
    decision: GameAction,
    alternativesConsidered: string[]
  ) {
    const metrics: DecisionMetrics = {
      timestamp: Date.now(),
      gameState: {
        aiCards: gameState.aiHand.length,
        playerCards: gameState.playerHand.length,
        centerPile: gameState.centerPile.length,
        currentTurn: gameState.currentTurn
      },
      mlInsights,
      decision: {
        type: decision.type,
        confidence: this.calculateDecisionConfidence(mlInsights, decision),
        alternativesConsidered
      }
    };

    this.decisionHistory.push(metrics);
    await this.persistenceService.saveModelHistory({
      decisions: this.decisionHistory,
      performance: this.performance
    });
  }

  async recordOutcome(success: boolean, reward: number) {
    const lastDecision = this.decisionHistory[this.decisionHistory.length - 1];
    if (lastDecision) {
      lastDecision.outcome = {
        successful: success,
        reward
      };

      // Update performance metrics
      this.updatePerformanceMetrics(lastDecision);
      await this.persistenceService.saveModelHistory({
        decisions: this.decisionHistory,
        performance: this.performance
      });
    }
  }

  private calculateDecisionConfidence(
    mlInsights: {
      bluffProbability: number;
      challengeProbability: number;
      patternConfidence: number;
      riskLevel: number;
    },
    decision: GameAction
  ): number {
    switch (decision.type) {
      case 'CHALLENGE':
        return mlInsights.bluffProbability * (1 - mlInsights.riskLevel);
      case 'PLAY_CARDS':
        const isBluff = decision.payload?.cards.some(
          card => card.value !== decision.payload?.declaredValue
        );
        return isBluff
          ? (1 - mlInsights.challengeProbability) * mlInsights.riskLevel
          : mlInsights.patternConfidence;
      default:
        return mlInsights.patternConfidence;
    }
  }

  private updatePerformanceMetrics(decision: DecisionMetrics) {
    if (!decision.outcome) return;

    this.performance.totalMoves++;
    
    // Update success rates
    if (decision.decision.type === 'CHALLENGE') {
      this.performance.challengeSuccessRate = 
        (this.performance.challengeSuccessRate * (this.performance.totalMoves - 1) + 
        (decision.outcome.successful ? 1 : 0)) / this.performance.totalMoves;
    } else if (decision.decision.type === 'PLAY_CARDS') {
      this.performance.bluffSuccessRate = 
        (this.performance.bluffSuccessRate * (this.performance.totalMoves - 1) + 
        (decision.outcome.successful ? 1 : 0)) / this.performance.totalMoves;
    }

    // Update overall accuracy and reward
    this.performance.accuracy = 
      (this.performance.accuracy * (this.performance.totalMoves - 1) + 
      (decision.outcome.successful ? 1 : 0)) / this.performance.totalMoves;
    
    this.performance.averageReward = 
      (this.performance.averageReward * (this.performance.totalMoves - 1) + 
      decision.outcome.reward) / this.performance.totalMoves;
  }

  getPerformanceMetrics(): ModelPerformance {
    return { ...this.performance };
  }

  getRecentDecisions(limit: number = 10): DecisionMetrics[] {
    return this.decisionHistory.slice(-limit);
  }

  getDecisionDistribution(): { [key: string]: number } {
    const distribution: { [key: string]: number } = {
      CHALLENGE: 0,
      PLAY_CARDS: 0,
      PASS: 0
    };

    this.decisionHistory.forEach(decision => {
      distribution[decision.decision.type]++;
    });

    return distribution;
  }

  async recordModelUpdate(update: ModelUpdate): Promise<void> {
    try {
      const currentMetrics = await this.getMetrics();
      
      // Record the update
      currentMetrics.modelUpdates = currentMetrics.modelUpdates || [];
      currentMetrics.modelUpdates.push({
        timestamp: update.timestamp,
        result: update.result,
        success: update.success
      });

      // Keep only recent updates
      if (currentMetrics.modelUpdates.length > this.MAX_HISTORY_LENGTH) {
        currentMetrics.modelUpdates = currentMetrics.modelUpdates.slice(-this.MAX_HISTORY_LENGTH);
      }

      // Update success rate
      const recentUpdates = currentMetrics.modelUpdates.slice(-100);
      currentMetrics.modelUpdateSuccessRate = 
        recentUpdates.filter(u => u.success).length / recentUpdates.length;

      await this.persistenceService.saveMetrics(currentMetrics);
    } catch (error) {
      console.error('Error recording model update:', error);
      throw error;
    }
  }

  async getMetrics(): Promise<{
    modelUpdates: Array<{
      timestamp: number;
      result: 'win' | 'loss';
      success: boolean;
    }>;
    modelUpdateSuccessRate: number;
  }> {
    try {
      const metrics = await this.persistenceService.loadMetrics();
      return metrics || {
        modelUpdates: [],
        modelUpdateSuccessRate: 0
      };
    } catch (error) {
      console.error('Error getting metrics:', error);
      throw error;
    }
  }
} 