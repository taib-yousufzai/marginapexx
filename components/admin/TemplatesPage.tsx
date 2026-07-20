'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, Toast, ToastState, ConfirmDialog } from './AdminUtils';
import TemplateForm from './templates/TemplateForm';
import TemplateApplyModal from './templates/TemplateApplyModal';
import ScriptsPage from '@/components/admin/ScriptsPage';

export interface AccountTemplate {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  segments: string[] | null;
  read_only: boolean;
  demo_user: boolean;
  intraday_sq_off: boolean;
  auto_sqoff: number;
  showcase_auto_sqoff: number;
  sqoff_method: string;
  trading_mode: string;
  created_at: string;
  updated_at: string;
}

type View = 'list' | 'create' | 'edit';
type Tab = 'templates' | 'scripts';

export default function TemplatesPage({ isDemoMode, isBroker = false }: { isDemoMode?: boolean, isBroker?: boolean }) {
  const [tab, setTab] = useState<Tab>('templates');
  const [view, setView] = useState<View>('list');
  const [templates, setTemplates] = useState<AccountTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<AccountTemplate | null>(null);
  const [applyModalTemplate, setApplyModalTemplate] = useState<AccountTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const url = isBroker ? '/api/broker/templates' : '/api/admin/templates';
    const res = await apiCall(url, { method: 'GET' });
    setLoading(false);
    if (res.ok) {
      setTemplates(res.data as AccountTemplate[]);
    } else {
      setToast({ message: 'Failed to load templates', type: 'error' });
    }
  }, [isBroker]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleSetDefault = async (template: AccountTemplate) => {
    const url = isBroker ? `/api/broker/templates/${template.id}` : `/api/admin/templates/${template.id}`;
    const res = await apiCall(url, {
      method: 'PATCH',
      body: JSON.stringify({ is_default: true }),
    });
    if (res.ok) {
      setToast({ message: `"${template.name}" set as default template`, type: 'success' });
      loadTemplates();
    } else {
      setToast({ message: 'Failed to update default', type: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const url = isBroker ? `/api/broker/templates/${deleteTarget.id}` : `/api/admin/templates/${deleteTarget.id}`;
    const res = await apiCall(url, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok || res.status === 204) {
      setToast({ message: `Template "${deleteTarget.name}" deleted`, type: 'success' });
      setDeleteTarget(null);
      loadTemplates();
    } else {
      const err = res.data as { error?: string };
      setToast({ message: err.error ?? 'Failed to delete template', type: 'error' });
      setDeleteTarget(null);
    }
  };

  if (view === 'create') {
    return (
      <TemplateForm
        onBack={() => setView('list')}
        onSaved={() => { setView('list'); loadTemplates(); }}
        isDemoMode={isDemoMode}
        isBroker={isBroker}
      />
    );
  }

  if (view === 'edit' && selectedTemplate) {
    return (
      <TemplateForm
        template={selectedTemplate}
        onBack={() => setView('list')}
        onSaved={() => { setView('list'); loadTemplates(); }}
        isDemoMode={isDemoMode}
        isBroker={isBroker}
      />
    );
  }

  return (
    <div style={{ padding: '16px', maxWidth: 900, margin: '0 auto' }}>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* ── Tab switcher ── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #30363d', paddingBottom: '0.75rem' }}>
        {(['templates', 'scripts'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#2563eb' : 'transparent',
              border: `1px solid ${tab === t ? '#2563eb' : '#30363d'}`,
              borderRadius: '0.375rem',
              color: tab === t ? '#fff' : '#8b949e',
              fontSize: '0.8125rem',
              fontWeight: 600,
              padding: '0.375rem 1rem',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontFamily: 'inherit',
            }}
          >
            {t === 'templates' ? 'Account Templates' : 'Script Management'}
          </button>
        ))}
      </div>

      {/* ── Scripts tab ── */}
      {tab === 'scripts' && <ScriptsPage />}

      {/* ── Templates tab ── */}
      {tab === 'templates' && (<>

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete template "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {applyModalTemplate && (
        <TemplateApplyModal
          template={applyModalTemplate}
          onClose={() => setApplyModalTemplate(null)}
          onApplied={() => {
            setApplyModalTemplate(null);
            setToast({ message: 'Template applied successfully', type: 'success' });
          }}
          isDemoMode={isDemoMode || false}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: '#e6edf3', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
            Account Templates
          </h2>
          <p style={{ color: '#8b949e', fontSize: '12px', margin: '4px 0 0' }}>
            Reusable settings presets you can apply to multiple users at once
          </p>
        </div>
        <button
          className="adm-btn-primary"
          onClick={() => setView('create')}
          style={{ padding: '8px 16px', fontSize: '13px', borderRadius: 6 }}
        >
          + New Template
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#8b949e', padding: 20 }}>Loading templates…</div>
      ) : templates.length === 0 ? (
        <div style={{ color: '#8b949e', padding: 40, textAlign: 'center', border: '1px dashed #30363d', borderRadius: 8 }}>
          No templates yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {templates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => { setSelectedTemplate(t); setView('edit'); }}
              onSetDefault={() => handleSetDefault(t)}
              onApply={() => setApplyModalTemplate(t)}
              onDelete={() => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}
      </>)}
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onSetDefault,
  onApply,
  onDelete,
}: {
  template: AccountTemplate;
  onEdit: () => void;
  onSetDefault: () => void;
  onApply: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{
      background: '#161b22',
      border: `1px solid ${template.is_default ? '#2563eb' : '#30363d'}`,
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        {/* Left: name + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#e6edf3', fontWeight: 700, fontSize: '0.95rem' }}>{template.name}</span>
            {template.is_default && (
              <span style={{
                background: '#1d4ed8', color: '#93c5fd', fontSize: '10px', fontWeight: 700,
                padding: '2px 8px', borderRadius: 20, letterSpacing: '0.5px',
              }}>DEFAULT</span>
            )}
            <span style={{
              background: '#21262d', color: '#8b949e', fontSize: '10px',
              padding: '2px 8px', borderRadius: 20,
            }}>{template.trading_mode.toUpperCase()}</span>
          </div>

          {template.description && (
            <p style={{ color: '#8b949e', fontSize: '12px', margin: '4px 0 0', lineHeight: 1.5 }}>
              {template.description}
            </p>
          )}

          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            <Pill label="Segments" value={(template.segments ?? []).length.toString()} />
            <Pill label="Auto Sq-Off" value={`${template.auto_sqoff}%`} />
            <Pill label="Showcase Sq-Off" value={`${template.showcase_auto_sqoff}%`} />
            <Pill label="Method" value={template.sqoff_method} />
            {template.read_only && <Pill label="Read Only" value="Yes" danger />}
            {template.demo_user && <Pill label="Demo" value="Yes" />}
          </div>
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onApply}
            style={{
              background: '#14b8a6', border: 'none', borderRadius: 6, color: '#fff',
              fontSize: '12px', fontWeight: 600, padding: '6px 14px', cursor: 'pointer',
            }}
          >
            Apply
          </button>
          <button
            onClick={onEdit}
            style={{
              background: '#21262d', border: '1px solid #30363d', borderRadius: 6, color: '#c9d1d9',
              fontSize: '12px', padding: '5px 14px', cursor: 'pointer',
            }}
          >
            Edit
          </button>
          {!template.is_default && (
            <button
              onClick={onSetDefault}
              style={{
                background: 'transparent', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e',
                fontSize: '11px', padding: '5px 14px', cursor: 'pointer',
              }}
            >
              Set Default
            </button>
          )}
          <button
            onClick={onDelete}
            style={{
              background: 'transparent', border: '1px solid #6b2727', borderRadius: 6, color: '#f87171',
              fontSize: '11px', padding: '5px 14px', cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <span style={{ fontSize: '11px', color: danger ? '#f87171' : '#8b949e' }}>
      <span style={{ color: '#6e7681' }}>{label}: </span>
      <span style={{ color: danger ? '#f87171' : '#c9d1d9', fontWeight: 600 }}>{value}</span>
    </span>
  );
}
