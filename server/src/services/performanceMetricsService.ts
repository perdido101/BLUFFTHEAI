import { GameState, GameAction } from '../types';
import { PersistenceService } from './persistenceService';

interface GameMetrics {
  gameId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  winner?: 'player' | 'ai';
  totalMoves: number;
  aiStats: {
    initialCards: number;
    cardsPlayed: number;
    successfulBluffs: number;
    failedBluffs: number;
    successfulChallenges: number;
    failedChallenges: number;
    totalPasses: number;
  };
  playerStats: {
    initialCards: number;
    cardsPlayed: number;
    successfulBluffs: number;
    failedBluffs: number;
    successfulChallenges: number;
    failedChallenges: number;
    totalPasses: number;
  };
}

interface AggregateMetrics {
  totalGames: number;
  aiWinRate: number;
  averageGameDuration: number;
  averageMovesPerGame: number;
  aiPerformance: {
    bluffSuccessRate: number;
    challengeSuccessRate: number;
    averageCardsPerMove: number;
    passFrequency: number;
  };
  playerPerformance: {
    bluffSuccessRate: number;
    challengeSuccessRate: number;
    averageCardsPerMove: number;
    passFrequency: number;
  };
}

export class PerformanceMetricsService {
  private currentGame: GameMetrics | null = null;
  private gameHistory: GameMetrics[] = [];
  private aggregateMetrics: AggregateMetrics = {
    totalGames: 0,
    aiWinRate: 0,
    averageGameDuration: 0,
    averageMovesPerGame: 0,
    aiPerformance: {
      bluffSuccessRate: 0,
      challengeSuccessRate: 0,
      averageCardsPerMove: 0,
      passFrequency: 0
    },
    playerPerformance: {
      bluffSuccessRate: 0,
      challengeSuccessRate: 0,
      averageCardsPerMove: 0,
      passFrequency: 0
    }
  };

  constructor(private persistenceService: PersistenceService) {
    this.loadMetrics();
  }

  private async loadMetrics() {
    const data = await this.persistenceService.loadPerformanceMetrics();
    if (data) {
      this.gameHistory = data.gameHistory;
      this.aggregateMetrics = data.aggregateMetrics;
    }
  }

  private async saveMetrics() {
    await this.persistenceService.savePerformanceMetrics({
      gameHistory: this.gameHistory,
      aggregateMetrics: this.aggregateMetrics
    });
  }

  startNewGame(initialState: GameState): string {
    const gameId = Date.now().toString();
    this.currentGame = {
      gameId,
      startTime: Date.now(),
      totalMoves: 0,
      aiStats: {
        initialCards: initialState.aiHand.length,
        cardsPlayed: 0,
        successfulBluffs: 0,
        failedBluffs: 0,
        successfulChallenges: 0,
        failedChallenges: 0,
        totalPasses: 0
      },
      playerStats: {
        initialCards: initialState.playerHand.length,
        cardsPlayed: 0,
        successfulBluffs: 0,
        failedBluffs: 0,
        successfulChallenges: 0,
        failedChallenges: 0,
        totalPasses: 0
      }
    };
    return gameId;
  }

  async recordMove(
    player: 'player' | 'ai',
    action: GameAction,
    success: boolean,
    gameState: GameState
  ) {
    if (!this.currentGame) return;

    this.currentGame.totalMoves++;
    const stats = player === 'ai' ? this.currentGame.aiStats : this.currentGame.playerStats;

    switch (action.type) {
      case 'PLAY_CARDS':
        if (action.payload?.cards) {
          stats.cardsPlayed += action.payload.cards.length;
          const isBluff = action.payload.cards.some(
            card => card.value !== action.payload?.declaredValue
          );
          if (isBluff) {
            if (success) stats.successfulBluffs++;
            else stats.failedBluffs++;
          }
        }
        break;
      case 'CHALLENGE':
        if (success) stats.successfulChallenges++;
        else stats.failedChallenges++;
        break;
      case 'PASS':
        stats.totalPasses++;
        break;
    }

    await this.saveMetrics();
  }

  async endGame(winner: 'player' | 'ai') {
    if (!this.currentGame) return;

    this.currentGame.endTime = Date.now();
    this.currentGame.duration = this.currentGame.endTime - this.currentGame.startTime;
    this.currentGame.winner = winner;

    this.gameHistory.push(this.currentGame);
    this.updateAggregateMetrics();
    await this.saveMetrics();

    this.currentGame = null;
  }

  private updateAggregateMetrics() {
    const metrics = this.aggregateMetrics;
    metrics.totalGames = this.gameHistory.length;

    // Calculate win rates and averages
    const aiWins = this.gameHistory.filter(game => game.winner === 'ai').length;
    metrics.aiWinRate = aiWins / metrics.totalGames;

    metrics.averageGameDuration = this.gameHistory.reduce(
      (acc, game) => acc + (game.duration || 0),
      0
    ) / metrics.totalGames;

    metrics.averageMovesPerGame = this.gameHistory.reduce(
      (acc, game) => acc + game.totalMoves,
      0
    ) / metrics.totalGames;

    // Update AI performance metrics
    const aiStats = this.calculatePerformanceStats(
      this.gameHistory.map(game => game.aiStats)
    );
    metrics.aiPerformance = aiStats;

    // Update player performance metrics
    const playerStats = this.calculatePerformanceStats(
      this.gameHistory.map(game => game.playerStats)
    );
    metrics.playerPerformance = playerStats;
  }

  private calculatePerformanceStats(stats: GameMetrics['aiStats'][]) {
    const totalBluffs = stats.reduce(
      (acc, stat) => acc + stat.successfulBluffs + stat.failedBluffs,
      0
    );
    const totalChallenges = stats.reduce(
      (acc, stat) => acc + stat.successfulChallenges + stat.failedChallenges,
      0
    );
    const totalMoves = stats.reduce(
      (acc, stat) => acc + stat.cardsPlayed + stat.totalPasses,
      0
    );

    return {
      bluffSuccessRate: totalBluffs > 0
        ? stats.reduce((acc, stat) => acc + stat.successfulBluffs, 0) / totalBluffs
        : 0,
      challengeSuccessRate: totalChallenges > 0
        ? stats.reduce((acc, stat) => acc + stat.successfulChallenges, 0) / totalChallenges
        : 0,
      averageCardsPerMove: totalMoves > 0
        ? stats.reduce((acc, stat) => acc + stat.cardsPlayed, 0) / totalMoves
        : 0,
      passFrequency: totalMoves > 0
        ? stats.reduce((acc, stat) => acc + stat.totalPasses, 0) / totalMoves
        : 0
    };
  }

  getAggregateMetrics(): AggregateMetrics {
    return { ...this.aggregateMetrics };
  }

  getGameHistory(limit: number = 10): GameMetrics[] {
    return this.gameHistory.slice(-limit);
  }

  getCurrentGameStats(): GameMetrics | null {
    return this.currentGame ? { ...this.currentGame } : null;
  }

  private calculateHandSizeMetrics(gameState: GameState): { playerHandSize: number; aiHandSize: number } {
    return {
      playerHandSize: gameState.playerHand.length,
      aiHandSize: gameState.aiHand.length
    };
  }
} 