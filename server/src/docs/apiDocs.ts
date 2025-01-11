import { Express, Request, Response } from 'express';

export interface APIEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  params?: Record<string, any>;
  body?: Record<string, any>;
  response: Record<string, any>;
}

export const apiDocs: Record<string, APIEndpoint> = {
  initializeGame: {
    path: '/api/game/initialize',
    method: 'GET',
    description: 'Initialize a new game state',
    response: {
      playerHand: 'Array<Card>',
      aiHand: 'number',
      centerPile: 'Array<Card>',
      currentTurn: 'string',
      lastPlay: 'object | null'
    }
  },
  makeMove: {
    path: '/api/game/move',
    method: 'POST',
    description: 'Make a game move',
    body: {
      action: {
        type: 'string (PLAY_CARDS | CHALLENGE | PASS)',
        payload: 'object (required for PLAY_CARDS)'
      },
      gameState: 'GameState object'
    },
    response: {
      type: 'GameState'
    }
  },
  searchLogs: {
    path: '/api/logs/search',
    method: 'GET',
    description: 'Search through logs with pagination',
    params: {
      startDate: 'ISO date string',
      endDate: 'ISO date string',
      severity: 'comma-separated list of low,medium,high',
      path: 'string',
      statusCode: 'number',
      searchText: 'string',
      page: 'number',
      pageSize: 'number'
    },
    response: {
      data: 'Array<LogEntry>',
      pagination: {
        page: 'number',
        pageSize: 'number',
        total: 'number',
        totalPages: 'number'
      }
    }
  }
};

// Export a function to add documentation endpoint
export function setupApiDocs(app: Express): void {
  app.get('/api/docs', (req: Request, res: Response) => {
    res.json(apiDocs);
  });
} 