import { GameState, GameAction } from '../types';
import { AIPersonalityService } from './aiPersonalityService';
import { ChatAnalysisService } from './chatAnalysisService';

interface ResponseContext {
  gameState: GameState;
  lastAction?: GameAction;
  playerMessage?: string;
  aiPersonality: {
    confidence: number;
    aggressiveness: number;
    playfulness: number;
  };
  chatAnalysis?: {
    sentiment: number;
    emotionalState: string;
    contextRelevance: number;
  };
}

interface ResponseTemplate {
  text: string;
  conditions: {
    gamePhase?: string;
    emotionalState?: string[];
    minConfidence?: number;
    maxAggressiveness?: number;
    contextTriggers?: string[];
  };
  personality: {
    minConfidence?: number;
    maxConfidence?: number;
    minAggressiveness?: number;
    maxAggressiveness?: number;
    minPlayfulness?: number;
    maxPlayfulness?: number;
  };
}

export class ResponseGenerationService {
  private readonly RESPONSE_TEMPLATES: ResponseTemplate[] = [
    // Bluffing responses
    {
      text: "These are definitely {value}s, no doubt about it!",
      conditions: {
        gamePhase: 'bluffing',
        emotionalState: ['confident'],
        minConfidence: 0.7
      },
      personality: {
        minConfidence: 0.6,
        minPlayfulness: 0.4
      }
    },
    {
      text: "Hmm... I think I'll play these {value}s...",
      conditions: {
        gamePhase: 'bluffing',
        emotionalState: ['nervous']
      },
      personality: {
        maxConfidence: 0.4,
        minPlayfulness: 0.6
      }
    },
    
    // Challenge responses
    {
      text: "Nice try, but I don't believe those are {value}s!",
      conditions: {
        gamePhase: 'challenge',
        emotionalState: ['aggressive', 'confident']
      },
      personality: {
        minAggressiveness: 0.6,
        minConfidence: 0.5
      }
    },
    {
      text: "Those cards seem a bit suspicious...",
      conditions: {
        gamePhase: 'challenge',
        emotionalState: ['nervous', 'neutral']
      },
      personality: {
        maxAggressiveness: 0.4,
        minPlayfulness: 0.5
      }
    },
    
    // Victory responses
    {
      text: "Ha! I knew you were bluffing!",
      conditions: {
        gamePhase: 'victory',
        emotionalState: ['confident', 'aggressive']
      },
      personality: {
        minConfidence: 0.7,
        minAggressiveness: 0.5
      }
    },
    {
      text: "Good game! Better luck next time!",
      conditions: {
        gamePhase: 'victory',
        emotionalState: ['neutral', 'confident']
      },
      personality: {
        maxAggressiveness: 0.3,
        minPlayfulness: 0.6
      }
    },
    
    // Defeat responses
    {
      text: "Well played! You caught my bluff!",
      conditions: {
        gamePhase: 'defeat',
        emotionalState: ['neutral', 'confident']
      },
      personality: {
        minPlayfulness: 0.5,
        maxAggressiveness: 0.3
      }
    },
    {
      text: "I'll get you next time!",
      conditions: {
        gamePhase: 'defeat',
        emotionalState: ['aggressive']
      },
      personality: {
        minAggressiveness: 0.6,
        minConfidence: 0.4
      }
    },
    
    // General game responses
    {
      text: "Your turn! Choose wisely...",
      conditions: {
        gamePhase: 'waiting',
        emotionalState: ['neutral', 'playful']
      },
      personality: {
        minPlayfulness: 0.5
      }
    },
    {
      text: "Interesting move... let me think...",
      conditions: {
        gamePhase: 'thinking',
        emotionalState: ['neutral', 'nervous']
      },
      personality: {
        maxConfidence: 0.5,
        minPlayfulness: 0.4
      }
    }
  ];

  constructor(
    private aiPersonality: AIPersonalityService,
    private chatAnalysis: ChatAnalysisService
  ) {}

  async generateResponse(context: ResponseContext): Promise<string> {
    // Analyze player message if available
    let chatAnalysisResult;
    if (context.playerMessage) {
      chatAnalysisResult = await this.chatAnalysis.analyzeChatMessage(
        context.playerMessage,
        context.gameState
      );
      context.chatAnalysis = {
        sentiment: chatAnalysisResult.sentiment.score,
        emotionalState: chatAnalysisResult.sentiment.dominantEmotion,
        contextRelevance: chatAnalysisResult.contextRelevance
      };
    }

    // Get suitable templates based on game phase and context
    const suitableTemplates = this.RESPONSE_TEMPLATES.filter(template =>
      this.isTemplateSuitable(template, context)
    );

    if (suitableTemplates.length === 0) {
      return this.getDefaultResponse(context);
    }

    // Select best template based on personality match
    const bestTemplate = this.selectBestTemplate(suitableTemplates, context);
    
    // Fill in template variables
    return this.fillTemplate(bestTemplate.text, context);
  }

  private isTemplateSuitable(template: ResponseTemplate, context: ResponseContext): boolean {
    const { conditions } = template;
    
    // Check game phase
    if (conditions.gamePhase && !this.matchesGamePhase(conditions.gamePhase, context)) {
      return false;
    }

    // Check emotional state
    if (conditions.emotionalState && context.chatAnalysis) {
      if (!conditions.emotionalState.includes(context.chatAnalysis.emotionalState)) {
        return false;
      }
    }

    // Check confidence requirements
    if (conditions.minConfidence && context.aiPersonality.confidence < conditions.minConfidence) {
      return false;
    }

    // Check aggressiveness limits
    if (conditions.maxAggressiveness && 
        context.aiPersonality.aggressiveness > conditions.maxAggressiveness) {
      return false;
    }

    return true;
  }

  private matchesGamePhase(phase: string, context: ResponseContext): boolean {
    switch (phase) {
      case 'bluffing':
        return context.lastAction?.type === 'PLAY_CARDS';
      case 'challenge':
        return context.lastAction?.type === 'CHALLENGE';
      case 'victory':
        return context.gameState.winner === 'ai';
      case 'defeat':
        return context.gameState.winner === 'player';
      case 'waiting':
        return context.gameState.currentTurn === 'player';
      case 'thinking':
        return context.gameState.currentTurn === 'ai';
      default:
        return false;
    }
  }

  private selectBestTemplate(
    templates: ResponseTemplate[],
    context: ResponseContext
  ): ResponseTemplate {
    return templates.reduce((best, current) => {
      const bestScore = this.calculatePersonalityMatch(best.personality, context.aiPersonality);
      const currentScore = this.calculatePersonalityMatch(current.personality, context.aiPersonality);
      return currentScore > bestScore ? current : best;
    });
  }

  private calculatePersonalityMatch(
    requirements: ResponseTemplate['personality'],
    personality: ResponseContext['aiPersonality']
  ): number {
    let score = 1;

    // Check confidence match
    if (requirements.minConfidence) {
      score *= Math.max(0, (personality.confidence - requirements.minConfidence) / 0.5 + 1);
    }
    if (requirements.maxConfidence) {
      score *= Math.max(0, (requirements.maxConfidence - personality.confidence) / 0.5 + 1);
    }

    // Check aggressiveness match
    if (requirements.minAggressiveness) {
      score *= Math.max(0, (personality.aggressiveness - requirements.minAggressiveness) / 0.5 + 1);
    }
    if (requirements.maxAggressiveness) {
      score *= Math.max(0, (requirements.maxAggressiveness - personality.aggressiveness) / 0.5 + 1);
    }

    // Check playfulness match
    if (requirements.minPlayfulness) {
      score *= Math.max(0, (personality.playfulness - requirements.minPlayfulness) / 0.5 + 1);
    }
    if (requirements.maxPlayfulness) {
      score *= Math.max(0, (requirements.maxPlayfulness - personality.playfulness) / 0.5 + 1);
    }

    return score;
  }

  private fillTemplate(template: string, context: ResponseContext): string {
    let response = template;

    // Replace game state variables
    if (context.lastAction?.type === 'PLAY_CARDS' && context.lastAction.payload?.declaredValue) {
      response = response.replace('{value}', context.lastAction.payload.declaredValue);
    }

    // Add emotional markers based on personality
    if (context.aiPersonality.confidence > 0.8) {
      response += '!';
    }
    if (context.aiPersonality.playfulness > 0.7) {
      response += ' 😉';
    }
    if (context.aiPersonality.aggressiveness > 0.7) {
      response = response.toUpperCase();
    }

    return response;
  }

  private getDefaultResponse(context: ResponseContext): string {
    // Fallback responses based on game state
    if (context.gameState.currentTurn === 'player') {
      return "Your turn.";
    }
    if (context.lastAction?.type === 'CHALLENGE') {
      return "Let's see those cards!";
    }
    return "Hmm...";
  }
} 