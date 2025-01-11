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

// Type definitions for service responses
interface PatternPrediction {
  likelyToBluff: number;
  likelyToChallenge: number;
}

interface PlayerStats {
  winRate: number;
  bluffSuccessRate: number;
  challengeSuccessRate: number;
  totalGames: number;
  averageMovesPerGame: number;
}

interface OptimalStrategy {
  recommendedAction: 'PLAY_CARDS' | 'CHALLENGE' | 'PASS';
  confidence: number;
  alternativeActions: Array<{
    action: 'PLAY_CARDS' | 'CHALLENGE' | 'PASS';
    confidence: number;
  }>;
}

interface PersonalityTraits {
  aggressiveness: number;
  deceptiveness: number;
  confidence: number;
  impulsiveness: number;
  adaptability: number;
  [key: string]: number;
}

interface DifficultyModifiers {
  bluffProbabilityMultiplier: number;
  riskToleranceMultiplier: number;
  [key: string]: number;
}

interface ChatAnalysis {
  sentiment: {
    score: number;  // -1 to 1
    confidence: number;
    dominantEmotion: string;
  };
  bluffIndicators: {
    probability: number;
    confidence: number;
  };
  keyPhrases: string[];
}

interface MLInsights {
  patterns: PatternPrediction;
  playerStats: PlayerStats;
  optimalStrategy: OptimalStrategy;
  personalityTraits: PersonalityTraits;
  chatAnalysis?: ChatAnalysis;
}

interface DecisionMetrics {
  bluffProbability: number;
  challengeProbability: number;
  patternConfidence: number;
  riskLevel: number;
}

interface RLSuggestion {
  type: 'PLAY_CARDS' | 'CHALLENGE' | 'PASS';
  cardCount?: number;
  declaredValue?: string;
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

  private async evaluateChallengeDecision(
    gameState: GameState,
    mlInsights: MLInsights,
    difficultyModifiers: DifficultyModifiers
  ): Promise<boolean> {
    const baseChallengeProbability = mlInsights.patterns.likelyToChallenge;
    const adjustedProbability = baseChallengeProbability * difficultyModifiers.riskToleranceMultiplier;
    
    // Consider chat analysis if available
    if (mlInsights.chatAnalysis?.bluffIndicators.probability) {
      return adjustedProbability * mlInsights.chatAnalysis.bluffIndicators.probability > 0.5;
    }
    
    return adjustedProbability > 0.5;
  }

  private async selectCardsForPlay(
    gameState: GameState,
    count: number,
    declaredValue: string
  ): Promise<Card[]> {
    // Select cards that match the declared value first
    const matchingCards = gameState.aiHand.filter(card => card.value === declaredValue);
    const selectedCards: Card[] = matchingCards.slice(0, count);
    
    // If we need more cards, add random ones
    while (selectedCards.length < count && gameState.aiHand.length > selectedCards.length) {
      const remainingCards = gameState.aiHand.filter(card => !selectedCards.includes(card));
      selectedCards.push(remainingCards[0]);
    }
    
    return selectedCards;
  }

  private selectBluffValue(defaultValue: string): string {
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const index = Math.floor(Math.random() * values.length);
    return values[index];
  }

  private async decideCardPlay(
    gameState: GameState,
    mlInsights: MLInsights,
    difficultyModifiers: DifficultyModifiers
  ): Promise<GameAction> {
    const shouldBluff = Math.random() < (mlInsights.patterns.likelyToBluff * difficultyModifiers.bluffProbabilityMultiplier);
    const cardCount = Math.min(Math.ceil(Math.random() * 3), gameState.aiHand.length);
    const declaredValue = shouldBluff ? this.selectBluffValue('A') : gameState.aiHand[0].value;
    
    return {
      type: 'PLAY_CARDS',
      payload: {
        cards: await this.selectCardsForPlay(gameState, cardCount, declaredValue),
        declaredValue
      }
    };
  }

  async makeDecision(gameState: GameState, playerChat?: string): Promise<GameAction> {
    try {
      this.errorHandler.validateGameState(gameState);

      const difficultyModifiers = this.adaptiveDifficulty.getDifficultyModifiers(gameState);
      const cachedDecision = await this.errorRecovery.withFallback(
        async () => this.cacheService.getCachedDecision(gameState),
        async () => null,
        'cache'
      );

      if (cachedDecision) {
        this.errorHandler.validateAction(cachedDecision);
        return cachedDecision;
      }

      const mlInsights = await this.getMLInsights(gameState, playerChat);
      const rlSuggestion = this.reinforcementLearning.suggestAction(gameState) as RLSuggestion;
      let alternativesConsidered: string[] = [];
      let decision: GameAction;

      if (gameState.lastPlay && gameState.lastPlay.player === 'player') {
        const shouldChallenge = await this.evaluateChallengeDecision(
          gameState,
          mlInsights,
          difficultyModifiers
        );

        alternativesConsidered = ['PASS', 'CHALLENGE'];
        decision = rlSuggestion.type === 'CHALLENGE' || shouldChallenge
          ? { type: 'CHALLENGE' }
          : { type: 'PASS' };
      } else if (gameState.aiHand.length > 0) {
        alternativesConsidered = ['PASS', 'PLAY_CARDS'];
        
        if (rlSuggestion.type === 'PLAY_CARDS' && rlSuggestion.cardCount && rlSuggestion.declaredValue) {
          const shouldBluff = Math.random() < (difficultyModifiers.bluffProbabilityMultiplier * 0.8);
          const declaredValue = shouldBluff 
            ? this.selectBluffValue(rlSuggestion.declaredValue)
            : rlSuggestion.declaredValue;

          decision = {
            type: 'PLAY_CARDS',
            payload: {
              cards: await this.selectCardsForPlay(
                gameState,
                rlSuggestion.cardCount,
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

      const metrics: DecisionMetrics = {
        bluffProbability: mlInsights.patterns.likelyToBluff * difficultyModifiers.bluffProbabilityMultiplier,
        challengeProbability: mlInsights.patterns.likelyToChallenge,
        patternConfidence: mlInsights.patterns.likelyToBluff,
        riskLevel: mlInsights.personalityTraits.riskTolerance * difficultyModifiers.riskToleranceMultiplier
      };

      await this.errorRecovery.withRetry(
        async () => this.modelMonitoring.recordDecision(
          gameState,
          metrics,
          decision,
          alternativesConsidered
        ),
        'monitoring'
      );

      await this.errorRecovery.withRetry(
        async () => this.cacheService.cacheDecision(gameState, decision),
        'cache'
      );

      return decision;
    } catch (error) {
      console.error('Error in makeDecision:', error);
      return this.errorHandler.handleDecisionError(
        error instanceof Error ? error : new Error(String(error)),
        gameState
      );
    }
  }

  async getMLInsights(gameState: GameState, playerChat?: string): Promise<MLInsights> {
    try {
      const [patterns, playerStats, optimalStrategy, personalityTraits] = await Promise.all([
        this.patternRecognition.analyzePatterns(gameState),
        this.aiStrategy.getPlayerAnalysis(),
        this.adaptiveLearning.getOptimalStrategy(gameState),
        this.aiPersonality.getPersonalityTraits()
      ]);

      const difficultyModifiers = await this.adaptiveDifficulty.getDifficultyModifiers(gameState);

      let chatAnalysis: ChatAnalysis | undefined;
      if (playerChat) {
        chatAnalysis = await this.chatAnalysis.analyzeChatMessage(playerChat);
      }

      const insights: MLInsights = {
        patterns,
        playerStats,
        optimalStrategy,
        personalityTraits,
        chatAnalysis
      };

      return insights;
    } catch (error) {
      throw this.errorHandler.handleMLError(error);
    }
  }

  private async analyzeChatMessage(message: string, gameState: GameState): Promise<ChatAnalysis> {
    try {
      return await this.chatAnalysis.analyzeChatMessage(message, gameState);
    } catch (error) {
      console.error('Chat analysis failed:', error);
      return {
        sentiment: {
          score: 0,
          confidence: 0,
          dominantEmotion: 'unknown'
        },
        bluffIndicators: {
          probability: 0,
          confidence: 0
        },
        keyPhrases: []
      };
    }
  }
} 