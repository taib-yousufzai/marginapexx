'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/lib/auth';
import './Sidebar.css';

const navItems = [
  { key: 'home', label: 'Dashboard', icon: 'fas fa-th-large', path: '/' },
  { key: 'watchlist', label: 'Watchlist', icon: 'fas fa-list', path: '/watchlist' },
  { key: 'order', label: 'Orders', icon: 'fas fa-file-invoice-dollar', path: '/order' },
  { key: 'position', label: 'Positions', icon: 'fas fa-chart-line', path: '/position' },
  { key: 'history', label: 'History', icon: 'fas fa-history', path: '/history' },
  { key: 'funds', label: 'Funds', icon: 'fas fa-wallet', path: '/funds' },
  { key: 'profile', label: 'Profile', icon: 'fas fa-user-circle', path: '/profile' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    setIsDark(saved === 'dark');
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.body.classList.remove('dark', 'black');
    if (newDark) document.body.classList.add('dark');
    else { const t = localStorage.getItem('marginApexTheme'); if (t === 'black') document.body.classList.add('black'); }
    localStorage.setItem('marginApexTheme', newDark ? 'dark' : 'light');
  };

  return (
    <aside className={`desktop-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src="/logonew.jpg" alt="Logo" className="logo-icon-img" />
          {!isCollapsed && <span className="logo-text">MARGIN<span>APEX</span></span>}
        </div>
        <button className="collapse-btn" onClick={() => setIsCollapsed(!isCollapsed)}>
          <i className={`fas fa-chevron-${isCollapsed ? 'right' : 'left'}`}></i>
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
          return (
            <Link key={item.key} href={item.path} className={`sidebar-item ${isActive ? 'active' : ''}`}>
              <div className="sidebar-icon">
                <i className={item.icon}></i>
              </div>
              {!isCollapsed && <span className="sidebar-label">{item.label}</span>}
              {isActive && <div className="active-indicator" />}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-action-btn" onClick={toggleTheme} title="Toggle Theme">
          <div className="sidebar-icon">
            <i className={isDark ? 'fas fa-sun' : 'fas fa-moon'}></i>
          </div>
          {!isCollapsed && <span className="sidebar-label">{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
        
        <button className="sidebar-action-btn logout" onClick={() => signOut()} title="Logout">
          <div className="sidebar-icon">
            <i className="fas fa-sign-out-alt"></i>
          </div>
          {!isCollapsed && <span className="sidebar-label">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
