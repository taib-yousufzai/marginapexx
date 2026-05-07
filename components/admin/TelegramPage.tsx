'use client';
import React, { useState } from 'react';

export default function TelegramPage() {
  const [bots, setBots] = useState<{ token: string; chatId: string; active: boolean }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [active, setActive] = useState(true);

  const handleAdd = () => {
    if (!token.trim()) return;
    setBots(prev => [...prev, { token: token.trim(), chatId: chatId.trim(), active }]);
    setToken('');
    setChatId('');
    setActive(true);
    setShowModal(false);
  };

  const handleClose = () => {
    setToken('');
    setChatId('');
    setActive(true);
    setShowModal(false);
  };

  return (
    <div className="adm-page">
      <h2 className="adm-page-title">Telegram Bot</h2>

      <div className="adm-card">
        <div className="adm-card-header">
          <div>
            <div className="adm-card-title">Telegram Configuration</div>
            <div className="adm-card-sub">Manage Telegram notification bot</div>
          </div>
          <button className="adm-btn-primary" onClick={() => setShowModal(true)}>
            Add Bot
          </button>
        </div>

        {bots.length === 0 ? (
          <div className="adm-dashed-box">No Telegram bot configured</div>
        ) : (
          <div className="adm-bot-list">
            {bots.map((b, i) => (
              <div className="adm-bot-row" key={i}>
                <i className="fab fa-telegram" style={{ color: '#2AABEE', fontSize: '1.2rem' }} />
                <div className="adm-bot-info">
                  <div className="adm-bot-name">{b.token.slice(0, 18)}…</div>
                  <div className="adm-bot-token">Chat ID: {b.chatId || '—'} · {b.active ? 'Active' : 'Inactive'}</div>
                </div>
                <button className="adm-btn-danger" onClick={() => setBots(prev => prev.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Sheet Modal */}
      {showModal && (
        <div className="adm-sheet-overlay" onClick={handleClose}>
          <div className="adm-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="adm-sheet-title">Add Telegram Bot</div>
            <div className="adm-sheet-sub">Configure Telegram bot to send trade alerts.</div>
            <div className="adm-sheet-divider" />

            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Bot Token</label>
              <input
                className="adm-sheet-input"
                placeholder="123456:ABCDEF..."
                value={token}
                onChange={e => setToken(e.target.value)}
              />
            </div>

            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Chat ID</label>
              <input
                className="adm-sheet-input"
                placeholder="-100xxxxxxxxxx"
                value={chatId}
                onChange={e => setChatId(e.target.value)}
              />
            </div>

            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Active</label>
              <div
                className={`adm-toggle ${active ? 'on' : ''}`}
                onClick={() => setActive(v => !v)}
              >
                <div className="adm-toggle-thumb" />
              </div>
            </div>

            <div className="adm-sheet-divider" />
            <div className="adm-sheet-actions">
              <button className="adm-sheet-cancel" onClick={handleClose}>Cancel</button>
              <button className="adm-btn-primary" onClick={handleAdd}>Add Bot</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
