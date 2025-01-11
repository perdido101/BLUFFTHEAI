import fs from 'fs/promises';
import path from 'path';
import { GameHistory, GameState, GameAction } from '../types';

const DATA_DIR = path.join(__dirname, '../../data');
const LEARNING_FILE = path.join(DATA_DIR, 'learning.json');
const PATTERNS_FILE = path.join(DATA_DIR, 'patterns.json');

interface ModelHistory {
  decisions: any[];
  performance: any;
}

interface PerformanceMetrics {
  gameHistory: any[];
  aggregateMetrics: any;
}

interface Patterns {
  [key: string]: any;
}

interface GameHistory {
  id: string;
  timestamp: number;
  moves: Array<{
    player: 'ai' | 'player';
    action: GameAction;
    timestamp: number;
  }>;
  winner: 'ai' | 'player' | null;
  duration: number;
  finalState: GameState;
}

export interface PersistenceService {
  // Existing methods
  loadModelHistory(): Promise<any>;
  saveModelHistory(data: any): Promise<void>;
  loadPatterns(): Promise<any>;
  savePatterns(patterns: any): Promise<void>;
  loadPerformanceMetrics(): Promise<any>;
  savePerformanceMetrics(metrics: any): Promise<void>;
  
  // New game history methods
  saveGameHistory(history: GameHistory): Promise<void>;
  loadGameHistory(): Promise<GameHistory[]>;
}

export class PersistenceService {
  private data: Map<string, any>;

  constructor() {
    this.data = new Map();
  }

  async init() {
    // Initialize persistence layer
    console.log('Initializing persistence service');
  }

  async save(key: string, value: any) {
    this.data.set(key, value);
  }

  async load(key: string) {
    return this.data.get(key);
  }

  async saveQTable(qTable: any) {
    await this.save('qTable', qTable);
  }

  async loadQTable() {
    return await this.load('qTable') || {};
  }

  async saveModelHistory(history: ModelHistory) {
    await this.save('modelHistory', history);
  }

  async loadModelHistory(): Promise<ModelHistory | null> {
    return await this.load('modelHistory') || { decisions: [], performance: {} };
  }

  async loadPatterns(): Promise<Patterns> {
    return await this.load('patterns') || [];
  }

  async savePatterns(patterns: Patterns) {
    await this.save('patterns', patterns);
  }

  async loadPerformanceMetrics(): Promise<PerformanceMetrics | null> {
    return await this.load('performanceMetrics') || {};
  }

  async savePerformanceMetrics(metrics: PerformanceMetrics) {
    await this.save('performanceMetrics', metrics);
  }

  async saveGameHistory(history: GameHistory) {
    await this.save('gameHistory', history);
  }

  async loadGameHistory(): Promise<GameHistory[]> {
    return await this.load('gameHistory') || [];
  }
} 