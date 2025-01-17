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
  aiCards?: Card[];  // For backward compatibility
} 