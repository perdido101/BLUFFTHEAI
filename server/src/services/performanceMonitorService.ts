interface PerformanceMetrics {
  averageResponseTime: number;
  averageAIDecisionTime: number;
  slowestEndpoints: Array<{
    endpoint: string;
    time: number;
  }>;
  totalMoves: number;
  successfulBluffs: number;
  failedBluffs: number;
  startTime?: number;
  endTime?: number;
}

export class PerformanceMonitorService {
  private metrics: PerformanceMetrics = {
    averageResponseTime: 0,
    averageAIDecisionTime: 0,
    slowestEndpoints: [],
    startTime: undefined,
    endTime: undefined,
    totalMoves: 0,
    successfulBluffs: 0,
    failedBluffs: 0
  };

  private responseTimeSamples: number[] = [];
  private aiDecisionTimeSamples: number[] = [];
  private endpointTimings: Map<string, number[]> = new Map();

  constructor() {
    this.resetMetrics();
  }

  private resetMetrics(): void {
    this.metrics = {
      averageResponseTime: 0,
      averageAIDecisionTime: 0,
      slowestEndpoints: [],
      startTime: undefined,
      endTime: undefined,
      totalMoves: 0,
      successfulBluffs: 0,
      failedBluffs: 0
    };
    this.responseTimeSamples = [];
    this.aiDecisionTimeSamples = [];
    this.endpointTimings.clear();
  }

  startGame(): void {
    this.metrics.startTime = Date.now();
  }

  endGame(): void {
    this.metrics.endTime = Date.now();
  }

  recordMove(): void {
    this.metrics.totalMoves++;
  }

  recordBluff(successful: boolean): void {
    if (successful) {
      this.metrics.successfulBluffs++;
    } else {
      this.metrics.failedBluffs++;
    }
  }

  recordResponseTime(time: number): void {
    this.responseTimeSamples.push(time);
    this.updateAverageResponseTime();
  }

  recordAIDecisionTime(time: number): void {
    this.aiDecisionTimeSamples.push(time);
    this.updateAverageAIDecisionTime();
  }

  recordEndpointTiming(endpoint: string, time: number): void {
    if (!this.endpointTimings.has(endpoint)) {
      this.endpointTimings.set(endpoint, []);
    }
    this.endpointTimings.get(endpoint)!.push(time);
    this.updateSlowestEndpoints();
  }

  private updateAverageResponseTime(): void {
    if (this.responseTimeSamples.length > 0) {
      this.metrics.averageResponseTime = 
        this.responseTimeSamples.reduce((a, b) => a + b, 0) / this.responseTimeSamples.length;
    }
  }

  private updateAverageAIDecisionTime(): void {
    if (this.aiDecisionTimeSamples.length > 0) {
      this.metrics.averageAIDecisionTime = 
        this.aiDecisionTimeSamples.reduce((a, b) => a + b, 0) / this.aiDecisionTimeSamples.length;
    }
  }

  private updateSlowestEndpoints(): void {
    const endpointAverages: Array<{ endpoint: string; time: number }> = [];
    
    this.endpointTimings.forEach((timings, endpoint) => {
      const averageTime = timings.reduce((a, b) => a + b, 0) / timings.length;
      endpointAverages.push({ endpoint, time: averageTime });
    });

    this.metrics.slowestEndpoints = endpointAverages
      .sort((a, b) => b.time - a.time)
      .slice(0, 5);
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
} 