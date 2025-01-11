import { GameState, GameAction, Card } from '../types';
import { AIStrategyService } from './aiStrategyService';
import { PatternRecognitionService } from './patternRecognitionService';

export class AIDecisionService {
  constructor(
    private aiStrategy: AIStrategyService,
    private patternRecognition: PatternRecognitionService
  ) {}

  async makeDecision(gameState: GameState): Promise<GameAction> {
    if (gameState.lastPlay && gameState.lastPlay.player === 'player') {
      // Decide whether to challenge
      const bluffProbability = this.aiStrategy.calculateBluffProbability(gameState);
      const patterns = this.patternRecognition.getPrediction();
      
      if (bluffProbability > 0.7 || patterns.likelyToBluff > 0.6) {
        return { type: 'CHALLENGE' };
      }
    }

    // AI's turn to play cards
    if (gameState.aiHand.length > 0) {
      // Select cards and decide whether to bluff
      const cardsToPlay: Card[] = []; // Initialize empty array with explicit type
      const declaredValue = 'A'; // Implement value selection logic
      
      return {
        type: 'PLAY_CARDS',
        payload: {
          cards: cardsToPlay,
          declaredValue
        }
      };
    }

    return { type: 'PASS' };
  }
} 