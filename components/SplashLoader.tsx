'use client';
import React, { useState, useEffect } from 'react';

export default function SplashLoader() {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Start fading out after 600ms
    const fadeTimer = setTimeout(() => {
      setFading(true);

      // Mark as hidden after 300ms transition completes
      const hideTimer = setTimeout(() => {
        setHidden(true);
      }, 300);

      return () => clearTimeout(hideTimer);
    }, 600);

    return () => clearTimeout(fadeTimer);
  }, []);

  return (
    <div
      id="app-splash-screen"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#ffffff',
        zIndex: 99999,
        display: hidden ? 'none' : 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '35vh',
        transition: 'opacity 0.3s ease, visibility 0.3s ease',
        opacity: fading ? 0 : 1,
        visibility: fading ? 'hidden' : 'visible',
        pointerEvents: 'none',
      }}
    >
      <img
        src="/icon-512x512.png"
        alt="Logo"
        style={{
          width: '180px',
          height: '180px',
          objectFit: 'contain',
          borderRadius: '32px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        }}
      />
    </div>
  );
}
