'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSession, signOut } from '@/lib/auth';
import './page.css';

export default function ProfilePage() {
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(true);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        getSession().then((session) => {
            if (!session) {
                router.replace('/login');
            } else {
                setIsChecking(false);
            }
        });
    }, [router]);

    useEffect(() => {
        const saved = localStorage.getItem('marginApexTheme');
        const dark = saved === 'dark';
        setIsDark(dark);
        if (dark) document.body.classList.add('dark');
        else document.body.classList.remove('dark');
    }, []);

    if (isChecking) return null;

    const toggleDark = () => {
        const newDark = !isDark;
        setIsDark(newDark);
        document.body.classList.toggle('dark', newDark);
        localStorage.setItem('marginApexTheme', newDark ? 'dark' : 'light');
    };
    return (
        <div className="mobile-app">
            <div className="app-header">
                <div className="header-top">
                    <div className="logo-area">
                        <Link href="/" style={{color: '#1A1E2B', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFF', width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #EEF2F8' }}>
                            <i className="fas fa-arrow-left" style={{ fontSize: '1rem' }}></i>
                        </Link>
                        <div className="logo-text" style={{ marginLeft: '6px' }}>My Account</div>
                    </div>
                </div>
            </div>

            <div className="main-content">
                <div className="profile-hero">
                    <div className="avatar">D</div>
                    <div className="profile-info">
                        <h2>Daksh Sharma</h2>
                        <span className="user-id">Client ID: DA12345</span>
                    </div>
                    <div className="edit-btn"><i className="fas fa-pen"></i></div>
                </div>

                <div className="funds-card">
                    <div className="funds-label">Available Margin</div>
                    <div className="funds-amount">₹4,50,000.00</div>
                    <div className="funds-actions">
                        <button className="fund-btn add-btn"><i className="fas fa-plus"></i> Add Funds</button>
                        <button className="fund-btn wd-btn"><i className="fas fa-arrow-down"></i> Withdraw</button>
                    </div>
                </div>

                <div className="menu-group">
                    <div className="menu-group-title">Account & Details</div>
                    <div className="menu-list">
                        <div className="menu-item">
                            <div className="m-icon" style={{background: '#EEF2F8', color: '#1E40AF'}}><i className="fas fa-user"></i></div>
                            <div className="m-text">Profile Details</div>
                            <i className="fas fa-chevron-right m-caret"></i>
                        </div>
                        <div className="menu-item">
                            <div className="m-icon" style={{background: '#FEF0F0', color: '#C62E2E'}}><i className="fas fa-file-invoice"></i></div>
                            <div className="m-text">Reports & P&L</div>
                            <i className="fas fa-chevron-right m-caret"></i>
                        </div>
                        <div className="menu-item">
                            <div className="m-icon" style={{background: '#F0FDF4', color: '#16A34A'}}><i className="fas fa-shield-alt"></i></div>
                            <div className="m-text">Security & Passwords</div>
                            <i className="fas fa-chevron-right m-caret"></i>
                        </div>
                    </div>
                </div>

                <div className="menu-group">
                    <div className="menu-group-title">App Preferences</div>
                    <div className="menu-list">
                        <div className="menu-item" onClick={toggleDark} style={{cursor:'pointer'}}>
                            <div className="m-icon" style={{background: '#FAF5FF', color: '#9333EA'}}><i className="fas fa-moon"></i></div>
                            <div className="m-text">Dark Mode</div>
                            <div className={`toggle-switch ${isDark ? 'active' : ''}`} onClick={toggleDark}>
                                <div className="toggle-thumb"></div>
                            </div>
                        </div>
                        <div className="menu-item">
                            <div className="m-icon" style={{background: '#FFFBEB', color: '#D97706'}}><i className="fas fa-bell"></i></div>
                            <div className="m-text">Notifications</div>
                            <i className="fas fa-chevron-right m-caret"></i>
                        </div>
                    </div>
                </div>
                
                <button className="logout-btn" onClick={() => signOut()}><i className="fas fa-power-off"></i> Logout</button>
            </div>
            
            {/* Keeping it clean without the bottom nav since it's a dedicated subpage */}
        </div>
    );
}
