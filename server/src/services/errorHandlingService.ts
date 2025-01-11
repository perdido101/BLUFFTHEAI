import { GameState, GameAction } from '../types';

interface ErrorStats {
  totalErrors: number;
  errorsByType: { [key: string]: number };
  lastError: {
    message: string;
    timestamp: Date;
  } | null;
}

export class ErrorHandlingService {
  private errorStats: ErrorStats = {
    totalErrors: 0,
    errorsByType: {},
    lastError: null
  };

  validateGameState(gameState: GameState): void {
    if (!gameState.aiHand || !gameState.playerHand || !Array.isArray(gameState.centerPile)) {
      throw new Error('Invalid game state: missing required arrays');
    }
  }

  validateAction(action: GameAction): void {
    if (!action.type) {
      throw new Error('Invalid action: missing type');
    }

    if (action.type === 'PLAY_CARDS') {
      if (!action.payload || !action.payload.cards || !action.payload.declaredValue) {
        throw new Error('Invalid PLAY_CARDS action: missing payload data');
      }
    }
  }

  handleCacheError(error: Error, context: string): void {
    console.error(`Cache error in ${context}:`, error);
  }

  handleDecisionError(error: Error, gameState: GameState): GameAction {
    console.error('Decision error:', error);
    // Default to PASS on error
    return { type: 'PASS' };
  }

  handlePredictionError(error: Error, gameState: GameState): any {
    console.error('Prediction error:', error);
    return {
      patterns: { likelyToBluff: 0, likelyToChallenge: 0 },
      playerStats: {},
      optimalStrategy: {},
      personalityTraits: {}
    };
  }

  logError(error: Error, isCritical: boolean, message?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      critical: isCritical,
      message
    };
    console.error('Error logged:', logEntry);
  }

  getErrorStats(): ErrorStats {
    return { ...this.errorStats };
  }

  handleMLError(error: Error, gameState: GameState): Error {
    console.error('ML Error:', error);
    this.recordError({
      type: 'ML_ERROR',
      message: error.message,
      timestamp: Date.now(),
      gameState: gameState
    });
    return new Error(`ML processing failed: ${error.message}`);
  }
} 