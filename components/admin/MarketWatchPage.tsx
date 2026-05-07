'use client';
import React, { useState, useEffect } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, TAB_INSTRUMENTS, WatchlistItem } from './AdminUtils';

export default function MarketWatchPage() {
  const tabs = ['INDEX-FUT', 'INDEX-OPT', 'STOCK-FUT', 'STOCK-OPT', 'NSE-EQ', 'MCX-FUT', 'MCX-OPT', 'COMEX', 'CRYPTO', 'FOREX'];
  const [activeTab, setActiveTab] = useState('INDEX-FUT');
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [watchlists, setWatchlists] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState<ToastState>(null);

  // Fetch watchlist for the active tab from the database
  useEffect(() => {
    apiCall(`/api/admin/watchlist?tab=${encodeURIComponent(activeTab)}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        const items = data as WatchlistItem[];
        setWatchlists(prev => ({ ...prev, [activeTab]: items.map(item => item.symbol) }));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  }, [activeTab]);

  const instruments = watchlists[activeTab] ?? [];
  const allForTab = TAB_INSTRUMENTS[activeTab] ?? [];

  const suggestions = search.trim().length > 0
    ? allForTab.filter(s => s.toLowerCase().includes(search.trim().toLowerCase()))
    : allForTab;

  const showDropdown = focused && search.trim().length > 0;

  const addInstrument = (sym: string) => {
    setSearch('');
    setFocused(false);
    apiCall('/api/admin/watchlist', {
      method: 'POST',
      body: JSON.stringify({ tab: activeTab, symbol: sym }),
    }).then(({ ok, status }) => {
      if (status === 401) { signOut(); return; }
      if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
      if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
      setWatchlists(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] ?? []).filter(x => x !== sym), sym],
      }));
    }).catch((err: unknown) => {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    });
  };

  const handleClear = () => {
    apiCall(`/api/admin/watchlist?tab=${encodeURIComponent(activeTab)}`, { method: 'DELETE' })
      .then(({ ok, status }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setWatchlists(prev => ({ ...prev, [activeTab]: [] }));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  };

  const removeInstrument = (sym: string, idx: number) => {
    apiCall(`/api/admin/watchlist?tab=${encodeURIComponent(activeTab)}&symbol=${encodeURIComponent(sym)}`, { method: 'DELETE' })
      .then(({ ok, status }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setWatchlists(prev => ({ ...prev, [activeTab]: prev[activeTab].filter((_, j) => j !== idx) }));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  };

  return (
    <div className="adm-mw-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <div className="adm-mw-tabs">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`adm-mw-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); setSearch(''); setFocused(false); }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="adm-mw-search-row">
        <div className="adm-mw-search-wrap">
          <i className="fas fa-search adm-mw-search-icon" />
          <input
            className="adm-mw-search"
            placeholder="Search and add"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
          />
          {showDropdown && (
            <div className="adm-mw-dropdown">
              {suggestions.length === 0 ? (
                <div className="adm-mw-dd-empty">No results found</div>
              ) : (
                suggestions.map(sym => {
                  const added = instruments.includes(sym);
                  return (
                    <div
                      key={sym}
                      className={`adm-mw-dd-row ${added ? 'added' : ''}`}
                      onMouseDown={() => !added && addInstrument(sym)}
                    >
                      <span className="adm-mw-dd-sym">{sym}</span>
                      <span className="adm-mw-dd-tag">{activeTab}</span>
                      {added
                        ? <span className="adm-mw-dd-check"><i className="fas fa-check" /></span>
                        : <span className="adm-mw-dd-plus"><i className="fas fa-plus" /></span>
                      }
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        <button className="adm-mw-trash" onClick={handleClear}>
          <i className="fas fa-trash" />
        </button>
      </div>

      <div className="adm-mw-list">
        {instruments.length === 0 ? (
          <div className="adm-mw-empty">No instruments in this watchlist.</div>
        ) : (
          instruments.map((sym, i) => (
            <div className="adm-mw-row" key={i}>
              <span className="adm-mw-sym">{sym}</span>
              <button className="adm-mw-remove" onClick={() => removeInstrument(sym, i)}>✕</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
