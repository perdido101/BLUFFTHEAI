export interface Card {
  suit: string;
  value: string;
}

export interface GameState {
  playerHand: Card[];
  aiHand: Card[];
  centerPile: Card[];
  currentTurn: 'player' | 'ai';
  lastPlay?: {
    player: 'player' | 'ai';
    declaredCards: string;
    actualCards: Card[];
  };
  winner?: 'player' | 'ai' | null;
}

export interface GameAction {
  type: 'PLAY_CARDS' | 'CHALLENGE' | 'PASS';
  payload?: {
    cards: Card[];
    declaredValue: string;
  };
} 