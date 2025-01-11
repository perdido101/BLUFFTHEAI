import { TwitterApi } from 'twitter-api-v2';
import { GameState } from '../types';

class TwitterService {
  private client: TwitterApi;

  constructor() {
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });
  }

  private generateGameTweet(gameState: GameState): string {
    const playerCards = gameState.playerHand.length;
    const aiCards = gameState.aiHand.length;
    
    return `🎮 Bluff AI Game Update!\n
🃏 Player Cards: ${playerCards}
🤖 AI Cards: ${aiCards}\n
${this.generateGameStatus(gameState)}
#BluffAI #CardGames #AI`;
  }

  private generateGameStatus(gameState: GameState): string {
    if (gameState.playerHand.length === 0) {
      return "🏆 Player wins! The AI has been outsmarted!";
    } else if (gameState.aiHand.length === 0) {
      return "🤖 AI wins! Better luck next time, human!";
    }
    return "The game continues... Who will win? 🤔";
  }

  async tweetGameUpdate(gameState: GameState): Promise<void> {
    try {
      const tweet = this.generateGameTweet(gameState);
      await this.client.v2.tweet(tweet);
    } catch (error) {
      console.error('Failed to tweet game update:', error);
    }
  }

  async tweetGameResult(gameState: GameState): Promise<void> {
    try {
      const tweet = `🎮 Game Over!\n\n${this.generateGameStatus(gameState)}\n\nCome play against our AI at [your-game-url] 🃏\n\n#BluffAI #Gaming #AI`;
      await this.client.v2.tweet(tweet);
    } catch (error) {
      console.error('Failed to tweet game result:', error);
    }
  }
}

export const twitterService = new TwitterService(); 