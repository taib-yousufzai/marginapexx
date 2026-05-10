import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { QuoteData } from '@/hooks/useKiteQuotes';

interface AppState {
  // Session State
  session: Session | null;
  setSession: (session: Session | null) => void;
  
  // Market Data State
  quotes: Record<string, QuoteData>;
  setQuotes: (quotes: Record<string, QuoteData>) => void;
  updateQuotes: (newQuotes: Record<string, QuoteData>) => void;
  
  // UI State
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useStore = create<AppState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  
  quotes: {},
  setQuotes: (quotes) => set({ quotes }),
  updateQuotes: (newQuotes) => set((state) => ({
    quotes: { ...state.quotes, ...newQuotes }
  })),
  
  theme: 'light',
  setTheme: (theme) => set({ theme }),
}));
