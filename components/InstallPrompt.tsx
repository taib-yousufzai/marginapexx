'use client';
import React, { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone || dismissed) return;

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Listen for Chrome/Android native install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Always show after 2s so it's visible even if native event doesn't fire
    const timer = setTimeout(() => setShow(true), 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, []);

  if (!show || dismissed) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDismissed(true);
      setDeferredPrompt(null);
    } else {
      // iOS / unsupported: guide user
      alert("To install: tap the Share button (Safari) or the browser menu → 'Add to Home Screen'");
    }
    setShow(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '90px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: '440px',
        background: 'linear-gradient(135deg, #0f0f0f 0%, #1c1c1c 100%)',
        border: '1px solid rgba(0,100,0,0.5)',
        borderRadius: '18px',
        padding: '14px 16px',
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        color: 'white',
        fontFamily: "'Inter', sans-serif",
        animation: 'slideUpPrompt 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}
    >
      <style>{`
        @keyframes slideUpPrompt {
          from { transform: translate(-50%, 30px); opacity: 0; }
          to   { transform: translate(-50%, 0);     opacity: 1; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div
          style={{
            background: 'rgba(0,100,0,0.25)',
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <i className="fas fa-download" style={{ color: '#4ADE80', fontSize: '1.1rem' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.2 }}>
            Install Margin Apex
          </div>
          <div style={{ fontSize: '0.68rem', color: '#9CA3AF', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {deferredPrompt ? 'Add to Home Screen for full-screen experience' : 'Add to your Home Screen'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={() => { setShow(false); setDismissed(true); }}
          style={{
            background: 'transparent',
            border: '1px solid #444',
            color: '#9CA3AF',
            padding: '8px 10px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
        <button
          onClick={handleInstall}
          style={{
            background: 'linear-gradient(135deg, #006400, #004d00)',
            border: 'none',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '12px',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 4px 12px rgba(0,100,0,0.4)',
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
