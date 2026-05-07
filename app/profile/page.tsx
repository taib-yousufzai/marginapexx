'use client';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getSession, signOut } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';
import type { Session } from '@supabase/supabase-js';
import Footer from '@/components/Footer';
import Sidebar from '@/components/Sidebar';
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

            // Fetch profile data
            const profileRes = await fetch('/api/user/profile', {
                headers: { Authorization: `Bearer ${s.access_token}` },
            });
            if (!cancelled && profileRes.ok) {
                const data = await profileRes.json();
                setProfileName(data.full_name ?? '');
                setProfilePhone(data.phone ?? '');
            }

            // Fetch balance
            const balanceRes = await fetch('/api/pay/balance', {
                headers: { Authorization: `Bearer ${s.access_token}` },
            });
            if (!cancelled && balanceRes.ok) {
                const data = await balanceRes.json();
                setBalance(data.balance ?? 0);
            }

            // Fetch unread count
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
        setIsDark(saved === 'dark');
    }, []);

    const email = session?.user?.email ?? '';
    const displayName = profileName
        || (email ? email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'User');
    const avatarLetter = displayName.charAt(0).toUpperCase();
    const clientId = session?.user?.id ? session.user.id.replace(/-/g, '').slice(0, 6).toUpperCase() : 'N/A';
    const formattedBalance = balance !== null
        ? '₹' + balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : 'Loading…';

    const handleQuickSave = async () => {
        setSaving(true);
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
            setTimeout(() => setModalOpen(false), 900);
        } catch {
            setSaveMsg({ type: 'error', text: 'Failed to save.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="desktop-layout">
            <Sidebar />
            
            <main className="main-viewport">
                <div className="profile-container">
                    {/* Header for mobile view only */}
                    <header className="mobile-header">
                        <Link href="/" className="back-btn"><i className="fas fa-arrow-left"></i></Link>
                        <h1>My Account</h1>
                    </header>

                    <div className="profile-grid">
                        {/* Left Column: Summary Card */}
                        <aside className="profile-summary-section">
                            <div className="profile-hero-card">
                                <div className="avatar-large">{avatarLetter}</div>
                                <div className="hero-details">
                                    <h2>{displayName}</h2>
                                    <p className="client-id-badge">ID: {clientId}</p>
                                    <p className="hero-email">{email}</p>
                                </div>
                                <button className="edit-profile-btn" onClick={() => {
                                    setEditName(profileName);
                                    setEditPhone(profilePhone);
                                    setSaveMsg(null);
                                    setModalOpen(true);
                                }}>
                                    <i className="fas fa-edit"></i> Edit Profile
                                </button>
                            </div>

                            <div className="balance-summary-card">
                                <div className="card-header">
                                    <span className="card-title">AVAILABLE MARGIN</span>
                                    <Link href="/funds" className="funds-link">Add Funds</Link>
                                </div>
                                <div className="balance-display">{formattedBalance}</div>
                                <div className="balance-actions">
                                    <Link href="/funds?tab=withdraw" className="secondary-action">Withdraw</Link>
                                </div>
                            </div>

                            <button className="desktop-logout-btn" onClick={() => signOut()}>
                                <i className="fas fa-sign-out-alt"></i> Logout from System
                            </button>
                        </aside>

                        {/* Right Column: Settings & Links */}
                        <section className="profile-content-section">
                            <div className="settings-section">
                                <h3 className="section-heading">Account Settings</h3>
                                <div className="settings-grid">
                                    <Link href="/profile/details" className="settings-card">
                                        <div className="settings-icon blue"><i className="fas fa-user-circle"></i></div>
                                        <div className="settings-text">
                                            <h4>Profile Details</h4>
                                            <p>Manage your personal and KYC info</p>
                                        </div>
                                        <i className="fas fa-chevron-right"></i>
                                    </Link>
                                    <Link href="/profile/security" className="settings-card">
                                        <div className="settings-icon green"><i className="fas fa-shield-alt"></i></div>
                                        <div className="settings-text">
                                            <h4>Security</h4>
                                            <p>Passwords, 2FA and sessions</p>
                                        </div>
                                        <i className="fas fa-chevron-right"></i>
                                    </Link>
                                    <Link href="/profile/reports" className="settings-card">
                                        <div className="settings-icon red"><i className="fas fa-file-invoice"></i></div>
                                        <div className="settings-text">
                                            <h4>Reports & P&L</h4>
                                            <p>View your trade ledger and tax pnl</p>
                                        </div>
                                        <i className="fas fa-chevron-right"></i>
                                    </Link>
                                    <Link href="/profile/notifications" className="settings-card">
                                        <div className="settings-icon amber"><i className="fas fa-bell"></i></div>
                                        <div className="settings-text">
                                            <h4>Notifications</h4>
                                            <p>Alerts and system updates</p>
                                        </div>
                                        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
                                        <i className="fas fa-chevron-right"></i>
                                    </Link>
                                </div>
                            </div>

                            <div className="settings-section">
                                <h3 className="section-heading">Support & Community</h3>
                                <div className="settings-grid">
                                    <a href="https://wa.me/support" target="_blank" className="settings-card">
                                        <div className="settings-icon emerald"><i className="fab fa-whatsapp"></i></div>
                                        <div className="settings-text">
                                            <h4>24/7 WhatsApp Support</h4>
                                            <p>Get instant help from our team</p>
                                        </div>
                                        <i className="fas fa-external-link-alt"></i>
                                    </a>
                                    <Link href="/legal" className="settings-card">
                                        <div className="settings-icon slate"><i className="fas fa-gavel"></i></div>
                                        <div className="settings-text">
                                            <h4>Legal & Policy</h4>
                                            <p>Terms, Privacy and Disclosures</p>
                                        </div>
                                        <i className="fas fa-chevron-right"></i>
                                    </Link>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <Footer activeTab="profile" />
            </main>

            {/* Quick Edit Modal */}
            {modalOpen && (
                <div className="modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Edit Profile</h3>
                            <button className="close-btn" onClick={() => setModalOpen(false)}><i className="fas fa-times"></i></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Full Name</label>
                                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Phone Number</label>
                                <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                            </div>
                            {saveMsg && <div className={`form-msg ${saveMsg.type}`}>{saveMsg.text}</div>}
                        </div>
                        <div className="modal-footer">
                            <button className="save-btn" onClick={handleQuickSave} disabled={saving}>
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
