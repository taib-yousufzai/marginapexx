import { describe, it, expect, beforeEach } from 'vitest';
import { telemetry } from '../metrics';

describe('Telemetry Registry', () => {
  beforeEach(() => {
    // Reset registry fields for isolated tests
    telemetry.ticks_received_total = 0;
    telemetry.ticks_processed_total = 0;
    telemetry.tick_processing_latency_ms = [];
    telemetry.orders_evaluated_total = 0;
    telemetry.positions_evaluated_total = 0;
    telemetry.matching_latency_ms = [];
    telemetry.alerts = [];
  });

  it('records received and processed ticks', () => {
    telemetry.recordTickReceived(10);
    telemetry.recordTickProcessed(10, 50);

    const summary = telemetry.getSummary();
    expect(summary.marketData.ticksReceived).toBe(10);
    expect(summary.marketData.ticksProcessed).toBe(10);
    expect(summary.marketData.avgProcessingLatencyMs).toBe(50);
  });

  it('records matching engine metrics and evaluates average latency', () => {
    telemetry.recordMatchingEngine(5, 2, 20);
    telemetry.recordMatchingEngine(3, 1, 30);

    const summary = telemetry.getSummary();
    expect(summary.matchingEngine.ordersEvaluated).toBe(8);
    expect(summary.matchingEngine.positionsEvaluated).toBe(3);
    expect(summary.matchingEngine.avgMatchingLatencyMs).toBe(25);
  });

  it('triggers warnings when processing latency exceeds threshold', () => {
    expect(telemetry.alerts.length).toBe(0);
    telemetry.recordTickProcessed(1, 600); // Threshold is 500ms
    expect(telemetry.alerts.length).toBe(1);
    expect(telemetry.alerts[0].level).toBe('WARNING');
    expect(telemetry.alerts[0].message).toContain('Slow tick processing');
  });
});
