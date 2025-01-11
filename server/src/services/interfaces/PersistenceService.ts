interface PersistenceService {
  // ... existing methods
  loadModelHistory(): Promise<any>;
  saveModelHistory(data: any): Promise<void>;
  loadPatterns(): Promise<any>;
  savePatterns(patterns: any): Promise<void>;
  loadPerformanceMetrics(): Promise<any>;
  savePerformanceMetrics(metrics: any): Promise<void>;
} 