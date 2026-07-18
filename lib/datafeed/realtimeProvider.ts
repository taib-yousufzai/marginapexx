import { resolutionToMs } from './resolutionUtils';

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SubscriberEntry {
  callback: (bar: Bar) => void;
  resolution: string;
  lastBar: Bar | null;
}

export class RealtimeProvider {
  private subscribers = new Map<string, SubscriberEntry>();

  subscribe(uid: string, entry: SubscriberEntry): void {
    this.subscribers.set(uid, entry);
  }

  unsubscribe(uid: string): void {
    this.subscribers.delete(uid); // no-op if not present
  }

  setLastBar(bar: Bar): void {
    for (const entry of this.subscribers.values()) {
      entry.lastBar = bar;
    }
  }

  update(lastPrice: number, nowMs: number): void {
    for (const entry of this.subscribers.values()) {
      const resMs = resolutionToMs(entry.resolution);
      const boundary = Math.floor(nowMs / resMs) * resMs;
      const prev = entry.lastBar;

      const isNewCandle = !prev || boundary > prev.time;
      const bar: Bar = {
        time:  boundary,
        open:  isNewCandle ? (prev?.close ?? lastPrice) : (prev?.open ?? lastPrice),
        high:  isNewCandle ? lastPrice : Math.max(prev!.high, lastPrice),
        low:   isNewCandle ? lastPrice : Math.min(prev!.low, lastPrice),
        close: lastPrice,
      };

      entry.lastBar = bar;
      entry.callback(bar);
    }
  }
}
