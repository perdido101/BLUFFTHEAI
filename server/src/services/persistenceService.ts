import fs from 'fs/promises';
import path from 'path';
import { GameHistory, GameState, GameAction, DecisionMetrics, ModelPerformance } from '../types';
import { PersistenceService as IPersistenceService, PerformanceMetrics, Patterns } from '../interfaces/persistenceService';

const DATA_DIR = path.join(__dirname, '../../data');
const MAX_ARRAY_LENGTH = 10000;
const TEMP_SUFFIX = '.tmp';
const VALID_KEY_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

class PersistenceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PersistenceError';
    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

interface ModelUpdate {
  timestamp: number;
  result: 'win' | 'loss';
  success: boolean;
}

interface ModelMetrics {
  modelUpdates: ModelUpdate[];
  modelUpdateSuccessRate: number;
}

export class PersistenceService implements IPersistenceService {
  private dataDir: string;
  private readonly MAX_ARRAY_LENGTH = 10000;

  constructor() {
    this.dataDir = DATA_DIR;
  }

  async init(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log('Initialized persistence service at:', this.dataDir);
    } catch (error) {
      throw new PersistenceError('Failed to initialize persistence service', error);
    }
  }

  private validateKey(key: string): void {
    if (!VALID_KEY_REGEX.test(key)) {
      throw new PersistenceError(`Invalid key format: ${key}. Keys must contain only alphanumeric characters, underscores, and hyphens.`);
    }
  }

  private getFilePath(key: string): string {
    this.validateKey(key);
    const filePath = path.join(this.dataDir, `${key}.json`);
    // Ensure the path is within the data directory to prevent directory traversal
    if (!filePath.startsWith(this.dataDir)) {
      throw new PersistenceError(`Invalid file path: ${filePath}. Path must be within the data directory.`);
    }
    return filePath;
  }

  private async validateFileSize(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > MAX_FILE_SIZE) {
        throw new PersistenceError(`File size exceeds maximum limit of ${MAX_FILE_SIZE} bytes`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new PersistenceError('Failed to check file size', error);
      }
    }
  }

  private async save(key: string, value: unknown): Promise<void> {
    const filePath = this.getFilePath(key);
    const tempPath = `${filePath}${TEMP_SUFFIX}`;
    
    try {
      const jsonString = JSON.stringify(value, null, 2);
      if (Buffer.byteLength(jsonString) > MAX_FILE_SIZE) {
        throw new PersistenceError(`Data size exceeds maximum limit of ${MAX_FILE_SIZE} bytes`);
      }
      
      // Ensure the data directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      // Write to temp file first
      await fs.writeFile(tempPath, jsonString, { encoding: 'utf8' });
      
      try {
        // Try to remove existing file if it exists
        await fs.unlink(filePath).catch(() => {});
        
        // Rename temp file to actual file (atomic operation)
        await fs.rename(tempPath, filePath);
      } catch (renameError) {
        // Clean up temp file if rename fails
        await fs.unlink(tempPath).catch(() => {});
        throw renameError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError(`Failed to save ${key}: ${errorMessage}`, error);
    }
  }

  private async load(key: string): Promise<unknown> {
    const filePath = this.getFilePath(key);
    try {
      await this.validateFileSize(filePath);
      const data = await fs.readFile(filePath, 'utf-8');
      try {
        const parsed = JSON.parse(data);
        // Check for array size limits
        if (Array.isArray(parsed) && parsed.length > MAX_ARRAY_LENGTH) {
          throw new PersistenceError(`Array in ${key} exceeds maximum length of ${MAX_ARRAY_LENGTH}`);
        }
        return parsed;
      } catch (parseError) {
        throw new PersistenceError(`Invalid JSON format in ${key}.json: ${parseError.message}`, parseError);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError(`Failed to load ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
    }
  }

  private validateGameHistory(data: unknown): data is GameHistory {
    if (!data || typeof data !== 'object') return false;
    const history = data as Partial<GameHistory>;
    
    // Validate ID format (non-empty string)
    if (typeof history.id !== 'string' || !history.id.trim()) {
      return false;
    }
    
    // Validate timestamp (must be a recent timestamp)
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    if (typeof history.timestamp !== 'number' || 
        history.timestamp < oneYearAgo || 
        history.timestamp > now) {
      return false;
    }
    
    // Rest of the validation remains the same
    return Array.isArray(history.moves) &&
           history.moves.length <= MAX_ARRAY_LENGTH &&
           history.moves.every(move => 
             typeof move === 'object' &&
             (move.player === 'ai' || move.player === 'player') &&
             typeof move.timestamp === 'number' &&
             move.action !== undefined
           ) &&
           (history.winner === 'ai' || history.winner === 'player' || history.winner === null) &&
           typeof history.duration === 'number' &&
           history.duration >= 0;
  }

  private validatePatterns(data: unknown): data is Patterns {
    if (!data || typeof data !== 'object') return false;
    const patterns = data as Partial<Patterns>;
    return Array.isArray(patterns.successfulPatterns) &&
           Array.isArray(patterns.failedPatterns) &&
           patterns.successfulPatterns.length <= MAX_ARRAY_LENGTH &&
           patterns.failedPatterns.length <= MAX_ARRAY_LENGTH;
  }

  async saveQTable(qTable: Record<string, number>): Promise<void> {
    if (!qTable || typeof qTable !== 'object') {
      throw new PersistenceError('Invalid QTable format');
    }
    await this.save('qTable', qTable);
  }

  async loadQTable(): Promise<Record<string, number>> {
    const data = await this.load('qTable');
    if (!data || typeof data !== 'object') {
      return {};
    }
    // Validate all values are numbers
    const qTable = data as Record<string, unknown>;
    for (const [key, value] of Object.entries(qTable)) {
      if (typeof value !== 'number') {
        throw new PersistenceError(`Invalid QTable value for key ${key}`);
      }
    }
    return data as Record<string, number>;
  }

  private validateDecisionMetrics(data: unknown): data is DecisionMetrics {
    if (!data || typeof data !== 'object') return false;
    const metrics = data as Partial<DecisionMetrics>;
    return typeof metrics.timestamp === 'number' &&
           metrics.gameState !== undefined &&
           metrics.decision !== undefined &&
           (metrics.outcome === undefined || typeof metrics.outcome === 'string');
  }

  private validateModelPerformance(data: unknown): data is ModelPerformance {
    if (!data || typeof data !== 'object') return false;
    const performance = data as Partial<ModelPerformance>;
    return typeof performance.accuracy === 'number' &&
           typeof performance.bluffSuccessRate === 'number' &&
           typeof performance.challengeSuccessRate === 'number' &&
           typeof performance.averageReward === 'number' &&
           typeof performance.gamesPlayed === 'number' &&
           typeof performance.totalMoves === 'number' &&
           performance.accuracy >= 0 && performance.accuracy <= 1 &&
           performance.bluffSuccessRate >= 0 && performance.bluffSuccessRate <= 1 &&
           performance.challengeSuccessRate >= 0 && performance.challengeSuccessRate <= 1;
  }

  async saveModelHistory(history: {
    decisions: DecisionMetrics[];
    performance: ModelPerformance;
  }): Promise<void> {
    if (!Array.isArray(history.decisions) || 
        !history.decisions.every(d => this.validateDecisionMetrics(d)) ||
        !this.validateModelPerformance(history.performance)) {
      throw new PersistenceError('Invalid model history format: decisions array must contain valid DecisionMetrics and performance must be valid ModelPerformance');
    }
    await this.save('modelHistory', history);
  }

  async loadModelHistory(): Promise<{
    decisions: DecisionMetrics[];
    performance: ModelPerformance;
  } | null> {
    const data = await this.load('modelHistory');
    if (!data) return null;
    
    const history = data as Partial<{
      decisions: DecisionMetrics[];
      performance: ModelPerformance;
    }>;
    
    if (!Array.isArray(history.decisions) || 
        !history.decisions.every(d => this.validateDecisionMetrics(d)) ||
        !this.validateModelPerformance(history.performance)) {
      throw new PersistenceError('Invalid model history data format: loaded data does not match expected structure');
    }
    
    return data as {
      decisions: DecisionMetrics[];
      performance: ModelPerformance;
    };
  }

  async loadPatterns(): Promise<Patterns | null> {
    const data = await this.load('patterns');
    if (!data) return null;
    if (!this.validatePatterns(data)) {
      throw new PersistenceError('Invalid patterns data format');
    }
    return data;
  }

  async savePatterns(patterns: Patterns): Promise<void> {
    if (!this.validatePatterns(patterns)) {
      throw new PersistenceError('Invalid patterns format');
    }
    await this.save('patterns', patterns);
  }

  private validateAggregateMetrics(metrics: any): boolean {
    if (!metrics || typeof metrics !== 'object') return false;
    
    // Validate win rate (0-1)
    if (typeof metrics.winRate !== 'number' ||
        metrics.winRate < 0 || 
        metrics.winRate > 1) {
      return false;
    }
    
    // Validate average game duration (non-negative)
    if (typeof metrics.averageGameDuration !== 'number' ||
        metrics.averageGameDuration < 0) {
      return false;
    }
    
    // Validate total games (non-negative integer)
    if (typeof metrics.totalGames !== 'number' ||
        metrics.totalGames < 0 ||
        !Number.isInteger(metrics.totalGames)) {
      return false;
    }
    
    // Validate average moves per game (non-negative)
    if (typeof metrics.averageMovesPerGame !== 'number' ||
        metrics.averageMovesPerGame < 0) {
      return false;
    }
    
    return true;
  }

  private validateModelUpdate(update: unknown): boolean {
    if (!update || typeof update !== 'object') return false;
    const u = update as any;
    
    // Validate timestamp is recent
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    if (typeof u.timestamp !== 'number' || 
        u.timestamp < oneYearAgo || 
        u.timestamp > now) {
      return false;
    }
    
    return (u.result === 'win' || u.result === 'loss') &&
           typeof u.success === 'boolean';
  }

  private validateModelMetrics(metrics: unknown): boolean {
    if (!metrics || typeof metrics !== 'object') return false;
    const m = metrics as any;
    
    // Validate modelUpdates array
    if (!Array.isArray(m.modelUpdates) || 
        m.modelUpdates.length > this.MAX_ARRAY_LENGTH) {
      return false;
    }
    
    // Check for duplicate timestamps in updates
    const timestamps = new Set<number>();
    for (const update of m.modelUpdates) {
      if (!this.validateModelUpdate(update)) return false;
      if (timestamps.has(update.timestamp)) return false;
      timestamps.add(update.timestamp);
    }
    
    // Validate success rate
    return typeof m.modelUpdateSuccessRate === 'number' &&
           m.modelUpdateSuccessRate >= 0 &&
           m.modelUpdateSuccessRate <= 1;
  }

  private validatePerformanceMetrics(metrics: unknown): boolean {
    if (!metrics || typeof metrics !== 'object') return false;
    const m = metrics as any;
    
    // Validate game history array
    if (!Array.isArray(m.gameHistory) || 
        m.gameHistory.length > this.MAX_ARRAY_LENGTH) {
      return false;
    }
    
    // Check for duplicate game IDs
    const gameIds = new Set<string>();
    for (const history of m.gameHistory) {
      if (!this.validateGameHistory(history)) return false;
      if (gameIds.has(history.id)) return false;
      gameIds.add(history.id);
    }
    
    // Validate aggregate metrics
    return this.validateAggregateMetrics(m.aggregateMetrics);
  }

  async saveMetrics(metrics: ModelMetrics): Promise<void> {
    if (!this.validateModelMetrics(metrics)) {
      throw new PersistenceError(
        'Invalid metrics format: Ensure all updates have valid timestamps, ' +
        'no duplicate timestamps exist, and success rate is between 0 and 1'
      );
    }
    await this.save('metrics', metrics);
  }

  async loadMetrics(): Promise<ModelMetrics | null> {
    const data = await this.load('metrics');
    if (!data) return null;
    if (!this.validateModelMetrics(data)) {
      throw new PersistenceError('Invalid metrics data format in storage');
    }
    return data as ModelMetrics;
  }

  async saveGameHistory(history: GameHistory): Promise<void> {
    if (!this.validateGameHistory(history)) {
      throw new PersistenceError('Invalid game history format: history must include valid id, timestamp, moves, winner, and duration');
    }
    
    try {
      const histories = await this.loadGameHistory();
      
      // Check for duplicate IDs
      if (histories.some(h => h.id === history.id)) {
        throw new PersistenceError(`Game history with ID ${history.id} already exists`);
      }
      
      // Validate array size before adding new history
      if (histories.length >= MAX_ARRAY_LENGTH) {
        throw new PersistenceError(`Game history array has reached maximum length of ${MAX_ARRAY_LENGTH}`);
      }
      
      histories.push(history);
      await this.save('gameHistory', histories);
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError('Failed to save game history', error);
    }
  }

  async loadGameHistory(): Promise<GameHistory[]> {
    const data = await this.load('gameHistory');
    if (!data) return [];
    if (!Array.isArray(data)) {
      throw new PersistenceError('Invalid game history data format: expected an array');
    }
    for (const history of data) {
      if (!this.validateGameHistory(history)) {
        throw new PersistenceError('Invalid game history entry: each entry must include valid id, timestamp, moves, winner, and duration');
      }
    }
    return data;
  }

  async savePerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
    if (!this.validatePerformanceMetrics(metrics)) {
      throw new PersistenceError('Invalid performance metrics format');
    }
    await this.save('performanceMetrics', metrics);
  }

  async loadPerformanceMetrics(): Promise<PerformanceMetrics | null> {
    const data = await this.load('performanceMetrics');
    if (!data) return null;
    
    if (!this.validatePerformanceMetrics(data)) {
      throw new PersistenceError('Invalid performance metrics format in stored data');
    }
    
    return data as PerformanceMetrics;
  }
} 