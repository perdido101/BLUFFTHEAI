import { GameState, GameAction } from '../types';
import { PersistenceService } from './persistenceService';

interface PlayerPerformanceMetrics {
  winRate: number;
  averageCardsPerPlay: number;
  bluffSuccessRate: number;
  challengeSuccessRate: number;
  averageTimeToWin: number;
  gamesPlayed: number;
}

interface DifficultySettings {
  aggressiveness: number;        // 0-1: How likely to make aggressive plays
  bluffFrequency: number;        // 0-1: How often to bluff
  challengeThreshold: number;    // 0-1: When to challenge (lower = more challenges)
  riskTolerance: number;         // 0-1: Willingness to take risks
  adaptiveSpeed: number;         // 0-1: How quickly to adapt to player strategies
  exploitWeaknesses: boolean;    // Whether to specifically target player weaknesses
}

export class AdaptiveDifficultyService {
  private playerMetrics: PlayerPerformanceMetrics = {
    winRate: 0,
    averageCardsPerPlay: 0,
    bluffSuccessRate: 0,
    challengeSuccessRate: 0,
    averageTimeToWin: 0,
    gamesPlayed: 0
  };

  private difficultySettings: DifficultySettings = {
    aggressiveness: 0.7,
    bluffFrequency: 0.6,
    challengeThreshold: 0.6,
    riskTolerance: 0.7,
    adaptiveSpeed: 0.8,
    exploitWeaknesses: true
  };

  private readonly MIN_GAMES_FOR_ADAPTATION = 3;
  private gameStartTime: number = Date.now();

  constructor(private persistenceService: PersistenceService) {
    this.loadMetrics();
  }

  private async loadMetrics() {
    const data = await this.persistenceService.loadPlayerMetrics();
    if (data) {
      this.playerMetrics = data;
      this.adjustDifficultyBasedOnPerformance();
    }
  }

  private async saveMetrics() {
    await this.persistenceService.savePlayerMetrics(this.playerMetrics);
  }

  startGame() {
    this.gameStartTime = Date.now();
  }

  async updateMetrics(gameResult: {
    winner: 'player' | 'ai';
    playerMoves: GameAction[];
    aiMoves: GameAction[];
    finalState: GameState;
  }) {
    const gameTime = (Date.now() - this.gameStartTime) / 1000; // in seconds

    // Update win rate
    const isPlayerWin = gameResult.winner === 'player';
    this.playerMetrics.winRate = (
      this.playerMetrics.winRate * this.playerMetrics.gamesPlayed +
      (isPlayerWin ? 1 : 0)
    ) / (this.playerMetrics.gamesPlayed + 1);

    // Update average cards per play
    const totalPlayerCards = gameResult.playerMoves.reduce((sum, move) => 
      sum + (move.payload?.cards?.length || 0), 0
    );
    this.playerMetrics.averageCardsPerPlay = (
      this.playerMetrics.averageCardsPerPlay * this.playerMetrics.gamesPlayed +
      totalPlayerCards / Math.max(gameResult.playerMoves.length, 1)
    ) / (this.playerMetrics.gamesPlayed + 1);

    // Update bluff success rate
    const bluffMoves = gameResult.playerMoves.filter(move => 
      move.type === 'PLAY_CARDS' && 
      move.payload?.cards.some(card => card.value !== move.payload.declaredValue)
    );
    const successfulBluffs = bluffMoves.filter(move => !move.wasChallenged);
    this.playerMetrics.bluffSuccessRate = bluffMoves.length > 0 ?
      successfulBluffs.length / bluffMoves.length :
      this.playerMetrics.bluffSuccessRate;

    // Update challenge success rate
    const challengeMoves = gameResult.playerMoves.filter(move => move.type === 'CHALLENGE');
    const successfulChallenges = challengeMoves.filter(move => move.type === 'CHALLENGE' && move.result === 'success');
    this.playerMetrics.challengeSuccessRate = challengeMoves.length > 0 ?
      successfulChallenges.length / challengeMoves.length :
      this.playerMetrics.challengeSuccessRate;

    // Update average time to win
    if (isPlayerWin) {
      this.playerMetrics.averageTimeToWin = (
        this.playerMetrics.averageTimeToWin * this.playerMetrics.gamesPlayed +
        gameTime
      ) / (this.playerMetrics.gamesPlayed + 1);
    }

    this.playerMetrics.gamesPlayed++;

    // Adjust difficulty based on updated metrics
    this.adjustDifficultyBasedOnPerformance();
    await this.saveMetrics();
  }

  private adjustDifficultyBasedOnPerformance() {
    if (this.playerMetrics.gamesPlayed < this.MIN_GAMES_FOR_ADAPTATION) {
      return;
    }

    // Increase difficulty if player is doing well
    if (this.playerMetrics.winRate > 0.5) {
      this.difficultySettings.aggressiveness = Math.min(1, this.difficultySettings.aggressiveness + 0.1);
      this.difficultySettings.bluffFrequency = Math.min(1, this.difficultySettings.bluffFrequency + 0.1);
      this.difficultySettings.challengeThreshold = Math.max(0.4, this.difficultySettings.challengeThreshold - 0.1);
      this.difficultySettings.riskTolerance = Math.min(1, this.difficultySettings.riskTolerance + 0.1);
    }

    // Adjust strategy based on player weaknesses
    if (this.difficultySettings.exploitWeaknesses) {
      if (this.playerMetrics.bluffSuccessRate < 0.4) {
        // Player is bad at bluffing, challenge more
        this.difficultySettings.challengeThreshold = Math.max(0.3, this.difficultySettings.challengeThreshold - 0.2);
      }

      if (this.playerMetrics.challengeSuccessRate < 0.4) {
        // Player is bad at challenging, bluff more
        this.difficultySettings.bluffFrequency = Math.min(1, this.difficultySettings.bluffFrequency + 0.2);
      }

      if (this.playerMetrics.averageCardsPerPlay > 2) {
        // Player plays many cards at once, be more aggressive with challenges
        this.difficultySettings.challengeThreshold = Math.max(0.3, this.difficultySettings.challengeThreshold - 0.15);
      }
    }
  }

  getDifficultyModifiers(gameState: GameState): {
    bluffProbabilityMultiplier: number;
    challengeThresholdMultiplier: number;
    riskToleranceMultiplier: number;
  } {
    const endgamePhase = (gameState.aiHand.length + gameState.playerHand.length) < 10;
    const winningPosition = gameState.aiHand.length < gameState.playerHand.length;
    const criticalPosition = gameState.aiHand.length <= 2;

    let bluffProbabilityMultiplier = this.difficultySettings.bluffFrequency;
    let challengeThresholdMultiplier = this.difficultySettings.challengeThreshold;
    let riskToleranceMultiplier = this.difficultySettings.riskTolerance;

    // Adjust based on game state
    if (endgamePhase) {
      if (winningPosition) {
        // Play more conservatively when winning in endgame
        bluffProbabilityMultiplier *= 0.7;
        challengeThresholdMultiplier *= 1.2;
        riskToleranceMultiplier *= 0.8;
      } else {
        // Take more risks when losing in endgame
        bluffProbabilityMultiplier *= 1.3;
        challengeThresholdMultiplier *= 0.8;
        riskToleranceMultiplier *= 1.2;
      }
    }

    if (criticalPosition) {
      // Desperate measures in critical positions
      bluffProbabilityMultiplier *= 1.5;
      challengeThresholdMultiplier *= 0.7;
      riskToleranceMultiplier *= 1.3;
    }

    // Ensure values stay within valid range
    return {
      bluffProbabilityMultiplier: Math.min(1, Math.max(0, bluffProbabilityMultiplier)),
      challengeThresholdMultiplier: Math.min(1, Math.max(0.3, challengeThresholdMultiplier)),
      riskToleranceMultiplier: Math.min(1, Math.max(0, riskToleranceMultiplier))
    };
  }

  getPlayerMetrics(): PlayerPerformanceMetrics {
    return { ...this.playerMetrics };
  }

  getCurrentDifficulty(): DifficultySettings {
    return { ...this.difficultySettings };
  }
} 