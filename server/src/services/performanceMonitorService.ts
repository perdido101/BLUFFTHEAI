export class PerformanceMonitorService {
  private metrics: {
    startTime?: number;
    endTime?: number;
    totalMoves: number;
    successfulBluffs: number;
    failedBluffs: number;
  };

  constructor() {
    this.metrics = {
      totalMoves: 0,
      successfulBluffs: 0,
      failedBluffs: 0
    };
  }

  startGame() {
    this.metrics.startTime = Date.now();
  }

  endGame() {
    this.metrics.endTime = Date.now();
  }

  // ... rest of the code ...
} 