import { GameState, GameAction } from '../types';
import { PersistenceService } from './persistenceService';

interface BluffTriggers {
  lowCards: number;
  highCards: number;
  underPressure: number;
}

interface ChallengePatterns {
  afterConsecutivePlays: number;
  whenLowCardsPlayed: number;
  whenHighCardsPlayed: number;
}

interface PlayerPattern {
  moveHistory: GameAction[];
  bluffingTriggers: BluffTriggers;
  challengePatterns: ChallengePatterns;
}

export class PatternRecognitionService {
  private patterns: PlayerPattern = {
    moveHistory: [],
    bluffingTriggers: {
      lowCards: 0,
      highCards: 0,
      underPressure: 0
    },
    challengePatterns: {
      afterConsecutivePlays: 0,
      whenLowCardsPlayed: 0,
      whenHighCardsPlayed: 0
    }
  };

  private readonly HISTORY_LIMIT = 20;
  private persistenceService: PersistenceService;

  constructor(persistenceService: PersistenceService) {
    this.persistenceService = persistenceService;
    this.loadPatterns();
  }

  private async loadPatterns() {
    const data = await this.persistenceService.loadPatterns();
    if (data) {
      this.patterns = data as PlayerPattern;
    }
  }

  private async savePatterns() {
    await this.persistenceService.savePatterns(this.patterns);
  }

  async analyzePatterns(action: GameAction, gameState: GameState) {
    this.updateMoveHistory(action);
    
    if (action.type === 'PLAY_CARDS' && action.payload) {
      const { cards, declaredValue } = action.payload;
      const isBluff = cards.some(card => card.value !== declaredValue);
      
      if (isBluff) {
        // Update bluffing triggers
        if (gameState.playerHand.length <= 5) {
          this.patterns.bluffingTriggers.underPressure++;
        }
        if (parseInt(declaredValue) >= 10) {
          this.patterns.bluffingTriggers.highCards++;
        } else {
          this.patterns.bluffingTriggers.lowCards++;
        }
      }
    }

    if (action.type === 'CHALLENGE') {
      const consecutivePlays = this.getConsecutivePlays();
      if (consecutivePlays >= 3) {
        this.patterns.challengePatterns.afterConsecutivePlays++;
      }
    }

    await this.savePatterns();
  }

  private updateMoveHistory(action: GameAction) {
    this.patterns.moveHistory.push(action);
    if (this.patterns.moveHistory.length > this.HISTORY_LIMIT) {
      this.patterns.moveHistory.shift();
    }
  }

  private getConsecutivePlays(): number {
    let count = 0;
    for (let i = this.patterns.moveHistory.length - 1; i >= 0; i--) {
      if (this.patterns.moveHistory[i].type === 'PLAY_CARDS') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  getPrediction(): { likelyToBluff: number; likelyToChallenge: number } {
    const totalBluffs = 
      this.patterns.bluffingTriggers.lowCards +
      this.patterns.bluffingTriggers.highCards +
      this.patterns.bluffingTriggers.underPressure;

    const totalChallenges = 
      this.patterns.challengePatterns.afterConsecutivePlays +
      this.patterns.challengePatterns.whenLowCardsPlayed +
      this.patterns.challengePatterns.whenHighCardsPlayed;

    const moveCount = this.patterns.moveHistory.length;

    return {
      likelyToBluff: totalBluffs / (moveCount || 1),
      likelyToChallenge: totalChallenges / (moveCount || 1)
    };
  }
} 