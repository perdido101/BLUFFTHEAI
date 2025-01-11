import fs from 'fs';
import path from 'path';
import { LogRotationService } from './logRotationService';

export interface ErrorLog {
  timestamp: number;
  error: Error;
  context: any;
  severity: 'low' | 'medium' | 'high';
}

export interface RequestLog {
  timestamp: number;
  method: string;
  path: string;
  body: any;
  response: any;
  duration: number;
  ip: string;
  statusCode: number;
}

export class LoggerService {
  private readonly logDir = path.join(__dirname, '../../../logs');
  private readonly errorLogPath = path.join(this.logDir, 'error.log');
  private readonly requestLogPath = path.join(this.logDir, 'request.log');
  private rotationService: LogRotationService;

  constructor() {
    this.initializeLogDirectory();
    this.rotationService = new LogRotationService();
  }

  private initializeLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  async logError(error: Error, context: any = {}, severity: ErrorLog['severity'] = 'medium'): Promise<void> {
    const errorLog: ErrorLog = {
      timestamp: Date.now(),
      error,
      context,
      severity
    };

    await this.writeAndRotate(this.errorLogPath, JSON.stringify(errorLog) + '\n');

    if (process.env.NODE_ENV === 'development') {
      console.error('Error:', {
        message: error.message,
        stack: error.stack,
        context,
        severity
      });
    }
  }

  async logRequest(log: Omit<RequestLog, 'timestamp'>): Promise<void> {
    const requestLog: RequestLog = {
      timestamp: Date.now(),
      ...log
    };

    await this.writeAndRotate(this.requestLogPath, JSON.stringify(requestLog) + '\n');
  }

  private async writeAndRotate(filePath: string, content: string): Promise<void> {
    fs.appendFileSync(filePath, content);
    await this.rotationService.checkAndRotate(filePath);
  }

  getRecentErrors(limit: number = 100): ErrorLog[] {
    try {
      const logs = fs.readFileSync(this.errorLogPath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
      
      return logs
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      console.error('Error reading error logs:', error);
      return [];
    }
  }

  getRecentRequests(limit: number = 100): RequestLog[] {
    try {
      const logs = fs.readFileSync(this.requestLogPath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
      
      return logs
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      console.error('Error reading request logs:', error);
      return [];
    }
  }

  getErrorStats(): {
    totalErrors: number;
    errorsByType: { [key: string]: number };
    errorsBySeverity: { [key: string]: number };
  } {
    try {
      const errors = this.getRecentErrors();
      const errorsByType: { [key: string]: number } = {};
      const errorsBySeverity: { [key: string]: number } = {};

      errors.forEach(error => {
        const type = error.error.constructor.name;
        errorsByType[type] = (errorsByType[type] || 0) + 1;
        errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
      });

      return {
        totalErrors: errors.length,
        errorsByType,
        errorsBySeverity
      };
    } catch (error) {
      console.error('Error calculating error stats:', error);
      return {
        totalErrors: 0,
        errorsByType: {},
        errorsBySeverity: {}
      };
    }
  }
}

export const logger = new LoggerService(); 