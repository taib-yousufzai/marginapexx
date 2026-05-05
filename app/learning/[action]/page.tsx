'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function LearningPage() {
  const router = useRouter();
  const params = useParams();
  const action = params.action as string;

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
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
        <button 
          onClick={() => router.back()} 
          style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', marginRight: '15px' }}
        >
          <i className="fas fa-arrow-left"></i>
        </button>
        <h1 style={{ margin: 0 }}>{details.title}</h1>
      </div>
      
      <div style={{ padding: '40px', background: 'var(--card-bg, #fff)', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', textAlign: 'center' }}>
        <i className={details.icon} style={{ fontSize: '4rem', color: '#3b82f6', marginBottom: '20px' }}></i>
        <h2 style={{ margin: '0 0 15px 0' }}>{details.title}</h2>
        <p style={{ color: 'var(--text-secondary, #666)', fontSize: '1.1rem', lineHeight: '1.6' }}>
          {details.desc}
        </p>
        <button 
          style={{ 
            marginTop: '30px', 
            background: '#3b82f6', 
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
  );
}
