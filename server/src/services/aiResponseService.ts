import { GameState, GameAction } from '../types';
import { ChatAnalysisService } from './chatAnalysisService';

// Re-export the ChatAnalysisResult interface
export interface ChatAnalysisResult {
  sentiment: {
    score: number;
    confidence: number;
    dominantEmotion: string;
  };
  bluffIndicators: {
    probability: number;
    confidence: number;
  };
  keyPhrases: string[];
}

interface ResponseContext {
  gameState: GameState;
  lastAction?: GameAction;
  chatAnalysis?: ChatAnalysisResult;
  aiPersonality: AIPersonality;
}

interface AIPersonality {
  confidence: number;     // 0 to 1
  aggression: number;     // 0 to 1
  deception: number;      // 0 to 1
  friendliness: number;   // 0 to 1
}

type ResponseType = 
  | 'CHALLENGE_RESPONSE'
  | 'BLUFF_DEFENSE'
  | 'CARD_PLAY'
  | 'VICTORY'
  | 'DEFEAT'
  | 'TAUNT'
  | 'COMPLIMENT'
  | 'GENERAL';

interface ResponseTemplate {
  text: string;
  minConfidence?: number;
  minAggression?: number;
  maxAggression?: number;
  minDeception?: number;
  gamePhase?: 'early' | 'mid' | 'late';
  requiresBluffing?: boolean;
}

export class AIResponseService {
  private readonly responseTemplates: Record<ResponseType, ResponseTemplate[]> = {
    CHALLENGE_RESPONSE: [
      {
        text: "Nice try, but you're wrong this time!",
        minConfidence: 0.7
      },
      {
        text: "Hah! I knew you'd fall for that!",
        minConfidence: 0.8,
        minDeception: 0.6
      },
      {
        text: "Your instincts need some work...",
        minAggression: 0.6
      }
    ],
    BLUFF_DEFENSE: [
      {
        text: "I assure you, these cards are exactly what I claimed.",
        minDeception: 0.7
      },
      {
        text: "Do you really want to risk challenging that?",
        minConfidence: 0.6,
        minAggression: 0.5
      },
      {
        text: "Trust me, you don't want to challenge this hand.",
        minDeception: 0.8,
        requiresBluffing: true
      }
    ],
    CARD_PLAY: [
      {
        text: "Watch and learn!",
        minConfidence: 0.7,
        gamePhase: 'early'
      },
      {
        text: "Let's see how you handle this...",
        minDeception: 0.6,
        gamePhase: 'mid'
      },
      {
        text: "This should end things quickly.",
        minAggression: 0.7,
        gamePhase: 'late'
      }
    ],
    VICTORY: [
      {
        text: "Good game! You played well.",
        maxAggression: 0.3
      },
      {
        text: "Better luck next time!",
        minConfidence: 0.6
      },
      {
        text: "That's how it's done!",
        minAggression: 0.7
      }
    ],
    DEFEAT: [
      {
        text: "Well played! You've got skill.",
        maxAggression: 0.4
      },
      {
        text: "I'll get you next time!",
        minConfidence: 0.6
      },
      {
        text: "Impressive strategy...",
        minAggression: 0.5
      }
    ],
    TAUNT: [
      {
        text: "Is that really the best move you've got?",
        minAggression: 0.7
      },
      {
        text: "You seem nervous... something wrong?",
        minDeception: 0.6
      },
      {
        text: "I can read you like a book!",
        minConfidence: 0.8
      }
    ],
    COMPLIMENT: [
      {
        text: "Nice move! You're getting better.",
        maxAggression: 0.3
      },
      {
        text: "That was clever, I'll give you that.",
        minConfidence: 0.5
      },
      {
        text: "You're making this interesting!",
        minConfidence: 0.6
      }
    ],
    GENERAL: [
      {
        text: "Let's see what you've got.",
        gamePhase: 'early'
      },
      {
        text: "The game is getting interesting.",
        gamePhase: 'mid'
      },
      {
        text: "This is the crucial moment.",
        gamePhase: 'late'
      }
    ]
  };

  async generateResponse(
    type: ResponseType,
    context: ResponseContext
  ): Promise<string> {
    const gamePhase = this.determineGamePhase(context.gameState);
    const isBluffing = this.isAIBluffing(context.lastAction);
    
    // Filter templates based on context
    const validTemplates = this.responseTemplates[type].filter(template => {
      if (template.gamePhase && template.gamePhase !== gamePhase) return false;
      if (template.requiresBluffing && !isBluffing) return false;
      
      if (template.minConfidence && context.aiPersonality.confidence < template.minConfidence) return false;
      if (template.minAggression && context.aiPersonality.aggression < template.minAggression) return false;
      if (template.maxAggression && context.aiPersonality.aggression > template.maxAggression) return false;
      if (template.minDeception && context.aiPersonality.deception < template.minDeception) return false;
      
      return true;
    });

    // Select template based on personality and context
    const selectedTemplate = this.selectBestTemplate(validTemplates, context);
    
    // Personalize the response
    return this.personalizeResponse(selectedTemplate.text, context);
  }

  async generateResponseToChat(
    playerMessage: string,
    context: ResponseContext
  ): Promise<string> {
    if (!context.chatAnalysis) {
      return this.generateResponse('GENERAL', context);
    }

    // Determine appropriate response type based on analysis
    const responseType = this.determineResponseType(context.chatAnalysis, context);
    return this.generateResponse(responseType, context);
  }

  private determineGamePhase(gameState: GameState): 'early' | 'mid' | 'late' {
    const totalCards = gameState.playerHand.length + gameState.aiHand.length;
    if (totalCards > 40) return 'early';
    if (totalCards > 20) return 'mid';
    return 'late';
  }

  private isAIBluffing(lastAction?: GameAction): boolean {
    if (!lastAction || lastAction.type !== 'PLAY_CARDS' || !lastAction.payload) return false;
    return lastAction.payload.cards.some(card => 
      card.value !== lastAction.payload!.declaredValue
    );
  }

  private selectBestTemplate(
    templates: ResponseTemplate[],
    context: ResponseContext
  ): ResponseTemplate {
    if (templates.length === 0) {
      // Fallback to general response if no matching templates
      return this.responseTemplates.GENERAL[0];
    }

    // Score each template based on context fit
    const scoredTemplates = templates.map(template => ({
      template,
      score: this.calculateTemplateScore(template, context)
    }));

    // Select highest scoring template
    return scoredTemplates.reduce((best, current) => 
      current.score > best.score ? current : best
    ).template;
  }

  private calculateTemplateScore(
    template: ResponseTemplate,
    context: ResponseContext
  ): number {
    let score = 0;

    // Personality match scoring
    if (template.minConfidence) {
      score += (context.aiPersonality.confidence - template.minConfidence) * 0.5;
    }
    if (template.minAggression) {
      score += (context.aiPersonality.aggression - template.minAggression) * 0.3;
    }
    if (template.minDeception) {
      score += (context.aiPersonality.deception - template.minDeception) * 0.4;
    }

    // Game state context scoring
    if (template.gamePhase === this.determineGamePhase(context.gameState)) {
      score += 0.3;
    }

    // Chat analysis context scoring
    if (context.chatAnalysis) {
      if (context.chatAnalysis.bluffIndicators.probability > 0.7) {
        score += template.minDeception ? 0.4 : 0;
      }
      if (context.chatAnalysis.sentiment.emotion === 'aggressive') {
        score += template.minAggression ? 0.3 : 0;
      }
    }

    return score;
  }

  private personalizeResponse(
    baseResponse: string,
    context: ResponseContext
  ): string {
    let response = baseResponse;

    // Add personality-based modifications
    if (context.aiPersonality.confidence > 0.8) {
      response = response.replace(/\.$/, '!');
    }
    if (context.aiPersonality.aggression > 0.7) {
      response = response.toUpperCase();
    }
    if (context.aiPersonality.friendliness > 0.7) {
      response += ' 😊';
    }

    return response;
  }

  private determineResponseType(
    analysis: ChatAnalysisResult,
    context: ResponseContext
  ): ResponseType {
    if (analysis.bluffIndicators.probability > 0.7) {
      return 'TAUNT';
    }
    if (analysis.sentiment.emotion === 'aggressive') {
      return context.aiPersonality.aggression > 0.5 ? 'TAUNT' : 'GENERAL';
    }
    if (analysis.sentiment.emotion === 'nervous') {
      return context.aiPersonality.confidence > 0.7 ? 'TAUNT' : 'COMPLIMENT';
    }
    if (analysis.contextualScore > 0.8) {
      return 'CARD_PLAY';
    }
    return 'GENERAL';
  }
} 