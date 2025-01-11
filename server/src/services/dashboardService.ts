import { LoggerService } from './loggerService';
import { PerformanceMonitorService } from './performanceMonitorService';
import { RateLimiterService } from './rateLimiterService';

interface DashboardMetrics {
  errors: {
    total: number;
    byType: { [key: string]: number };
    bySeverity: { [key: string]: number };
    recentErrors: Array<{
      message: string;
      timestamp: number;
      severity: string;
    }>;
  };
  performance: {
    averageResponseTime: number;
    averageAIDecisionTime: number;
    slowestEndpoints: Array<{
      endpoint: string;
      time: number;
    }>;
    gameStats: {
      totalMoves: number;
      successfulBluffs: number;
      failedBluffs: number;
    };
  };
  rateLimiting: {
    totalRequests: number;
    blockedIPs: number;
  };
  requests: {
    recentRequests: Array<{
      path: string;
      method: string;
      statusCode: number;
      duration: number;
      timestamp: number;
    }>;
    statusCodeDistribution: { [key: string]: number };
  };
}

export class DashboardService {
  constructor(
    private logger: LoggerService,
    private performanceMonitor: PerformanceMonitorService,
    private rateLimiter: RateLimiterService
  ) {}

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const errorStats = this.logger.getErrorStats();
    const recentErrors = this.logger.getRecentErrors(10);
    const recentRequests = this.logger.getRecentRequests(10);
    const performanceMetrics = this.performanceMonitor.getMetrics();
    const rateLimitStats = this.rateLimiter.getStats();

    const statusCodeDistribution = this.calculateStatusCodeDistribution(
      this.logger.getRecentRequests(100)
    );

    return {
      errors: {
        total: errorStats.totalErrors,
        byType: errorStats.errorsByType,
        bySeverity: errorStats.errorsBySeverity,
        recentErrors: recentErrors.map(error => ({
          message: error.error.message,
          timestamp: error.timestamp,
          severity: error.severity
        }))
      },
      performance: {
        averageResponseTime: performanceMetrics.averageResponseTime,
        averageAIDecisionTime: performanceMetrics.averageAIDecisionTime,
        slowestEndpoints: performanceMetrics.slowestEndpoints,
        gameStats: {
          totalMoves: performanceMetrics.totalMoves,
          successfulBluffs: performanceMetrics.successfulBluffs,
          failedBluffs: performanceMetrics.failedBluffs
        }
      },
      rateLimiting: {
        totalRequests: rateLimitStats.totalRequests,
        blockedIPs: rateLimitStats.blockedIPs
      },
      requests: {
        recentRequests: recentRequests.map(req => ({
          path: req.path,
          method: req.method,
          statusCode: req.statusCode,
          duration: req.duration,
          timestamp: req.timestamp
        })),
        statusCodeDistribution
      }
    };
  }

  private calculateStatusCodeDistribution(requests: any[]): { [key: string]: number } {
    const distribution: { [key: string]: number } = {};
    requests.forEach(req => {
      const statusCode = req.statusCode.toString();
      distribution[statusCode] = (distribution[statusCode] || 0) + 1;
    });
    return distribution;
  }
} 