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

export class ModelMonitoringService {
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
        aiCards: gameState.aiHand,
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
} 