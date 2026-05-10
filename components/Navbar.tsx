'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface NavbarProps {
  title?: string | React.ReactNode;
  showBack?: boolean;
  onNotifClick?: () => void;
}

export default function Navbar({ title, showBack, onNotifClick }: NavbarProps) {
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    setIsDark(saved === 'dark');
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.body.classList.toggle('dark', newDark);
    localStorage.setItem('marginApexTheme', newDark ? 'dark' : 'light');
  };

  return (
    <div className="nav-bar-full mobile-only">
      <div className="nav-group">
        {showBack ? (
          <button className="nav-icon-btn" onClick={() => router.back()}>
            <i className="fas fa-arrow-left"></i>
          </button>
        ) : (
          <button className="nav-icon-btn" onClick={onNotifClick}>
            <i className="fas fa-bell"></i>
          </button>
        )}
      </div>

      <div className="nav-app-name">
        {title || (
          <>
            MARGIN<span style={{ color: '#006400' }}>APEX</span>
          </>
        )}
      </div>

      <div className="nav-group">
        <button className="nav-icon-btn" onClick={toggleTheme}>
          <i className={isDark ? "fas fa-sun" : "fas fa-moon"}></i>
        </button>
        <Link href="/funds" className="nav-funds" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '6px', 
          background: 'var(--positive-bg)', 
          color: 'var(--positive-text)', 
          padding: '6px 12px', 
          borderRadius: '20px', 
          fontSize: '0.8rem', 
          fontWeight: 700,
          textDecoration: 'none'
        }}>
          <i className="fas fa-coins"></i>
          <span>Funds</span>
        </Link>
        <Link href="/profile" className="nav-icon-btn">
          <i className="fas fa-user-cog"></i>
        </Link>
      </div>
    </div>
  );
}
