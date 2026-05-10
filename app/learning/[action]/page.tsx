'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import NotificationDrawer from '@/components/NotificationDrawer';
import Footer from '@/components/Footer';

export default function LearningPage() {
  const router = useRouter();
  const params = useParams();
  const action = params.action as string;
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = React.useState(false);

  const getDetails = (act: string) => {
    switch (act) {
      case 'algo': return { title: 'Algorithmic Trading', icon: 'fas fa-robot', desc: 'Automate your trading strategies with our powerful algo engine.' };
      case 'ai': return { title: 'AI Trading Beta', icon: 'fas fa-brain', desc: 'Leverage machine learning to predict market trends and optimize entry points.' };
      case 'indicator': return { title: 'Pro Indicators', icon: 'fas fa-chart-simple', desc: 'Unlock advanced technical indicators for your charts.' };
      case 'course': return { title: 'Masterclass Course', icon: 'fas fa-video', desc: 'Comprehensive video tutorials from market experts.' };
      case 'classes': return { title: 'Live Classes', icon: 'fas fa-chalkboard-user', desc: 'Join our weekly live trading sessions and Q&A.' };
      case 'books': return { title: 'Trading Library', icon: 'fas fa-book', desc: 'Download free e-books and research papers.' };
      default: return { title: 'Learning Hub', icon: 'fas fa-graduation-cap', desc: 'Expand your trading knowledge.' };
    }
  };

  const details = getDetails(action);

  return (
    <div className="desktop-layout">
      <Sidebar />
      <main className="main-viewport">
        <div className="app-container">
          <Navbar title={details.title} onNotifClick={() => setIsNotifDrawerOpen(true)} />
          
          <div className="main-scroll-wrapper">
            <div className="main-content">
              <div className="screen">
                <div className="content-padded">
                  <div style={{ padding: '40px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center', marginTop: '20px' }}>
                    <i className={details.icon} style={{ fontSize: '4rem', color: 'var(--accent-color, #3b82f6)', marginBottom: '20px' }}></i>
                    <h2 style={{ margin: '0 0 15px 0', color: 'var(--text-primary)' }}>{details.title}</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: '1.6' }}>
                      {details.desc}
                    </p>
                    <button 
                      style={{ 
                        marginTop: '30px', 
                        background: 'var(--accent-color, #3b82f6)', 
                        color: 'white', 
                        border: 'none', 
                        padding: '12px 24px', 
                        borderRadius: '8px', 
                        fontWeight: 'bold', 
                        cursor: 'pointer' 
                      }}
                      onClick={() => alert('Feature coming soon!')}
                    >
                      Get Started
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Footer activeTab="home" />
        </div>
      </main>
      <NotificationDrawer isOpen={isNotifDrawerOpen} onClose={() => setIsNotifDrawerOpen(false)} />
    </div>
  );
}
