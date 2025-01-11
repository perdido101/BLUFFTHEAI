import { GameState, GameAction } from '../types';
import { PersistenceService } from './persistenceService';

interface LearningData {
  successfulStrategies: {
    bluffs: Map<string, number>;
    challenges: Map<string, number>;
  };
  playerResponses: {
    toBluffs: Map<string, number>;
    toChallenges: Map<string, number>;
  };
}

interface OptimalStrategy {
  recommendedAction: GameAction;
  confidence: number;
  alternativeActions: GameAction[];
}

export class AdaptiveLearningService {
  private learningData: LearningData = {
    successfulStrategies: {
      bluffs: new Map(),
      challenges: new Map()
    },
    playerResponses: {
      toBluffs: new Map(),
      toChallenges: new Map()
    }
  };

  private persistenceService: PersistenceService;

  constructor(persistenceService: PersistenceService) {
    this.persistenceService = persistenceService;
    this.loadData();
  }

  private async loadData() {
    const data = await this.persistenceService.loadLearningData();
    if (data) {
      this.learningData = data;
    }
  }

  private async saveData() {
    await this.persistenceService.saveLearningData(this.learningData);
  }

  async learn(action: GameAction, result: boolean, gameState: GameState): Promise<void> {
    const gameStage = this.getGameStage(gameState);
    const key = this.getStrategyKey(action, gameStage);

    if (action.type === 'PLAY_CARDS') {
      const currentSuccess = this.learningData.successfulStrategies.bluffs.get(key) || 0;
      this.learningData.successfulStrategies.bluffs.set(key, result ? currentSuccess + 1 : currentSuccess);
    }

    if (action.type === 'CHALLENGE') {
      const currentSuccess = this.learningData.successfulStrategies.challenges.get(key) || 0;
      this.learningData.successfulStrategies.challenges.set(key, result ? currentSuccess + 1 : currentSuccess);
    }

    await this.saveData();
  }

  private getGameStage(gameState: GameState): 'early' | 'mid' | 'late' {
    const totalCards = gameState.playerHand.length + gameState.aiHand.length;
    if (totalCards > 40) return 'early';
    if (totalCards > 20) return 'mid';
    return 'late';
  }

  private getStrategyKey(action: GameAction, gameStage: string): string {
    if (action.type === 'PLAY_CARDS') {
      return `${gameStage}-${action.payload?.cards.length}-${action.payload?.declaredValue}`;
    }
    return `${gameStage}-challenge`;
  }

  async getOptimalStrategy(gameState: GameState): Promise<OptimalStrategy> {
    // Default strategy with proper type
    return {
      recommendedAction: { type: 'PASS' },
      confidence: 0.7,
      alternativeActions: [
        { type: 'CHALLENGE' },
        {
          type: 'PLAY_CARDS',
          payload: {
            cards: [],
            declaredValue: 'A'
          }
        }
      ]
    };
  }
} 