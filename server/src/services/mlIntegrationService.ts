import { GameState, GameAction, Card } from '../types';
import { AIStrategyService } from './aiStrategyService';
import { PatternRecognitionService } from './patternRecognitionService';
import { AdaptiveLearningService } from './adaptiveLearningService';
import { AIPersonalityService } from './aiPersonalityService';
import { ModelMonitoringService } from './modelMonitoringService';
import { CacheService } from './cacheService';
import { ErrorHandlingService } from './errorHandlingService';
import { ErrorRecoveryService } from './errorRecoveryService';
import { ReinforcementLearningService } from './reinforcementLearningService';
import { AdaptiveDifficultyService } from './adaptiveDifficultyService';
import { ChatAnalysisService } from './chatAnalysisService';

// New interfaces for NLP integration
interface ChatAnalysis {
  sentiment: number;  // -1 to 1
  confidence: number;
  detectedBluff: boolean;
  emotionalState: string;
  keyPhrases: string[];
}

interface MLInsights {
  patterns: {
    likelyToBluff: number;
    likelyToChallenge: number;
  };
  playerStats: any;
  optimalStrategy: any;
  personalityTraits: any;
  chatAnalysis?: ChatAnalysis;
}

export class MLIntegrationService {
  private cacheService: CacheService;
  private errorHandler: ErrorHandlingService;
  private errorRecovery: ErrorRecoveryService;
  private chatAnalysis: ChatAnalysisService;
  private recentMoves: GameAction[] = [];
  private readonly MAX_RECENT_MOVES = 10;

  constructor(
    private aiStrategy: AIStrategyService,
    private patternRecognition: PatternRecognitionService,
    private adaptiveLearning: AdaptiveLearningService,
    private aiPersonality: AIPersonalityService,
    private modelMonitoring: ModelMonitoringService,
    private reinforcementLearning: ReinforcementLearningService,
    private adaptiveDifficulty: AdaptiveDifficultyService
  ) {
    this.cacheService = new CacheService();
    this.errorHandler = new ErrorHandlingService();
    this.errorRecovery = new ErrorRecoveryService();
    this.chatAnalysis = new ChatAnalysisService();
  }

  async makeDecision(gameState: GameState, playerChat?: string): Promise<GameAction> {
    try {
      this.errorHandler.validateGameState(gameState);

      // Get difficulty modifiers
      const difficultyModifiers = this.adaptiveDifficulty.getDifficultyModifiers(gameState);

      // Try to get cached decision with retry and fallback
      const cachedDecision = await this.errorRecovery.withFallback(
        async () => this.cacheService.getCachedDecision(gameState),
        async () => null,
        'cache'
      );

      if (cachedDecision) {
        this.errorHandler.validateAction(cachedDecision);
        return cachedDecision;
      }

      // Get ML insights with retry
      const mlInsights = await this.getMLInsights(gameState, playerChat);

      // Get reinforcement learning suggestion
      const rlSuggestion = this.reinforcementLearning.suggestAction(gameState);

      let alternativesConsidered: string[] = [];
      let decision: GameAction;

      // If there's a last play by the player, decide whether to challenge
      if (gameState.lastPlay && gameState.lastPlay.player === 'player') {
        const shouldChallenge = await this.evaluateChallengeDecision(
          gameState,
          mlInsights,
          difficultyModifiers
        );

        alternativesConsidered = ['PASS', 'CHALLENGE'];
        
        // Combine RL suggestion with ML insights and difficulty
        decision = rlSuggestion.type === 'CHALLENGE' || shouldChallenge
          ? { type: 'CHALLENGE' }
          : { type: 'PASS' };
      } else if (gameState.aiHand.length > 0) {
        // AI's turn to play cards
        alternativesConsidered = ['PASS', 'PLAY_CARDS'];
        
        if (rlSuggestion.type === 'PLAY_CARDS') {
          // Use RL's card count and value suggestion with difficulty adjustment
          const shouldBluff = Math.random() < (difficultyModifiers.bluffProbabilityMultiplier * 0.8);
          const declaredValue = shouldBluff 
            ? this.selectBluffValue(rlSuggestion.declaredValue || 'A')
            : rlSuggestion.declaredValue || 'A';

          decision = {
            type: 'PLAY_CARDS',
            payload: {
              cards: await this.selectCardsForPlay(
                gameState,
                rlSuggestion.cardCount || 1,
                declaredValue
              ),
              declaredValue
            }
          };
        } else {
          decision = await this.decideCardPlay(
            gameState,
            mlInsights,
            difficultyModifiers
          );
        }
      } else {
        alternativesConsidered = ['PASS'];
        decision = { type: 'PASS' };
      }

      this.errorHandler.validateAction(decision);

      // Record decision with retry
      await this.errorRecovery.withRetry(
        async () => this.modelMonitoring.recordDecision(
          gameState,
          {
            bluffProbability: mlInsights.patterns.likelyToBluff * difficultyModifiers.bluffProbabilityMultiplier,
            challengeProbability: mlInsights.patterns.likelyToChallenge,
            patternConfidence: mlInsights.patterns.likelyToBluff,
            riskLevel: mlInsights.personalityTraits.riskTolerance * difficultyModifiers.riskToleranceMultiplier
          },
          decision,
          alternativesConsidered
        ),
        'monitoring'
      );

      // Cache the decision with retry
      await this.errorRecovery.withRetry(
        async () => this.cacheService.cacheDecision(gameState, decision),
        'cache'
      );

      return decision;
    } catch (error) {
      if (error instanceof Error) {
        return this.errorHandler.handleDecisionError(error, gameState);
      }
      return this.errorHandler.handleDecisionError(new Error(String(error)), gameState);
    }
  }

  private async getMLInsights(gameState: GameState, playerChat?: string): Promise<MLInsights> {
    try {
      // Try to get cached predictions with retry and fallback
      const cachedPredictions = await this.errorRecovery.withFallback(
        async () => this.cacheService.getCachedModelPrediction(gameState, this.recentMoves),
        async () => null,
        'cache'
      );

      if (cachedPredictions) {
        return cachedPredictions;
      }

      // Get predictions from each service with retry
      const [patterns, playerStats, optimalStrategy, personalityTraits] = await Promise.all([
        this.errorRecovery.withRetry(
          async () => this.patternRecognition.getPrediction(),
          'prediction'
        ),
        this.errorRecovery.withRetry(
          async () => this.aiStrategy.getPlayerAnalysis(),
          'strategy'
        ),
        this.errorRecovery.withRetry(
          async () => this.adaptiveLearning.getOptimalStrategy(gameState),
          'learning'
        ),
        this.errorRecovery.withRetry(
          async () => this.aiPersonality.getPersonalityTraits(),
          'personality'
        )
      ]);

      const insights: MLInsights = {
        patterns,
        playerStats,
        optimalStrategy,
        personalityTraits
      };

      // If player chat is available, analyze it
      if (playerChat) {
        insights.chatAnalysis = await this.analyzeChatMessage(playerChat, gameState);
      }

      // Cache the predictions with retry
      await this.errorRecovery.withRetry(
        async () => this.cacheService.cacheModelPrediction(
          gameState,
          this.recentMoves,
          insights
        ),
        'cache'
      );

      return insights;
    } catch (error) {
      return this.errorHandler.handlePredictionError(error, gameState);
    }
  }

  // New method for chat analysis
  private async analyzeChatMessage(message: string, gameState: GameState): Promise<ChatAnalysis> {
    try {
      const analysis = await this.chatAnalysis.analyzeChatMessage(message, gameState);
      
      return {
        sentiment: analysis.sentiment.score,
        confidence: analysis.sentiment.confidence,
        detectedBluff: analysis.bluffIndicators.probability > 0.6,
        emotionalState: analysis.sentiment.dominantEmotion,
        keyPhrases: analysis.keyPhrases
      };
    } catch (error) {
      console.error('Chat analysis failed:', error);
      return {
        sentiment: 0,
        confidence: 0,
        detectedBluff: false,
        emotionalState: 'unknown',
        keyPhrases: []
      };
    }
  }

  async updateModel(action: GameAction, result: boolean, gameState: GameState) {
    try {
      // Validate inputs
      this.errorHandler.validateGameState(gameState);
      this.errorHandler.validateAction(action);

      // Update recent moves list
      this.recentMoves.push(action);
      if (this.recentMoves.length > this.MAX_RECENT_MOVES) {
        this.recentMoves.shift();
      }

      // Invalidate relevant caches
      try {
        await this.cacheService.invalidateDecisionCache(gameState);
      } catch (error) {
        if (error instanceof Error) {
          this.errorHandler.handleCacheError(error, 'invalidateDecisionCache');
        } else {
          this.errorHandler.handleCacheError(new Error(String(error)), 'invalidateDecisionCache');
        }
      }

      // Calculate reward based on action result
      const reward = this.calculateReward(action, result, gameState);

      // Update all learning components
      await Promise.all([
        this.patternRecognition.analyzePatterns(action, gameState),
        this.adaptiveLearning.learn(action, result, gameState),
        this.aiStrategy.updatePlayerPatterns(action, result),
        this.reinforcementLearning.updateFromGameResult(
          gameState,
          action,
          reward,
          gameState // Use current state as next state since we don't track full state history
        )
      ]).catch(error => {
        throw error;
      });

      await this.modelMonitoring.recordOutcome(result, reward);
    } catch (error) {
      this.errorHandler.logError(error, true, 'Continuing with partial model update');
    }
  }

  getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  private evaluateChallengeDecision(
    gameState: GameState,
    mlInsights: MLInsights,
    difficultyModifiers: {
      bluffProbabilityMultiplier: number;
      challengeThresholdMultiplier: number;
      riskToleranceMultiplier: number;
    }
  ): boolean {
    let bluffProbability = this.calculateBluffProbability(
      gameState,
      mlInsights.patterns,
      mlInsights.playerStats,
      mlInsights.chatAnalysis
    );

    // Consider chat analysis in bluff probability if available
    if (mlInsights.chatAnalysis) {
      const chatBluffWeight = mlInsights.chatAnalysis.confidence;
      bluffProbability = 
        bluffProbability * (1 - chatBluffWeight) +
        (mlInsights.chatAnalysis.detectedBluff ? 1 : 0) * chatBluffWeight;
    }

    // Combine ML insights with personality traits and difficulty
    const challengeThreshold = mlInsights.personalityTraits.challengeThreshold * 
      difficultyModifiers.challengeThresholdMultiplier;
    const riskTolerance = mlInsights.personalityTraits.riskTolerance * 
      difficultyModifiers.riskToleranceMultiplier;

    // Adjust threshold based on optimal strategy and difficulty
    const adjustedThreshold = 
      challengeThreshold * (1 - riskTolerance) +
      (mlInsights.patterns.likelyToBluff * riskTolerance);

    return bluffProbability > adjustedThreshold;
  }

  private calculateBluffProbability(
    gameState: GameState,
    patterns: { likelyToBluff: number; likelyToChallenge: number },
    playerStats: any,
    chatAnalysis?: ChatAnalysis
  ): number {
    const lastPlay = gameState.lastPlay!;
    const cardsPlayed = lastPlay.actualCards.length;
    const remainingCards = gameState.playerHand.length;

    // Combine historical patterns with current game state
    let baseProb = (cardsPlayed / 4) * 0.3 + 
                   ((13 - remainingCards) / 13) * 0.2 +
                   patterns.likelyToBluff * 0.3 +
                   playerStats.bluffFrequency * 0.2;

    // Adjust based on chat analysis if available
    if (chatAnalysis) {
      // Increase probability if chat suggests bluffing
      if (chatAnalysis.detectedBluff) {
        baseProb += 0.2 * chatAnalysis.confidence;
      }
      
      // Adjust based on emotional state
      switch (chatAnalysis.emotionalState) {
        case 'nervous':
          baseProb += 0.15;
          break;
        case 'aggressive':
          baseProb += 0.1;
          break;
        case 'confident':
          // Overconfidence might indicate bluffing
          baseProb += 0.1;
          break;
      }
    }

    return Math.min(Math.max(baseProb, 0), 1);
  }

  private decideCardPlay(
    gameState: GameState,
    mlInsights: MLInsights,
    difficultyModifiers: {
      bluffProbabilityMultiplier: number;
      challengeThresholdMultiplier: number;
      riskToleranceMultiplier: number;
    }
  ): GameAction {
    let shouldBluff = Math.random() < (difficultyModifiers.bluffProbabilityMultiplier * 0.8);
    
    // Adjust bluffing decision based on chat analysis
    if (mlInsights.chatAnalysis) {
      // If player seems uncertain or aggressive, increase bluff probability
      if (mlInsights.chatAnalysis.emotionalState === 'nervous' ||
          mlInsights.chatAnalysis.emotionalState === 'aggressive') {
        shouldBluff = shouldBluff || Math.random() < 0.7;
      }
      
      // If player seems very confident, maybe call their bluff instead
      if (mlInsights.chatAnalysis.emotionalState === 'confident' &&
          mlInsights.chatAnalysis.confidence > 0.7) {
        shouldBluff = shouldBluff && Math.random() < 0.3;
      }
    }

    const riskTolerance = mlInsights.personalityTraits.riskTolerance * 
      difficultyModifiers.riskToleranceMultiplier;

    // Get the current game context
    const lastPlay = gameState.lastPlay;
    const currentValue = lastPlay ? lastPlay.declaredCards : null;
    
    // Select cards based on game state, ML insights, and difficulty
    const cardSelection = this.selectBestCards(
      gameState,
      currentValue,
      shouldBluff,
      riskTolerance,
      mlInsights.patterns.likelyToChallenge
    );

    if (!cardSelection) {
      return { type: 'PASS' };
    }

    return {
      type: 'PLAY_CARDS',
      payload: cardSelection
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

  private groupCardsByValue(cards: Card[]): { [key: string]: { value: string, cards: Card[] } } {
    const groups: { [key: string]: { value: string, cards: Card[] } } = {};
    
    cards.forEach(card => {
      if (!groups[card.value]) {
        groups[card.value] = { value: card.value, cards: [] };
      }
      groups[card.value].cards.push(card);
    });

    return groups;
  }

  private getValidCardGroups(
    groups: { [key: string]: { value: string, cards: Card[] } },
    currentValue: string
  ): { value: string, cards: Card[] }[] {
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const currentIdx = values.indexOf(currentValue);
    
    return Object.values(groups).filter(group => 
      values.indexOf(group.value) >= currentIdx
    );
  }

  private selectBestCardGroup(
    groups: { value: string, cards: Card[] }[],
    riskTolerance: number
  ): { value: string, cards: Card[] } {
    // Sort groups by size (prefer playing more cards) and value
    return groups.sort((a, b) => {
      if (a.cards.length !== b.cards.length) {
        return b.cards.length - a.cards.length;
      }
      const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      return values.indexOf(a.value) - values.indexOf(b.value);
    })[0];
  }

  private createBluff(
    cards: Card[],
    currentValue: string,
    riskTolerance: number
  ): { cards: Card[], declaredValue: string } {
    // Select lowest value cards for bluffing
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const currentIdx = values.indexOf(currentValue);
    const bluffValue = values[Math.min(currentIdx + 1, values.length - 1)];
    
    // Use 1-2 cards for bluffing based on risk tolerance
    const numCards = riskTolerance > 0.7 ? 2 : 1;
    const bluffCards = cards
      .sort((a, b) => values.indexOf(a.value) - values.indexOf(b.value))
      .slice(0, numCards);

    return {
      cards: bluffCards,
      declaredValue: bluffValue
    };
  }

  private selectBluffValue(actualValue: string): string {
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const currentIdx = values.indexOf(actualValue);
    const maxBluffIdx = Math.min(currentIdx + 2, values.length - 1);
    return values[maxBluffIdx];
  }

  private calculateReward(action: GameAction, result: boolean, gameState: GameState): number {
    let reward = 0;

    switch (action.type) {
      case 'CHALLENGE':
        reward = result ? 10 : -5;
        break;
      case 'PLAY_CARDS':
        if (action.payload?.cards) {
          reward = result ? action.payload.cards.length * 2 : -action.payload.cards.length;
        }
        break;
      case 'PASS':
        reward = 0;
        break;
    }

    // Adjust reward based on game state
    if (gameState.aiHand.length === 0) {
      reward += 20; // Win bonus
    }

    return reward;
  }

  private async selectCardsForPlay(
    gameState: GameState,
    count: number,
    declaredValue: string
  ): Promise<Card[]> {
    const aiCards = gameState.aiHand;
    if (aiCards.length === 0 || count > aiCards.length) {
      return [];
    }

    // Group cards by value for efficient selection
    const cardGroups = this.groupCardsByValue(aiCards);
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    // Try to find matching cards first
    if (cardGroups[declaredValue]) {
      const matchingCards = cardGroups[declaredValue].cards;
      if (matchingCards.length >= count) {
        // We have enough matching cards
        return matchingCards.slice(0, count);
      }
    }

    // If we need to bluff, select optimal cards
    const currentValueIndex = values.indexOf(declaredValue);
    
    // Sort cards by value (prefer using lower value cards for bluffing)
    const sortedGroups = Object.values(cardGroups).sort((a, b) => {
      const aIndex = values.indexOf(a.value);
      const bIndex = values.indexOf(b.value);
      
      // Prefer cards further from declared value
      const aDist = Math.abs(currentValueIndex - aIndex);
      const bDist = Math.abs(currentValueIndex - bIndex);
      
      if (aDist !== bDist) return bDist - aDist;
      
      // If distances are equal, prefer lower values
      return aIndex - bIndex;
    });

    // Select cards for bluffing
    const selectedCards: Card[] = [];
    let remainingCount = count;

    // Try to use cards from the same value group when possible
    for (const group of sortedGroups) {
      if (remainingCount <= 0) break;
      
      const cardsToTake = Math.min(remainingCount, group.cards.length);
      selectedCards.push(...group.cards.slice(0, cardsToTake));
      remainingCount -= cardsToTake;
    }

    // If we couldn't find enough cards, return what we have
    return selectedCards;
  }
} 