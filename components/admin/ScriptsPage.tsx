'use client';
/**
 * ScriptsPage — Admin tool for managing per-user allowed scripts.
 *
 * Replaces the standalone scriptmangement.html prototype.
 * Connected to real APIs:
 *   GET  /api/admin/users                     → user list
 *   GET  /api/admin/users/[id]/block-scripts   → user's blocked symbols + segments
 *   POST /api/admin/users/[id]/block-scripts   → block a symbol or segment
 *   DEL  /api/admin/users/[id]/block-scripts   → unblock a symbol or segment
 *   GET  /api/admin/instruments/search?q=&tab= → instrument search
 *   GET  /api/admin/settings/filtering         → global segment enable/disable
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSession } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  client_id?: string | null;
  demo_user?: boolean;
}

interface Instrument {
  id: string;
  tradingsymbol: string;
  name?: string;
  exchange?: string;
  instrument_type?: string;
}

interface UserScriptState {
  blockedSymbols: string[];
  blockedSegments: string[];
}

// Default search terms per segment — used when no user query is typed
const SEGMENT_DEFAULT_SEARCH: Record<string, string> = {
  'INDEX-FUT':  'NIFTY',
  'INDEX-OPT':  'NIFTY',
  'STOCK-FUT':  'RELIANCE',
  'STOCK-OPT':  'RELIANCE',
  'NSE-EQ':     'RELIANCE',
  'MCX-FUT':    'GOLD',
  'MCX-OPT':    'GOLD',
  'COMEX':      'GOLD',
  'CRYPTO':     'BTC',
  'FOREX':      'USDINR',
};

const SEGMENTS = [
  'INDEX-FUT', 'INDEX-OPT', 'STOCK-FUT', 'STOCK-OPT',
  'NSE-EQ', 'MCX-FUT', 'MCX-OPT', 'COMEX', 'CRYPTO', 'FOREX',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function authHeaders() {
  const session = await getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ScriptsPage() {
  // Users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<AdminUser[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Active segment tab
  const [activeSegment, setActiveSegment] = useState(SEGMENTS[0]);

  // Instruments for current segment
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrSearch, setInstrSearch] = useState('');
  const [instrLoading, setInstrLoading] = useState(false);

  // Per-user script state cache: userId → { blockedSymbols, blockedSegments }
  const scriptCache = useRef<Record<string, UserScriptState>>({});
  const [scriptState, setScriptState] = useState<UserScriptState>({ blockedSymbols: [], blockedSegments: [] });

  // Copy-from user
  const [copySearch, setCopySearch] = useState('');
  const [copyUserId, setCopyUserId] = useState<string | null>(null);
  const [copyUserName, setCopyUserName] = useState('');
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);

  // Remove mode
  const [removeMode, setRemoveMode] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // Saving
  const [saving, setSaving] = useState(false);

  // ── Load users on mount ──────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const headers = await authHeaders();
      const res = await fetch('/api/admin/users?demo=all', { headers });
      if (res.ok) {
        const data = await res.json();
        setUsers(data || []);
      }
    })();
  }, []);

  // ── Load instruments when segment changes ────────────────────────────────

  useEffect(() => {
    fetchInstruments(instrSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegment]);

  const fetchInstruments = useCallback(async (q: string) => {
    setInstrLoading(true);
    try {
      const headers = await authHeaders();
      // Use user's query if long enough, otherwise fall back to a known symbol for this segment
      const query = q.length >= 2 ? q : (SEGMENT_DEFAULT_SEARCH[activeSegment] || 'NIFTY');
      const res = await fetch(`/api/admin/instruments/search?q=${encodeURIComponent(query)}&tab=${activeSegment}`, { headers });
      if (res.ok) {
        const data: Instrument[] = await res.json();
        setInstruments(data);
      }
    } finally {
      setInstrLoading(false);
    }
  }, [activeSegment]);

  const handleInstrSearch = (val: string) => {
    setInstrSearch(val);
    fetchInstruments(val);
  };

  // ── Load script state for the active (single) user selection ─────────────
  // When multiple users are selected we show union of blocked symbols.

  useEffect(() => {
    if (selectedUsers.length === 1) {
      loadUserScripts(selectedUsers[0].id);
    } else {
      setScriptState({ blockedSymbols: [], blockedSegments: [] });
    }
  }, [selectedUsers]);

  const loadUserScripts = async (userId: string) => {
    if (scriptCache.current[userId]) {
      setScriptState(scriptCache.current[userId]);
      return;
    }
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/users/${userId}/block-scripts`, { headers });
    if (res.ok) {
      const data = await res.json();
      const state: UserScriptState = {
        blockedSymbols: data.symbols || [],
        blockedSegments: data.segments || [],
      };
      scriptCache.current[userId] = state;
      setScriptState(state);
    }
  };

  // ── User selection ────────────────────────────────────────────────────────

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.client_id || '').toLowerCase().includes(q)
    );
  }).filter(u => !selectedUsers.some(s => s.id === u.id));

  const addUser = (u: AdminUser) => {
    setSelectedUsers(prev => [...prev, u]);
    setUserSearch('');
    setShowUserDropdown(false);
  };

  const removeUser = (id: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== id));
  };

  const applyToAll = () => setSelectedUsers(users);
  const applyDemo = () => setSelectedUsers(users.filter(u => u.demo_user));
  const clearUsers = () => setSelectedUsers([]);

  // ── Symbol block/unblock toggle ───────────────────────────────────────────

  const isBlocked = (symbol: string) => scriptState.blockedSymbols.includes(symbol);
  const isSegmentBlocked = (seg: string) => scriptState.blockedSegments.includes(seg);

  const toggleSymbol = async (symbol: string) => {
    if (selectedUsers.length === 0) { showToastMsg('Select at least one user first'); return; }
    const blocked = isBlocked(symbol);
    const headers = await authHeaders();
    const postHeaders = { ...headers, 'Content-Type': 'application/json' };

    for (const user of selectedUsers) {
      if (blocked) {
        // Unblock: DELETE with query param
        await fetch(`/api/admin/users/${user.id}/block-scripts?symbol=${encodeURIComponent(symbol)}`, {
          method: 'DELETE',
          headers,
        });
      } else {
        // Block: POST with body
        await fetch(`/api/admin/users/${user.id}/block-scripts`, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify({ symbol }),
        });
      }
      delete scriptCache.current[user.id];
    }

    if (selectedUsers.length === 1) await loadUserScripts(selectedUsers[0].id);
    showToastMsg(`${symbol} ${blocked ? 'unblocked' : 'blocked'} for ${selectedUsers.length} user(s)`);
  };

  const toggleSegment = async (seg: string) => {
    if (selectedUsers.length === 0) { showToastMsg('Select at least one user first'); return; }
    const blocked = isSegmentBlocked(seg);
    const headers = await authHeaders();
    const postHeaders = { ...headers, 'Content-Type': 'application/json' };

    for (const user of selectedUsers) {
      if (blocked) {
        await fetch(`/api/admin/users/${user.id}/block-scripts?segment=${encodeURIComponent(seg)}`, {
          method: 'DELETE',
          headers,
        });
      } else {
        await fetch(`/api/admin/users/${user.id}/block-scripts`, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify({ segment: seg }),
        });
      }
      delete scriptCache.current[user.id];
    }

    if (selectedUsers.length === 1) await loadUserScripts(selectedUsers[0].id);
    showToastMsg(`Segment ${seg} ${blocked ? 'enabled' : 'disabled'} for ${selectedUsers.length} user(s)`);
  };

  // ── Copy scripts from another user ────────────────────────────────────────

  const filteredCopyUsers = users.filter(u => {
    const q = copySearch.toLowerCase();
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  const copyFromUser = async () => {
    if (!copyUserId || selectedUsers.length === 0) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const srcRes = await fetch(`/api/admin/users/${copyUserId}/block-scripts`, { headers });
      if (!srcRes.ok) { showToastMsg('Failed to load source user scripts'); return; }
      const srcData = await srcRes.json();

      const postHeaders = { ...headers, 'Content-Type': 'application/json' };
      for (const user of selectedUsers) {
        // 1. Unblock all currently blocked symbols for this user
        const currentRes = await fetch(`/api/admin/users/${user.id}/block-scripts`, { headers });
        if (currentRes.ok) {
          const current = await currentRes.json();
          for (const sym of (current.symbols || [])) {
            await fetch(`/api/admin/users/${user.id}/block-scripts?symbol=${encodeURIComponent(sym)}`, {
              method: 'DELETE',
              headers,
            });
          }
        }
        // 2. Block same symbols as source
        for (const sym of (srcData.symbols || [])) {
          await fetch(`/api/admin/users/${user.id}/block-scripts`, {
            method: 'POST',
            headers: postHeaders,
            body: JSON.stringify({ symbol: sym }),
          });
        }
        delete scriptCache.current[user.id];
      }

      if (selectedUsers.length === 1) await loadUserScripts(selectedUsers[0].id);
      showToastMsg(`Copied scripts from ${copyUserName} to ${selectedUsers.length} user(s)`);
    } finally {
      setSaving(false);
    }
  };

  // ── Toast ─────────────────────────────────────────────────────────────────

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.h1}>Scripts <span style={{ color: '#888', fontWeight: 300 }}>·</span> Management</h1>
        <div style={styles.adminBadge}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Super Admin</span>
          <span style={{ fontSize: '0.65rem', color: '#aaa', display: 'block' }}>Scripts Allowed</span>
        </div>
      </div>

      <div style={styles.panel}>

        {/* ── User Selection ── */}
        <div style={styles.sectionTitle}>Apply to Users</div>

        <div style={styles.userSelection}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              style={styles.input}
              placeholder="Search users by name, email, or ID..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              onFocus={() => setShowUserDropdown(true)}
              onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)}
            />
            {showUserDropdown && filteredUsers.length > 0 && (
              <div style={styles.dropdown}>
                {filteredUsers.map(u => (
                  <div key={u.id} style={styles.dropdownItem} onMouseDown={() => addUser(u)}>
                    <span>{u.full_name || u.email}</span>
                    <span style={styles.roleTag}>{u.client_id || u.id.slice(0, 8)} · {u.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick apply */}
          <div style={styles.quickRow}>
            <span style={{ fontSize: '0.75rem', color: '#666' }}>Quick:</span>
            <button style={styles.chipBtn} onClick={applyToAll}>All Users ({users.length})</button>
            <button style={{ ...styles.chipBtn, borderColor: '#16a34a', color: '#16a34a' }} onClick={applyDemo}>
              Demo ({users.filter(u => u.demo_user).length})
            </button>
            <button style={styles.chipBtn} onClick={clearUsers}>Clear</button>
          </div>

          {/* Selected users */}
          {selectedUsers.length > 0 ? (
            <div style={styles.tagRow}>
              {selectedUsers.map(u => (
                <span key={u.id} style={styles.userTag}>
                  {u.full_name || u.email}
                  <button style={styles.tagX} onClick={() => removeUser(u.id)}>✕</button>
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '0.5rem' }}>No users selected</p>
          )}
        </div>

        {/* ── Copy From User ── */}
        <div style={{ ...styles.copyRow, marginTop: '1rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Copy scripts from:</span>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              style={{ ...styles.input, margin: 0 }}
              placeholder="Search user..."
              value={copySearch}
              onChange={e => setCopySearch(e.target.value)}
              onFocus={() => setShowCopyDropdown(true)}
              onBlur={() => setTimeout(() => setShowCopyDropdown(false), 200)}
            />
            {showCopyDropdown && filteredCopyUsers.length > 0 && (
              <div style={styles.dropdown}>
                {filteredCopyUsers.slice(0, 8).map(u => (
                  <div key={u.id} style={styles.dropdownItem} onMouseDown={() => {
                    setCopyUserId(u.id);
                    setCopyUserName(u.full_name || u.email || u.id);
                    setCopySearch(u.full_name || u.email || '');
                    setShowCopyDropdown(false);
                  }}>
                    <span>{u.full_name || u.email}</span>
                    <span style={styles.roleTag}>{u.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            style={{ ...styles.btnPrimary, opacity: copyUserId && selectedUsers.length > 0 ? 1 : 0.4 }}
            disabled={!copyUserId || selectedUsers.length === 0 || saving}
            onClick={copyFromUser}
          >
            {saving ? 'Copying...' : 'Copy Scripts'}
          </button>
        </div>

        {/* ── Segment Tabs ── */}
        <div style={styles.segmentNav}>
          {SEGMENTS.map(seg => {
            const blocked = isSegmentBlocked(seg);
            return (
              <div key={seg} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.75rem', border: `1px solid ${blocked ? '#dc2626' : '#ddd'}`, borderRadius: '2rem', background: blocked ? '#fee2e2' : '#fff' }}>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: activeSegment === seg ? 700 : 500, color: blocked ? '#dc2626' : activeSegment === seg ? '#2563eb' : '#333' }}
                  onClick={() => setActiveSegment(seg)}
                >
                  {seg}
                </button>
                {/* Toggle segment on/off */}
                <div
                  onClick={() => toggleSegment(seg)}
                  title={blocked ? 'Enable segment' : 'Disable segment'}
                  style={{
                    width: '2.125rem', height: '1.125rem', borderRadius: '1rem',
                    background: blocked ? '#d1d5db' : '#2563eb',
                    position: 'relative', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: blocked ? '2px' : 'calc(100% - 1rem - 2px)',
                    width: '0.875rem', height: '0.875rem',
                    borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Instrument Search + Remove Mode ── */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={{ ...styles.input, flex: 1, minWidth: '12rem', margin: 0 }}
            placeholder={`Search ${activeSegment} (e.g. ${SEGMENT_DEFAULT_SEARCH[activeSegment] || 'NIFTY'})...`}
            value={instrSearch}
            onChange={e => handleInstrSearch(e.target.value)}
          />
          <button
            style={{ ...styles.chipBtn, borderColor: removeMode ? '#dc2626' : '#ddd', color: removeMode ? '#fff' : '#333', background: removeMode ? '#dc2626' : 'transparent' }}
            onClick={() => setRemoveMode(r => !r)}
          >
            {removeMode ? '✕ Remove Mode ON' : 'Remove Mode'}
          </button>
        </div>

        {/* ── Scripts Grid ── */}
        <div style={styles.scriptsGrid}>
          {instrLoading ? (
            <div style={styles.emptyMsg}>Loading instruments...</div>
          ) : instruments.length === 0 ? (
            <div style={styles.emptyMsg}>No instruments found. Try a different search.</div>
          ) : (
            instruments.map(instr => {
              const sym = instr.tradingsymbol;
              const blocked = isBlocked(sym);
              return (
                <div key={instr.id} style={{ ...styles.scriptItem, background: blocked ? '#fee2e2' : 'transparent' }}>
                  {!removeMode && (
                    <input
                      type="checkbox"
                      checked={!blocked}
                      onChange={() => toggleSymbol(sym)}
                      style={{ width: '1rem', height: '1rem', accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
                    />
                  )}
                  <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 500, color: blocked ? '#dc2626' : '#1a1a1a' }}>
                    {instr.name || sym}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#888' }}>{sym}</span>
                  {removeMode && (
                    <button
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1.125rem', fontWeight: 700, padding: '0 0.25rem' }}
                      onClick={() => toggleSymbol(sym)}
                      title="Remove block"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Status bar ── */}
        {selectedUsers.length > 0 && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#555' }}>
            Showing <strong>{scriptState.blockedSymbols.length}</strong> blocked symbols
            {selectedUsers.length === 1 ? ` for ${selectedUsers[0].full_name || selectedUsers[0].email}` : ` (${selectedUsers.length} users selected — showing first user)`}
          </div>
        )}

      </div>

      {/* Toast */}
      {toast && (
        <div style={styles.toast}>{toast}</div>
      )}
    </div>
  );
}

// ─── Inline styles (mirrors scriptmangement.html design) ──────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Inter', sans-serif",
    background: '#f4f5f7',
    padding: '1.75rem 2rem',
    color: '#1a1a1a',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.75rem',
    paddingBottom: '0.875rem',
    borderBottom: '2px solid #1a1a1a',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  h1: {
    fontWeight: 700,
    fontSize: '1.75rem',
    letterSpacing: '-0.025rem',
  },
  adminBadge: {
    background: '#1a1a1a',
    color: '#fff',
    padding: '0.375rem 1.375rem 0.375rem 1rem',
    borderRadius: '3.75rem',
    textAlign: 'center',
  },
  panel: {
    background: '#fff',
    borderRadius: '0.875rem',
    boxShadow: '0 4px 14px rgba(0,0,0,0.02)',
    border: '1px solid rgba(0,0,0,0.03)',
    padding: '1.5rem 1.75rem',
  },
  sectionTitle: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#333',
    marginBottom: '0.625rem',
  },
  userSelection: {
    background: '#f5f5f5',
    borderRadius: '0.5rem',
    border: '1px solid #e0e0e0',
    padding: '1rem 1.25rem',
    marginBottom: '0.75rem',
  },
  input: {
    width: '100%',
    padding: '0.5rem 1rem',
    border: '1px solid #d0d0d0',
    borderRadius: '2.5rem',
    fontSize: '0.8125rem',
    fontFamily: 'inherit',
    background: '#fff',
    color: '#1a1a1a',
    boxSizing: 'border-box',
    marginBottom: '0.5rem',
    outline: 'none',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 0.25rem)',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid #d0d0d0',
    borderRadius: '0.5rem',
    maxHeight: '12.5rem',
    overflowY: 'auto',
    zIndex: 100,
    boxShadow: '0 8px 26px rgba(0,0,0,0.04)',
  },
  dropdownItem: {
    padding: '0.5rem 1rem',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleTag: {
    fontSize: '0.625rem',
    color: '#888',
  },
  quickRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
    marginBottom: '0.5rem',
  },
  chipBtn: {
    padding: '0.25rem 0.75rem',
    border: '1px solid #d0d0d0',
    borderRadius: '2.5rem',
    background: 'transparent',
    fontSize: '0.75rem',
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
    color: '#333',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  userTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.25rem 0.625rem 0.25rem 0.875rem',
    background: '#dbeafe',
    border: '1px solid #bfdbfe',
    borderRadius: '2.5rem',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  tagX: {
    background: 'none',
    border: 'none',
    color: '#dc2626',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 700,
    padding: '0 0.125rem',
    lineHeight: 1,
    fontFamily: 'inherit',
  },
  copyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.875rem 1.25rem',
    background: '#f5f5f5',
    border: '1px solid #d0d0d0',
    borderRadius: '0.5rem',
    flexWrap: 'wrap',
  },
  segmentNav: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.625rem',
    margin: '1rem 0',
    paddingBottom: '1rem',
    borderBottom: '1px solid #d0d0d0',
  },
  scriptsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(13.75rem, 1fr))',
    gap: '0.25rem',
    maxHeight: '26.25rem',
    overflowY: 'auto',
    border: '1px solid #d0d0d0',
    borderRadius: '0.5rem',
    background: '#fff',
    padding: '1rem 1.125rem',
  },
  scriptItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.375rem 0.5rem',
    borderRadius: '0.5rem',
    transition: 'background 0.1s',
    cursor: 'default',
  },
  emptyMsg: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '2rem 0',
    color: '#888',
    fontSize: '0.875rem',
  },
  btnPrimary: {
    padding: '0.5rem 1.5rem',
    border: '1px solid #1a1a1a',
    borderRadius: '2.5rem',
    background: '#1a1a1a',
    color: '#fff',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  toast: {
    position: 'fixed',
    bottom: '1.75rem',
    right: '1.75rem',
    background: '#1a1a1a',
    color: '#fff',
    padding: '0.875rem 1.75rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: '0.5rem',
    boxShadow: '0 8px 28px rgba(0,0,0,0.08)',
    zIndex: 2000,
  },
};
