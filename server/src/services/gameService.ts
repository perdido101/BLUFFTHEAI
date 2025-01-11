import { Card, GameState, GameAction } from '../types';

const CARD_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
const CARD_SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;

export class GameService {
  private createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of CARD_SUITS) {
      for (const value of CARD_VALUES) {
        deck.push({ suit, value });
      }
    }
    return this.shuffleDeck(deck);
  }

  private shuffleDeck(deck: Card[]): Card[] {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  initializeGame(): GameState {
    const deck = this.createDeck();
    const halfDeck = Math.floor(deck.length / 2);

    return {
      playerHand: deck.slice(0, halfDeck),
      aiHand: deck.slice(halfDeck),
      centerPile: [],
      currentTurn: 'player',
      lastPlay: undefined
    };
  }

  private isValidPlay(cards: Card[], declaredValue: string): boolean {
    return cards.length > 0 && CARD_VALUES.includes(declaredValue as any);
  }

  private checkBluff(cards: Card[], declaredValue: string): boolean {
    return cards.some(card => card.value !== declaredValue);
  }

  async processMove(action: GameAction, gameState: GameState): Promise<GameState> {
    switch (action.type) {
      case 'PLAY_CARDS': {
        if (!action.payload?.cards || !action.payload.declaredValue) {
          throw new Error('Invalid play action');
        }

        if (!this.isValidPlay(action.payload.cards, action.payload.declaredValue)) {
          throw new Error('Invalid cards or declared value');
        }

        return {
          ...gameState,
          playerHand: gameState.playerHand.filter(
            card => !action.payload?.cards?.includes(card)
          ),
          centerPile: [...gameState.centerPile, ...action.payload.cards],
          currentTurn: 'ai',
          lastPlay: {
            player: 'player',
            declaredCards: action.payload.declaredValue,
            actualCards: action.payload.cards
          }
        };
      }

      case 'CHALLENGE': {
        if (!gameState.lastPlay) {
          throw new Error('No play to challenge');
        }

        const wasBluffing = this.checkBluff(
          gameState.lastPlay.actualCards,
          gameState.lastPlay.declaredCards
        );

        const newState = { ...gameState };
        if (wasBluffing) {
          // Last player was bluffing, they pick up the pile
          if (gameState.lastPlay.player === 'ai') {
            newState.aiHand += gameState.centerPile.length;
          } else {
            newState.playerHand = [...newState.playerHand, ...gameState.centerPile];
          }
        } else {
          // Challenger was wrong, they pick up the pile
          if (gameState.currentTurn === 'ai') {
            newState.aiHand = [...newState.aiHand, ...gameState.centerPile];
          } else {
            newState.playerHand = [...newState.playerHand, ...gameState.centerPile];
          }
        }

        newState.centerPile = [];
        newState.lastPlay = undefined;
        newState.currentTurn = wasBluffing ? 'player' : 'ai';

        return newState;
      }

      case 'PASS': {
        return {
          ...gameState,
          currentTurn: gameState.currentTurn === 'player' ? 'ai' : 'player',
          lastPlay: undefined
        };
      }

      default:
        throw new Error('Invalid action type');
    }
  }

  checkWinCondition(gameState: GameState): 'player' | 'ai' | null {
    if (gameState.playerHand.length === 0) return 'player';
    if (gameState.aiHand.length === 0) return 'ai';
    return null;
  }
}

export const gameService = new GameService(); 