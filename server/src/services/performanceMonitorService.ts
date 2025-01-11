export class PerformanceMonitorService {
  private metrics: {
    startTime: number | undefined;
    endTime: number | undefined;
    totalMoves: number;
    successfulBluffs: number;
    failedBluffs: number;
  };

  constructor() {
    this.metrics = {
      startTime: undefined,
      endTime: undefined,
      totalMoves: 0,
      successfulBluffs: 0,
      failedBluffs: 0
    };
  }

  startGame(): void {
    this.metrics.startTime = Date.now();
  }

  endGame(): void {
    this.metrics.endTime = Date.now();
  }

  // ... rest of the code ...
} 