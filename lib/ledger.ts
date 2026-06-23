export type EntryType = 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'CORRECTION' | 'REFUND';
export type Direction = 'CREDIT' | 'DEBIT';

export interface LedgerEntry {
  id: string;
  user_id: string;
  entry_type: EntryType;
  direction: Direction;
  amount: number;
  remarks: string | null;
  pay_request_id: string | null;
  created_at: string;
}

/** Recompute balance from a list of ledger entries. */
export function computeLedgerBalance(entries: LedgerEntry[]): number {
  return entries.reduce((sum, e) => {
    return e.direction === 'CREDIT' ? sum + e.amount : sum - e.amount;
  }, 0);
}
