import { Card } from './Card';

export interface GameState {
  aiHand: Card[];
  playerHand: Card[];
  centerPile: Card[];
  currentTurn: 'player' | 'ai';
  lastPlay?: {
    player: 'player' | 'ai';
    declaredCards: string;
    actualCards: Card[];
  };
}

export interface GameAction {
  type: 'PLAY_CARDS' | 'CHALLENGE' | 'PASS';
  payload?: {
    cards: Card[];
    declaredValue: string;
  };
}

export interface GameHistory {
  id: string;
  timestamp: number;
  moves: Array<{
    player: 'ai' | 'player';
    action: GameAction;
    timestamp: number;
  }>;
  winner: 'ai' | 'player' | null;
  duration: number;
  finalState: GameState;
}

export interface DecisionMetrics {
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

export interface ModelPerformance {
  accuracy: number;
  bluffSuccessRate: number;
  challengeSuccessRate: number;
  averageReward: number;
  gamesPlayed: number;
  totalMoves: number;
}

export { Card };
export type { GameState, GameAction }; 