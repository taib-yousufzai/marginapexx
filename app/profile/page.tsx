'use client';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getSession, signOut } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';
import type { Session } from '@supabase/supabase-js';
import './page.css';
export default function ProfilePage() {
    useAuth();
    const [isDark, setIsDark] = useState(false);
    const [session, setSession] = useState<Session | null>(null);
    const [balance, setBalance] = useState<number | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);

    // Quick-edit modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Profile data
    const [profileName, setProfileName] = useState<string>('');
    const [profilePhone, setProfilePhone] = useState<string>('');

    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        getSession().then(async (s) => {
            if (cancelled) return;
            if (!s) return;
            setSession(s);

            // Fetch profile data (name/phone) via API
            const profileRes = await fetch('/api/user/profile', {
                headers: { Authorization: `Bearer ${s.access_token}` },
            });
            if (!cancelled && profileRes.ok) {
                const data = await profileRes.json();
                setProfileName(data.full_name ?? '');
                setProfilePhone(data.phone ?? '');
            }

            // Fetch balance from transactions (correct source)
            const balanceRes = await fetch('/api/pay/balance', {
                headers: { Authorization: `Bearer ${s.access_token}` },
            });
            if (!cancelled && balanceRes.ok) {
                const data = await balanceRes.json();
                setBalance(data.balance ?? 0);
            } else if (!cancelled) {
                setBalance(0);
            }

            // Fetch unread notification count
            const notifRes = await fetch('/api/notifications?unread_only=true&limit=50', {
                headers: { Authorization: `Bearer ${s.access_token}` },
            });
            if (!cancelled && notifRes.ok) {
                const data = await notifRes.json();
                setUnreadCount(data.unread_count ?? 0);
            }
        });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('marginApexTheme');
        const dark = saved === 'dark';
        setIsDark(dark);
        if (dark) document.body.classList.add('dark');
        else document.body.classList.remove('dark');
    }, []);

    useEffect(() => {
        if (modalOpen) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = '';
        return () => { document.body.style.overflow = ''; };
    }, [modalOpen]);

    const openModal = () => {
        setEditName(profileName);
        setEditPhone(profilePhone);
        setSaveMsg(null);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setSaveMsg(null);
    };

    const handleQuickSave = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
            const s = await getSession();
            if (!s) throw new Error('Not authenticated');
            const res = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
                body: JSON.stringify({ full_name: editName.trim(), phone: editPhone.trim() }),
            });
            if (!res.ok) throw new Error('Failed');
            setProfileName(editName.trim());
            setProfilePhone(editPhone.trim());
            setSaveMsg({ type: 'success', text: 'Saved!' });
            setTimeout(() => closeModal(), 900);
        } catch {
            setSaveMsg({ type: 'error', text: 'Failed to save. Try again.' });
        } finally {
            setSaving(false);
        }
    };

    const email = session?.user?.email ?? '';
    const displayName = profileName
        || (email ? email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'User');
    const avatarLetter = displayName.charAt(0).toUpperCase();
    const clientId = session?.user?.id ? session.user.id.replace(/-/g, '').slice(0, 6).toUpperCase() : 'N/A';
    const formattedBalance = balance !== null
        ? '₹' + balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—';

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
                        <Link href="/" style={{color:'#1A1E2B',textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',background:'#F8FAFF',width:'36px',height:'36px',borderRadius:'50%',border:'1px solid #EEF2F8'}}>
                            <i className="fas fa-arrow-left" style={{fontSize:'1rem'}}></i>
                        </Link>
                        <div className="logo-text" style={{marginLeft:'6px'}}>My Account</div>
                    </div>
                </div>
            </div>

            <div className="main-content">
                <div className="profile-hero">
                    <div className="avatar">{avatarLetter}</div>
                    <div className="profile-info">
                        <h2>{displayName}</h2>
                        <span className="user-email">{email}</span>
                        <span className="user-id">Client ID: {clientId}</span>
                    </div>
                    <button className="edit-btn" onClick={openModal} aria-label="Quick edit">
                        <i className="fas fa-pen"></i>
                    </button>
                </div>

                <div className="funds-card">
                    <div className="funds-label">Available Margin</div>
                    <div className="funds-amount">
                        {balance === null ? <span style={{opacity:0.5,fontSize:'1.4rem'}}>Loading…</span> : formattedBalance}
                    </div>
                    <div className="funds-actions">
                        <Link href="/funds" className="fund-btn add-btn" style={{textDecoration:'none'}}><i className="fas fa-plus"></i> Add Funds</Link>
                        <Link href="/funds?tab=withdraw" className="fund-btn wd-btn" style={{textDecoration:'none'}}><i className="fas fa-arrow-down"></i> Withdraw</Link>
                    </div>
                </div>

                <div className="menu-groups-grid">
                    <div className="menu-group">
                        <div className="menu-group-title">Account & Details</div>
                        <div className="menu-list">
                            <Link href="/profile/details" className="menu-item">
                                <div className="m-icon" style={{background:'#EEF2F8',color:'#1E40AF'}}><i className="fas fa-user"></i></div>
                                <div className="m-text">Profile Details</div>
                                <i className="fas fa-chevron-right m-caret"></i>
                            </Link>
                            <Link href="/profile/reports" className="menu-item">
                                <div className="m-icon" style={{background:'#FEF0F0',color:'#C62E2E'}}><i className="fas fa-file-invoice"></i></div>
                                <div className="m-text">Reports & P&L</div>
                                <i className="fas fa-chevron-right m-caret"></i>
                            </Link>
                            <Link href="/profile/security" className="menu-item">
                                <div className="m-icon" style={{background:'#F0FDF4',color:'#16A34A'}}><i className="fas fa-shield-alt"></i></div>
                                <div className="m-text">Security & Passwords</div>
                                <i className="fas fa-chevron-right m-caret"></i>
                            </Link>
                        </div>
                    </div>

                    <div className="menu-group">
                        <div className="menu-group-title">App Preferences</div>
                        <div className="menu-list">
                            <div className="menu-item" onClick={toggleDark} style={{cursor:'pointer'}}>
                                <div className="m-icon" style={{background:'#FAF5FF',color:'#9333EA'}}><i className="fas fa-moon"></i></div>
                                <div className="m-text">Dark Mode</div>
                                <div className={`toggle-switch ${isDark ? 'active' : ''}`}>
                                    <div className="toggle-thumb"></div>
                                </div>
                            </div>
                            <Link href="/profile/notifications" className="menu-item">
                                <div className="m-icon" style={{background:'#FFFBEB',color:'#D97706'}}><i className="fas fa-bell"></i></div>
                                <div className="m-text">Notifications</div>
                                {unreadCount > 0 && (
                                    <span style={{background:'#C62E2E',color:'white',fontSize:'0.6rem',fontWeight:800,padding:'2px 7px',borderRadius:'20px',marginRight:'4px'}}>
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                                <i className="fas fa-chevron-right m-caret"></i>
                            </Link>
                        </div>
                    </div>
                </div>

                <button className="logout-btn" onClick={() => signOut()}>
                    <i className="fas fa-power-off"></i> Logout
                </button>
            </div>

            {/* Quick Edit Bottom Sheet */}
            {modalOpen && (
                <div className="qe-overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) closeModal(); }}>
                    <div className="qe-sheet">
                        <div className="qe-handle"></div>
                        <div className="qe-header">
                            <span className="qe-title">Quick Edit</span>
                            <button className="qe-close" onClick={closeModal}><i className="fas fa-times"></i></button>
                        </div>
                        <div className="qe-body">
                            <div className="qe-field">
                                <label className="qe-label"><i className="fas fa-user"></i> Full Name</label>
                                <input className="qe-input" type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Enter your full name" autoFocus />
                            </div>
                            <div className="qe-field">
                                <label className="qe-label"><i className="fas fa-phone"></i> Phone Number</label>
                                <input className="qe-input" type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Enter phone number" />
                            </div>
                            {saveMsg && (
                                <div className={`qe-msg ${saveMsg.type}`}>
                                    <i className={`fas ${saveMsg.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                                    {saveMsg.text}
                                </div>
                            )}
                            <button className="qe-save-btn" onClick={handleQuickSave} disabled={saving}>
                                {saving ? <><i className="fas fa-spinner fa-spin"></i> Saving…</> : <><i className="fas fa-check"></i> Save Changes</>}
                            </button>
                            <Link href="/profile/details" className="qe-full-link" onClick={closeModal}>
                                <i className="fas fa-id-card"></i> View full profile details
                                <i className="fas fa-arrow-right"></i>
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
