import { GameState, GameAction, Card } from '../types';
import { PersistenceService } from './persistenceService';

interface StateActionPair {
  gameState: {
    aiCards: number;
    playerCards: number;
    centerPile: number;
    lastPlayValue?: string;
    lastPlayCount?: number;
  };
  action: {
    type: string;
    cardCount?: number;
    declaredValue?: string;
  };
}

interface QTableEntry {
  stateAction: StateActionPair;
  qValue: number;
  visits: number;
  rewards: number[];
}

export class ReinforcementLearningService {
  private qTable: Map<string, QTableEntry> = new Map();
  private readonly LEARNING_RATE = 0.1;
  private readonly DISCOUNT_FACTOR = 0.9;
  private readonly EXPLORATION_RATE = 0.2;
  private lastStateAction: StateActionPair | null = null;

  constructor(private persistenceService: PersistenceService) {
    this.loadQTable();
  }

  private async loadQTable() {
    const data = await this.persistenceService.loadQTable();
    if (data) {
      this.qTable = new Map(Object.entries(data));
    }
  }

  private async saveQTable() {
    const data = Object.fromEntries(this.qTable);
    await this.persistenceService.saveQTable(data);
  }

  private getStateKey(state: StateActionPair): string {
    return JSON.stringify({
      aiCards: state.gameState.aiCards,
      playerCards: state.gameState.playerCards,
      centerPile: state.gameState.centerPile,
      lastPlayValue: state.gameState.lastPlayValue,
      lastPlayCount: state.gameState.lastPlayCount,
      actionType: state.action.type,
      cardCount: state.action.cardCount,
      declaredValue: state.action.declaredValue
    });
  }

  private normalizeState(gameState: GameState): StateActionPair['gameState'] {
    return {
      aiCards: gameState.aiHand.length,
      playerCards: gameState.playerHand.length,
      centerPile: gameState.lastPlay ? gameState.lastPlay.actualCards.length : 0,
      lastPlayValue: gameState.lastPlay?.declaredCards,
      lastPlayCount: gameState.lastPlay?.actualCards.length
    };
  }

  private getQValue(stateAction: StateActionPair): number {
    const key = this.getStateKey(stateAction);
    return this.qTable.get(key)?.qValue || 0;
  }

  private updateQValue(stateAction: StateActionPair, reward: number, nextState: GameState) {
    const key = this.getStateKey(stateAction);
    const entry = this.qTable.get(key) || {
      stateAction,
      qValue: 0,
      visits: 0,
      rewards: []
    };

    // Get maximum Q-value for next state
    const possibleNextActions = this.getPossibleActions(nextState);
    const maxNextQ = Math.max(
      ...possibleNextActions.map(action => 
        this.getQValue({
          gameState: this.normalizeState(nextState),
          action
        })
      )
    );

    // Q-learning update rule
    const newQValue = entry.qValue + 
      this.LEARNING_RATE * (
        reward + 
        this.DISCOUNT_FACTOR * maxNextQ - 
        entry.qValue
      );

    entry.qValue = newQValue;
    entry.visits++;
    entry.rewards.push(reward);
    if (entry.rewards.length > 100) entry.rewards.shift();

    this.qTable.set(key, entry);
    this.saveQTable();
  }

  private getPossibleActions(gameState: GameState): StateActionPair['action'][] {
    const actions: StateActionPair['action'][] = [{ type: 'PASS' }];

    if (gameState.lastPlay && gameState.lastPlay.player === 'player') {
      actions.push({ type: 'CHALLENGE' });
    }

    if (gameState.aiHand.length > 0) {
      // Add possible card plays
      const cardCounts = [1, 2, 3, 4];
      const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      
      for (const count of cardCounts) {
        if (count <= gameState.aiHand.length) {
          for (const value of values) {
            if (!gameState.lastPlay || this.isHigherValue(value, gameState.lastPlay.declaredCards)) {
              actions.push({
                type: 'PLAY_CARDS',
                cardCount: count,
                declaredValue: value
              });
            }
          }
        }
      }
    }

    return actions;
  }

  private isHigherValue(value1: string, value2: string): boolean {
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return values.indexOf(value1) > values.indexOf(value2);
  }

  suggestAction(gameState: GameState): StateActionPair['action'] {
    const normalizedState = this.normalizeState(gameState);
    const possibleActions = this.getPossibleActions(gameState);

    // Exploration vs exploitation
    if (Math.random() < this.EXPLORATION_RATE) {
      return possibleActions[Math.floor(Math.random() * possibleActions.length)];
    }

    // Find action with highest Q-value
    let bestAction = possibleActions[0];
    let maxQValue = -Infinity;

    for (const action of possibleActions) {
      const qValue = this.getQValue({ gameState: normalizedState, action });
      if (qValue > maxQValue) {
        maxQValue = qValue;
        bestAction = action;
      }
    }

    this.lastStateAction = {
      gameState: normalizedState,
      action: bestAction
    };

    return bestAction;
  }

  updateFromGameResult(
    gameState: GameState,
    action: GameAction,
    reward: number,
    nextState: GameState
  ) {
    if (!this.lastStateAction) return;

    const normalizedAction: StateActionPair['action'] = {
      type: action.type,
      cardCount: action.payload?.cards?.length,
      declaredValue: action.payload?.declaredValue
    };

    const stateAction: StateActionPair = {
      gameState: this.normalizeState(gameState),
      action: normalizedAction
    };

    this.updateQValue(stateAction, reward, nextState);
  }

  getActionStats(stateAction: StateActionPair): {
    qValue: number;
    visits: number;
    averageReward: number;
  } {
    const key = this.getStateKey(stateAction);
    const entry = this.qTable.get(key);

    if (!entry) {
      return {
        qValue: 0,
        visits: 0,
        averageReward: 0
      };
    }

    return {
      qValue: entry.qValue,
      visits: entry.visits,
      averageReward: entry.rewards.reduce((a, b) => a + b, 0) / entry.rewards.length
    };
  }

  getExplorationRate(): number {
    return this.EXPLORATION_RATE;
  }

  getLearningProgress(): {
    totalStates: number;
    averageQValue: number;
    mostVisitedStates: Array<{ state: StateActionPair; visits: number }>;
  } {
    const entries = Array.from(this.qTable.values());
    const totalStates = entries.length;
    const averageQValue = entries.reduce((sum, entry) => sum + entry.qValue, 0) / totalStates;

    const mostVisitedStates = entries
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10)
      .map(entry => ({
        state: entry.stateAction,
        visits: entry.visits
      }));

    return {
      totalStates,
      averageQValue,
      mostVisitedStates
    };
  }

  private selectBestCards(
    gameState: GameState,
    currentValue: string | null,
    shouldBluff: boolean,
    riskTolerance: number,
    opponentChallengeProb: number
  ): { cards: Card[], declaredValue: string } | null {
    const aiCards = gameState.aiHand;
    if (aiCards.length === 0) return null;

    // Group cards by value
    const cardGroups = this.groupCardsByValue(aiCards);
    
    // If we're following a play, we need to match or beat the current value
    if (currentValue) {
      const validGroups = this.getValidCardGroups(cardGroups, currentValue);
      
      if (validGroups.length > 0) {
        // Play real cards if we have them
        const bestGroup = this.selectBestCardGroup(validGroups, riskTolerance);
        return {
          cards: bestGroup.cards,
          declaredValue: bestGroup.value
        };
      } else if (shouldBluff && opponentChallengeProb < 0.7) {
        // Bluff if conditions are favorable
        return this.createBluff(aiCards, currentValue, riskTolerance);
      }
      
      return null; // Pass if we can't play legally and shouldn't bluff
    }

    // If we're starting a new round, choose the best cards to play
    const bestGroup = this.selectBestCardGroup(Object.values(cardGroups), riskTolerance);
    if (shouldBluff && opponentChallengeProb < 0.5) {
      // Sometimes bluff with a higher value
      const bluffValue = this.selectBluffValue(bestGroup.value);
      return {
        cards: bestGroup.cards,
        declaredValue: bluffValue
      };
    }

    return {
      cards: bestGroup.cards,
      declaredValue: bestGroup.value
    };
  }
} 