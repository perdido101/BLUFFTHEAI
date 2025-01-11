import v8 from 'v8';
import { SystemHealthService } from './systemHealthService';

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  heapSizeLimit: number;
}

export class MemoryMonitoringService {
  private static instance: MemoryMonitoringService;
  private healthService: SystemHealthService;
  private snapshots: MemorySnapshot[] = [];
  private readonly MAX_SNAPSHOTS = 100;
  private readonly HEAP_GROWTH_THRESHOLD = 0.1; // 10% growth
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.healthService = SystemHealthService.getInstance();
  }

  static getInstance(): MemoryMonitoringService {
    if (!MemoryMonitoringService.instance) {
      MemoryMonitoringService.instance = new MemoryMonitoringService();
    }
    return MemoryMonitoringService.instance;
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.takeSnapshot();
      this.analyzeMemory();
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
    }
  }

  private takeSnapshot(): void {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
      heapSizeLimit: heapStats.heap_size_limit
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }

  private analyzeMemory(): void {
    if (this.snapshots.length < 2) {
      return;
    }

    const latest = this.snapshots[this.snapshots.length - 1];
    const previous = this.snapshots[this.snapshots.length - 2];

    // Check heap growth
    const heapGrowth = (latest.heapUsed - previous.heapUsed) / previous.heapUsed;
    if (heapGrowth > this.HEAP_GROWTH_THRESHOLD) {
      this.healthService.reportIssue({
        component: 'MemoryMonitoring',
        severity: heapGrowth > this.HEAP_GROWTH_THRESHOLD * 2 ? 'CRITICAL' : 'WARNING',
        message: `Heap grew by ${(heapGrowth * 100).toFixed(1)}% since last snapshot`
      });
    }

    // Check heap limit proximity
    const heapUsageRatio = latest.heapUsed / latest.heapSizeLimit;
    if (heapUsageRatio > 0.7) {
      this.healthService.reportIssue({
        component: 'MemoryMonitoring',
        severity: heapUsageRatio > 0.85 ? 'CRITICAL' : 'WARNING',
        message: `High heap usage: ${(heapUsageRatio * 100).toFixed(1)}% of limit`
      });
    }
  }

  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  getLatestSnapshot(): MemorySnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  clearHistory(): void {
    this.snapshots = [];
  }
} 