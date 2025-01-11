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

export { Card } from './Card'; 