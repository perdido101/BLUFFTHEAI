import { GameState } from '../types';

interface SentimentResult {
  score: number;          // -1 to 1
  confidence: number;     // 0 to 1
  dominantEmotion: string;
  emotions: {
    [key: string]: number;
  };
}

interface BluffIndicator {
  probability: number;    // 0 to 1
  confidence: number;     // 0 to 1
  triggers: string[];
}

interface PersonalityInsight {
  confidence: number;     // 0 to 1
  traits: PlayerTraits;
}

interface ChatAnalysisResult {
  sentiment: SentimentResult;
  bluffIndicators: BluffIndicator;
  personalityInsights: PersonalityInsight;
  contextRelevance: number;  // 0 to 1
  keyPhrases: string[];
}

interface PlayerTraits {
  aggressiveness: number;
  deceptiveness: number;
  confidence: number;
  impulsiveness: number;
  [key: string]: number;
}

export class ChatAnalysisService {
  private readonly EMOTION_PATTERNS = {
    confident: /(?:i (?:know|am sure|bet|definitely)|trust me|obviously|clearly|without doubt)/i,
    nervous: /(?:um+|uh+|er+|maybe|probably|i guess|not sure|possibly)/i,
    aggressive: /(?:come on|seriously|whatever|yeah right|sure sure|ok then)/i
  };

  private readonly BLUFF_PATTERNS = {
    overemphasis: /(?:definitely|absolutely|obviously|clearly|100%|totally)/i,
    uncertainty: /(?:uh+|um+|like|sort of|kind of)/i,
    deflection: /(?:anyway|whatever|moving on|so yeah|well)/i,
    contradiction: /(?:wait|no|i mean|actually|correction)/i
  };

  private readonly GAME_PHRASES = [
    'cards', 'play', 'turn', 'challenge', 'bluff', 'ace', 'king', 'queen', 'jack',
    'pass', 'hand', 'pile', 'deal', 'win', 'lose'
  ];

  async analyzeChatMessage(message: string, gameState: GameState): Promise<ChatAnalysisResult> {
    const [sentiment, bluffIndicators, personalityInsights] = await Promise.all([
      this.analyzeSentiment(message),
      this.detectBluffIndicators(message, gameState),
      this.analyzePersonality(message)
    ]);

    const contextRelevance = this.calculateContextRelevance(message);
    const keyPhrases = this.extractKeyPhrases(message);

    return {
      sentiment,
      bluffIndicators,
      personalityInsights,
      contextRelevance,
      keyPhrases
    };
  }

  private analyzeSentiment(message: string): SentimentResult {
    const emotions: { [key: string]: number } = {
      confident: 0,
      nervous: 0,
      aggressive: 0,
      neutral: 0.5
    };

    // Analyze emotional patterns
    for (const [emotion, pattern] of Object.entries(this.EMOTION_PATTERNS)) {
      const matches = (message.match(pattern) || []).length;
      emotions[emotion] = Math.min(matches * 0.3, 1);
      emotions.neutral = Math.max(0, emotions.neutral - matches * 0.2);
    }

    // Calculate dominant emotion
    const dominantEmotion = Object.entries(emotions)
      .reduce((a, b) => a[1] > b[1] ? a : b)[0];

    // Calculate overall sentiment score
    const sentimentScore = emotions.confident * 0.5 +
      emotions.aggressive * 0.3 -
      emotions.nervous * 0.4;

    return {
      score: Math.max(-1, Math.min(1, sentimentScore)),
      confidence: 1 - emotions.neutral,
      dominantEmotion,
      emotions
    };
  }

  private detectBluffIndicators(message: string, gameState: GameState): BluffIndicator {
    const triggers: string[] = [];
    let probability = 0;
    let patternMatches = 0;

    // Check for bluff patterns
    for (const [type, pattern] of Object.entries(this.BLUFF_PATTERNS)) {
      const matches = (message.match(pattern) || []).length;
      if (matches > 0) {
        triggers.push(type);
        probability += matches * 0.2;
        patternMatches += matches;
      }
    }

    // Consider game state
    if (gameState.lastPlay && gameState.lastPlay.player === 'player') {
      const cardsPlayed = gameState.lastPlay.actualCards.length;
      const remainingCards = gameState.playerHand.length;

      // Adjust probability based on game context
      if (cardsPlayed > 2) probability += 0.2;
      if (remainingCards <= 2) probability += 0.3;
    }

    return {
      probability: Math.min(1, probability),
      confidence: Math.min(1, patternMatches * 0.3),
      triggers
    };
  }

  private analyzePersonality(message: string): PersonalityInsight {
    const traits: PlayerTraits = {
      aggressiveness: 0,
      deceptiveness: 0,
      confidence: 0,
      impulsiveness: 0
    };

    // Analyze aggressiveness
    traits.aggressiveness = (message.match(this.EMOTION_PATTERNS.aggressive) || []).length * 0.3;

    // Analyze deceptiveness
    const deceptivePatterns = Object.values(this.BLUFF_PATTERNS);
    traits.deceptiveness = deceptivePatterns.reduce((sum, pattern) =>
      sum + (message.match(pattern) || []).length * 0.2, 0
    );

    // Analyze confidence
    traits.confidence = (message.match(this.EMOTION_PATTERNS.confident) || []).length * 0.3 -
      (message.match(this.EMOTION_PATTERNS.nervous) || []).length * 0.2;

    // Analyze impulsiveness
    traits.impulsiveness = (message.match(/!|\?{2,}|[A-Z]{2,}/g) || []).length * 0.2;

    // Normalize traits
    for (const key of Object.keys(traits)) {
      traits[key] = Math.max(0, Math.min(1, traits[key]));
    }

    return {
      confidence: 0.7, // Base confidence in personality analysis
      traits
    };
  }

  private calculateContextRelevance(message: string): number {
    const words = message.toLowerCase().split(/\s+/);
    const gameRelatedWords = words.filter(word =>
      this.GAME_PHRASES.some(phrase => word.includes(phrase))
    );

    return Math.min(1, gameRelatedWords.length / Math.max(words.length, 1));
  }

  private extractKeyPhrases(message: string): string[] {
    const phrases: string[] = [];
    const words = message.toLowerCase().split(/\s+/);

    // Extract game-related phrases
    this.GAME_PHRASES.forEach(phrase => {
      if (message.toLowerCase().includes(phrase)) {
        phrases.push(phrase);
      }
    });

    // Extract number phrases
    const numberWords = ['one', 'two', 'three', 'four', '1', '2', '3', '4'];
    numberWords.forEach(num => {
      if (words.includes(num)) {
        phrases.push(num);
      }
    });

    // Extract card value phrases
    const cardValues = ['ace', 'king', 'queen', 'jack', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
    cardValues.forEach(value => {
      if (message.toLowerCase().includes(value)) {
        phrases.push(value);
      }
    });

    return [...new Set(phrases)]; // Remove duplicates
  }
} 