import { useCallback, useEffect, useState } from 'react';
import { Mail, Phone, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEnquiries, updateEnquiryStatus, type EnquiryRow } from '@/lib/enquiries.functions';

const STATUSES = ['new', 'contacted', 'closed'] as const;

export function EnquiriesManager() {
  const [rows, setRows] = useState<EnquiryRow[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    setError('');
    getEnquiries().then(setRows).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: (typeof STATUSES)[number]) {
    setBusyId(id);
    try {
      await updateEnquiryStatus({ data: { id, status } });
      setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, status } : r)) ?? prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the enquiry.');
    } finally {
      setBusyId('');
    }
  }

  if (!rows) return error ? <p className="studio-error" role="alert">{error}</p> : <p className="studio-muted">Loading enquiries…</p>;

  return (
    <div className="enquiries-panel">
      <div className="studio-head">
        <p className="eyebrow">LEADS / {rows.length} ENQUIR{rows.length === 1 ? 'Y' : 'IES'}</p>
        <Button variant="textArrow" onClick={load}><RefreshCw size={14} /> Refresh</Button>
      </div>
      {error && <p className="studio-error" role="alert">{error}</p>}
      {rows.length === 0 ? (
        <p className="studio-muted">No enquiries yet. New leads from the homepage and property pages will appear here.</p>
      ) : (
        <div className="enquiry-rows">
          {rows.map((r) => (
            <article key={r.id} className={`enquiry-row enquiry-row--${r.status}`}>
              <header className="enquiry-row-head">
                <div>
                  <h3>{r.name}</h3>
                  <p className="enquiry-meta">
                    {r.interest}{r.property_title ? ` · ${r.property_title}` : ''} · {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {r.preferred_date ? ` · Prefers ${r.preferred_date}` : ''}
                  </p>
                </div>
                <span className={`enquiry-status enquiry-status--${r.status}`}>{r.status}</span>
              </header>
              <p className="enquiry-message">{r.message}</p>
              <div className="enquiry-contacts">
                <a href={`mailto:${r.email}`}><Mail size={14} /> {r.email}</a>
                {r.phone && <a href={`tel:${r.phone}`}><Phone size={14} /> {r.phone}</a>}
                <span className="enquiry-meta">Prefers {r.preferred_contact}</span>
              </div>
              <div className="enquiry-actions">
                {STATUSES.filter((s) => s !== r.status).map((s) => (
                  <button key={s} type="button" disabled={busyId === r.id} onClick={() => setStatus(r.id, s)}>
                    Mark {s}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
