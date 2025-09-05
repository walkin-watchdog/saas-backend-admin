import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Proposal, ProposalCustomDetails } from '@/types';
import { ArrowLeft, Send, Check, FileText, Save, Trash2, Loader2, Link2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const defaultCD: ProposalCustomDetails = {
  packageName: '', location: '', duration: '', durationUnit: 'hours',
  selectedTimeSlot: '', itinerary: [],
  pricePerPerson: 0,
  discountType: 'percentage', discountValue: 0
};

export const ProposalEditor = () => {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>('');
  const [adults, setAdults] = useState<string>('');
  const [children, setChildren] = useState<string>('');
  const [personalMessage, setPersonalMessage] = useState<string>('');

  const [currency, setCurrency] = useState('INR');
  const [cd, setCD] = useState<ProposalCustomDetails>(defaultCD);
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<'DRAFT'|'SENT'|'REVISED'|'APPROVED'|'ARCHIVED'>('DRAFT');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState<string>('');
  const [revisions, setRevisions] = useState<any[]>([]);
  const [lhsIdx, setLhsIdx] = useState<number>(0);
  const [rhsIdx, setRhsIdx] = useState<number>(1);
  type RequiredField = 'customerName'|'customerEmail'|'customerPhone'|'adults'|'children';
  const [touched, setTouched] = useState<Record<RequiredField, boolean>>({
    customerName:false, customerEmail:false, customerPhone:false, adults:false, children:false
  });
  const markTouched = (k: RequiredField) => setTouched(s => ({ ...s, [k]: true }));
  const isBlank = (v: string) => !v || v.trim() === '';

  const copyText = async (text: string): Promise<boolean> => {
    try {
      if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return true;
    } catch {}
    try { window.prompt('Copy this link:', text); } catch {}
    return false;
  };

  useEffect(() => {
    if (!isNew) {
      (async () => {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const p: Proposal = await res.json();
          setCustomerName(p.customerName); setCustomerEmail(p.customerEmail); setCustomerPhone(p.customerPhone);
          setStartDate(p.startDate.slice(0,10));
          setEndDate(p.endDate ? p.endDate.slice(0,10) : '');
          setAdults(String(p.adults)); setChildren(String(p.children)); setCurrency(p.currency);
          setCD(p.customDetails); setVersion(p.version); setStatus(p.status);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, token]);

  const openHistory = async () => {
    if (!id) return;
    try {
      const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const r = await fetch(`${API}/proposals/${id}/revisions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error();
      const list = await r.json();
      setRevisions(list);
      setLhsIdx(1 < list.length ? 1 : 0);
      setRhsIdx(0);
      setHistoryOpen(true);
    } catch {
      toast.error('Could not load revision history');
    }
  };

  type CDS = ProposalCustomDetails;
  const safeCD = (x:any):CDS => ({
    packageName:'', location:'', duration:'', durationUnit:'hours',
    selectedTimeSlot:'', itinerary:[], pricePerPerson:0, discountType:'percentage',
    discountValue:0, ...x
  });

  const summarizeDiff = (lhs: any, rhs: any) => {
    const a = safeCD(lhs); const b = safeCD(rhs);
    const changes: { label:string; before?:string; after?:string }[] = [];
    const push = (label:string, before?:string, after?:string) => {
      if (before !== after) changes.push({ label, before, after });
    };
    push('Customer name',    lhs.customerName,    rhs.customerName);
    push('Customer email',   lhs.customerEmail,   rhs.customerEmail);
    push('Customer phone',   lhs.customerPhone,   rhs.customerPhone);
    push('Start date',       lhs.startDate?.slice(0,10),       rhs.startDate?.slice(0,10));
    push('End date',         lhs.endDate?.slice(0,10) || '—',  rhs.endDate?.slice(0,10)  || '—');
    push('Adults',           String(lhs.adults),  String(rhs.adults));
    push('Children',         String(lhs.children),String(rhs.children));
    push('Package name', a.packageName || '—', b.packageName || '—');
    push('Location', a.location || '—', b.location || '—');
    push('Duration', `${a.duration} ${a.durationUnit}`, `${b.duration} ${b.durationUnit}`);
    push('Time slot', a.selectedTimeSlot || '—', b.selectedTimeSlot || '—');
    push('Adult price / person', String(a.pricePerPerson || 0), String(b.pricePerPerson || 0));
    push('Child price / person', a.childPricePerPerson === undefined ? '—' : String(a.childPricePerPerson),
                                 b.childPricePerPerson === undefined ? '—' : String(b.childPricePerPerson));
    push('Discount', a.discountType === 'percentage' ? `${a.discountValue}%` : `${a.discountValue}`,
                   b.discountType === 'percentage' ? `${b.discountValue}%` : `${b.discountValue}`);
    // Itinerary: classify added / removed / edited using a stable key
    const key = (r:any) => `${r.date}|${r.time}|${r.activity}|${r.location}`;
    const A = new Map<string, any>(); a.itinerary.forEach((row:any)=>A.set(key(row), row));
    const B = new Map<string, any>(); b.itinerary.forEach((row:any)=>B.set(key(row), row));
    const added: any[] = []; const removed: any[] = []; const edited: {before:any; after:any}[] = [];
    // Removed / Edited
    for (const [k, v] of A) {
      const w = B.get(k);
      if (!w) removed.push(v);
      else if ((v.remarks||'') !== (w.remarks||'')) edited.push({ before: v, after: w });
    }
    // Added
    for (const [k, v] of B) { if (!A.has(k)) added.push(v); }
    return { changes, itinerary: { added, removed, edited } };
  };

  const isReadOnly = status === 'APPROVED' || status === 'ARCHIVED';
  const inputProps = { disabled: isReadOnly } as const;

  const total = (() => {
    const adultCount = parseInt(adults) || 0;
    const childCount = parseInt(children) || 0;
    const adult = cd.pricePerPerson * adultCount;
    const childUnit = cd.childPricePerPerson ?? cd.pricePerPerson;
    const child = childCount > 0 ? childUnit * childCount : 0;
    const base = adult + child;
    const pct = Math.max(0, Math.min(cd.discountValue ?? 0, 100));
    const raw = cd.discountType === 'percentage' ? base * (1 - pct / 100) : base - (cd.discountValue ?? 0);
    return Math.max(0, raw);
  })();

  // validate required fields; show toast  mark as touched
  const validateRequired = (): boolean => {
    const missing: string[] = [];
    if (isBlank(customerName))  missing.push('Customer Name');
    if (isBlank(customerEmail)) missing.push('Customer Email');
    if (isBlank(customerPhone)) missing.push('Customer Phone');
    if (isBlank(adults))        missing.push('Number of Adults');
    if (isBlank(children))      missing.push('Number of Children');
    if (missing.length) {
      toast.error(`Please fill required fields: ${missing.join(', ')}`);
      setTouched({
        customerName:true, customerEmail:true, customerPhone:true, adults:true, children:true
      });
      return false;
    }
    return true;
  };

  const saveDraft = async () => {
    if (!validateRequired()) return;
    setSaving(true);
    const payload = {
      customerName, customerEmail, customerPhone,
      startDate, endDate: endDate || null, adults: parseInt(adults) || 0, children: parseInt(children) || 0, currency,
      customDetails: cd
    };
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals${isNew ? '' : `/${id}`}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(version ? { 'If-Match': `W/"${version}"` } : {})
      },
      body: JSON.stringify(isNew ? payload : { ...payload, version })
    });
    setSaving(false);
    if (res.ok) {
      const p: Proposal = await res.json();
      toast.success('Saved');
      navigate(`/proposals/${p.id}/edit`, { replace: true });
    } else {
      toast.error('Save failed (maybe version conflict). Refresh and try again.');
    }
  };

  const pushRevision = async () => {
    if (!id) return;
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}/revisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(version ? { 'If-Match': `W/"${version}"` } : {})
      },
      body: JSON.stringify({
        customerName,
        customerEmail,
        customerPhone,
        startDate,
        endDate: endDate || null,
        adults: parseInt(adults) || 0,
        children: parseInt(children) || 0,
        currency,
        customDetails: cd,
        changeNote: revisionNote || undefined,
        version
      })
    });
    if (res.ok) {
      toast.success('Revision saved');
      const p: Proposal = await res.json();
      setVersion(p.version);
      setRevisionNote('');
    } else toast.error('Failed to create revision');
  };

  const previewPdf = async () => {
    if (!id) { toast.error('Save first to preview'); return; }
    try {
      const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const r = await fetch(`${API}/proposals/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error('Failed to load PDF');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error('Preview failed');
    }
  };
  const copyViewLink = async () => {
    if (!id) { toast.error('Save first'); return; }
    try {
      const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const r = await fetch(`${API}/proposals/${id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error();
      const j = await r.json();
      const url = j.publicUrl || j.pdfUrl;
      if (!url) throw new Error();
      const copied = await copyText(url);
      if (copied) {
        toast.success('View link copied');
      } else {
        toast.success('Link ready — couldn’t auto-copy. It’s shown in a prompt.');
      }
    } catch {
      toast.error('Could not get link');
    }
  };
  const sendDraft = async () => {
    if (!id) { toast.error('Save first'); return; }
    setSending(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ personalMessage })
      });
      if (r.ok) {
        toast.success('Sent'); 
        setPersonalMessage('');
      } else {
        toast.error('Send failed');
      }
    } finally {
      setSending(false);
    }
  };
  const approve = async () => {
    if (!id) return;
    const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}/approve`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) { toast.success('Approved'); setStatus('APPROVED'); } else toast.error('Approve failed');
  };
  const changeToDraft = async () => {
    if (!id) return;
    const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}/change-to-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(version ? { 'If-Match': `W/"${version}"` } : {}) }
    });
    if (r.ok) { const p: Proposal = await r.json(); setVersion(p.version); setStatus(p.status); toast.success('Back to Draft'); }
    else toast.error('Failed to change to draft');
  };
  const convert = async () => {
    if (!id) return;
    setConverting(true);
    const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}/convert-to-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'CONFIRMED', paymentStatus: 'PENDING', sendVoucher: true })
    });
    setConverting(false);
    if (r.ok) {
      const j = await r.json();
      toast.success('Booking created');
      navigate(`/bookings/${j.bookingId}/details`);
    }
    else toast.error('Conversion failed');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <button onClick={()=>navigate('/proposals')} className="mr-4 p-2 text-gray-400 hover:text-gray-600"><ArrowLeft className="h-5 w-5"/></button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
          {isNew
            ? 'New Proposal'
            : isReadOnly
              ? 'Proposal'
              : 'Edit Proposal'}
        </h1>
        </div>
      </div>

      <div className={`bg-white rounded-lg border p-6 ${isReadOnly ? 'opacity-75' : ''}`}>
        <h2 className="text-xl font-semibold mb-4">Customer & Trip</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input {...inputProps} className={`px-3 py-2 border rounded ${touched.customerName && isBlank(customerName) ? 'border-red-500' : ''}`} placeholder="Customer Name" value={customerName} onChange={e=>setCustomerName(e.target.value)} onBlur={()=>markTouched('customerName')} />
          <input {...inputProps} className={`px-3 py-2 border rounded ${touched.customerEmail && isBlank(customerEmail) ? 'border-red-500' : ''}`} placeholder="Customer Email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} onBlur={()=>markTouched('customerEmail')} />
          <input {...inputProps} className={`px-3 py-2 border rounded ${touched.customerPhone && isBlank(customerPhone) ? 'border-red-500' : ''}`} placeholder="Customer Phone" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} onBlur={()=>markTouched('customerPhone')} />
          <input {...inputProps} type="date" className="px-3 py-2 border rounded" value={startDate} onChange={e=>setStartDate(e.target.value)} />
          <input {...inputProps} type="date" className="px-3 py-2 border rounded" value={endDate} onChange={e=>setEndDate(e.target.value)} />
          <select {...inputProps as any} className="px-3 py-2 border rounded" value={currency} onChange={e=>setCurrency(e.target.value)}>
            {['INR','USD','EUR','GBP','AUD','CAD','JPY','SGD','AED','CNY'].map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
          <input {...inputProps} type="number" min={1} className={`px-3 py-2 border rounded ${touched.adults && isBlank(adults) ? 'border-red-500' : ''}`} value={adults} onChange={e=>setAdults(e.target.value)} onBlur={()=>markTouched('adults')} placeholder="Adults" />
          <input {...inputProps} type="number" min={0} className={`px-3 py-2 border rounded ${touched.children && isBlank(children) ? 'border-red-500' : ''}`} value={children} onChange={e=>setChildren(e.target.value)} onBlur={()=>markTouched('children')} placeholder="Children" />
        </div>
      </div>

      <div className={`bg-white rounded-lg border p-6 ${isReadOnly ? 'opacity-75' : ''}`}>
        <h2 className="text-xl font-semibold mb-4">Proposal Content</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input {...inputProps} className="px-3 py-2 border rounded" placeholder="Package Name" value={cd.packageName} onChange={e=>setCD({...cd, packageName: e.target.value})}/>
          <input {...inputProps} className="px-3 py-2 border rounded" placeholder="Arrival City" value={cd.location} onChange={e=>setCD({...cd, location: e.target.value})}/>
          <div className="flex space-x-2">
            <input {...inputProps} className="w-2/3 px-3 py-2 border rounded" placeholder="Duration" value={cd.duration} onChange={e=>setCD({...cd, duration: e.target.value})}/>
            <select {...inputProps as any} className="w-1/3 px-3 py-2 border rounded" value={cd.durationUnit} onChange={e=>setCD({...cd, durationUnit: e.target.value as any})}>
              <option value="hours">Hours</option><option value="days">Days</option>
            </select>
          </div>
          <input {...inputProps} className="px-3 py-2 border rounded" placeholder="Time Slot" value={cd.selectedTimeSlot} onChange={e=>setCD({...cd, selectedTimeSlot: e.target.value})}/>
          <div className="flex">
            <span className="px-3 py-2 border rounded-l bg-gray-50">{currency}</span>
            <input {...inputProps} type="number" className="flex-1 px-3 py-2 border rounded-r" placeholder="Adult price / person" value={cd.pricePerPerson} onChange={e=>setCD({...cd, pricePerPerson: parseFloat(e.target.value||'0')})}/>
          </div>
          <div className="flex">
            <span className="px-3 py-2 border rounded-l bg-gray-50">{currency}</span>
            <input
              {...inputProps}
              type="number"
              className="flex-1 px-3 py-2 border rounded-r"
              placeholder="Child price / person"
              value={cd.childPricePerPerson === undefined ? '' : cd.childPricePerPerson}
              onChange={e => {
                const v = e.target.value;
                setCD({ ...cd, childPricePerPerson: v === '' ? undefined : parseFloat(v) });
              }}
            />
          </div>
          <select {...inputProps as any} className="px-3 border rounded" value={cd.discountType} onChange={e=>setCD({...cd, discountType: e.target.value as any})}>
            <option value="percentage">Discount %</option><option value="fixed">Discount Amount</option>
          </select>
          <input {...inputProps} type="number" className="px-3 border rounded" placeholder="Discount" value={cd.discountValue} onChange={e=>setCD({...cd, discountValue: parseFloat(e.target.value||'0')})}/>
          <textarea
            className="w-full px-3 border rounded"
            placeholder="Optional message to include in the email"
            value={personalMessage}
            onChange={e => setPersonalMessage(e.target.value)}
          />
        </div>

        <div className="mt-6">
          <h3 className="font-medium mb-2">Itinerary</h3>
          {(cd.itinerary || []).map((row, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2">
              <input {...inputProps} type="date" className="px-2 py-1 border rounded" value={row.date} onChange={e=>setCD({...cd, itinerary: cd.itinerary.map((r,idx)=> idx===i? {...r, date:e.target.value }: r)})}/>
              <input {...inputProps} className="px-2 py-1 border rounded" placeholder="Time" value={row.time} onChange={e=>setCD({...cd, itinerary: cd.itinerary.map((r,idx)=> idx===i? {...r, time:e.target.value }: r)})}/>
              <input {...inputProps} className="px-2 py-1 border rounded" placeholder="Activity*" value={row.activity} onChange={e=>setCD({...cd, itinerary: cd.itinerary.map((r,idx)=> idx===i? {...r, activity:e.target.value }: r)})}/>
              <input {...inputProps} className="px-2 py-1 border rounded" placeholder="Location" value={row.location} onChange={e=>setCD({...cd, itinerary: cd.itinerary.map((r,idx)=> idx===i? {...r, location:e.target.value }: r)})}/>
              <div className="flex space-x-2">
                <textarea {...inputProps} className="flex-1 px-2 py-1 border rounded" placeholder="Remarks" value={row.remarks||''} onChange={e=>setCD({...cd, itinerary: cd.itinerary.map((r,idx)=> idx===i? {...r, remarks:e.target.value }: r)})}/>
                {!isReadOnly && <Trash2 type="button" onClick={()=>setCD({...cd, itinerary: cd.itinerary.filter((_,idx)=> idx!==i)})} className="text-sm text-red-600" />}
              </div>
            </div>
          ))}
          {!isReadOnly && (
            <button type="button" onClick={()=>setCD({...cd, itinerary:[...cd.itinerary, { date:startDate, time:'', activity:'', location:'', remarks:'' }]})} className="mt-1 px-3 py-1 bg-gray-100 rounded text-sm">+ Add Row</button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Estimated Total</div>
            <div className="text-2xl font-bold text-[var(--brand-primary)]">{currency} {Number.isFinite(total) ? total.toLocaleString() : '—'}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isNew && (
              <button onClick={saveDraft} disabled={saving} className="px-3 py-2 bg-[var(--brand-primary)] text-white rounded flex items-center">
                <Save className="h-4 w-4 mr-1" />{saving? 'Saving...' : 'Save Draft'}
              </button>
            )}
            {!isNew && (
              <>
                <button onClick={previewPdf} className="px-3 py-2 bg-gray-100 rounded flex items-center"><FileText className="h-4 w-4 mr-1"/>Preview PDF</button>
                {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
                  <button
                    onClick={copyViewLink}
                    className="px-3 py-2 bg-gray-100 rounded flex items-center"
                  >
                    <Link2 className="h-4 w-4 mr-1" />Copy view link
                  </button>
                )}
                {!isReadOnly && (
                  <>
                    <button
                      onClick={sendDraft}
                      disabled={sending}
                      className="px-3 py-2 bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded flex items-center"
                    >
                      {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                    
                    <input
                      type="text"
                      inputMode="text"
                      placeholder="Revision remarks (optional)"
                      aria-label="Revision remarks for this revision (optional)"
                      value={revisionNote}
                      onChange={(e)=>setRevisionNote(e.target.value)}
                      className="px-3 py-2 border rounded w-56 max-w-full"
                      disabled={isReadOnly}
                    />
                    <button
                      onClick={pushRevision}
                      className="px-3 py-2 bg-blue-600 text-white rounded flex items-center"
                    >Save Revision</button>
                    <button onClick={approve} className="px-3 py-2 bg-emerald-700 text-white rounded flex items-center"><Check className="h-4 w-4 mr-1"/>Approve</button>
                    <button type="button" onClick={openHistory} className="px-3 py-2 bg-gray-100 rounded">
                      History
                    </button>
                  </>
                )}
                {status === 'APPROVED' && user?.role === 'ADMIN' && (
                  <button onClick={changeToDraft} className="px-3 py-2 bg-amber-600 text-white rounded flex items-center">Change to Draft</button>
                )}
                {status === 'APPROVED' && (
                  <button onClick={convert} className="px-3 py-2 bg-indigo-600 text-white rounded">Convert to Booking</button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {converting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg px-6 py-4 shadow">
            <div className="flex items-center space-x-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Converting to booking…</span>
            </div>
          </div>
        </div>
      )}
      {historyOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div
            className="
              bg-white rounded-lg shadow  
              max-w-5xl w-full mx-4 p-4  
              max-h-[80vh] overflow-auto
            "
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Revision History</h3>
              <button className="text-sm text-gray-600" onClick={()=>setHistoryOpen(false)}>Close</button>
            </div>
            {revisions.length === 0 ? (
              <div className="p-6 text-gray-600">No revisions yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Timeline */}
                <div className="md:col-span-1 border rounded p-2 max-h-[60vh] overflow-auto">
                  <div className="text-xs text-gray-500 mb-2">Select versions to compare</div>
                  <ul className="space-y-2">
                    {revisions.map((r, i) => (
                      <li key={r.id} className={`rounded border p-2 ${i===lhsIdx || i===rhsIdx ? 'border-[var(--brand-primary)]' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">v{r.version}</div>
                            <div className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleString()}</div>
                            <div className="text-xs text-gray-600">{r.createdBy?.name || r.createdBy?.email || '—'}</div>
                            {r.changeNote && <div className="text-xs mt-1">{r.changeNote}</div>}
                          </div>
                          <div className="text-xs space-y-1">
                            <label className="block"><input type="radio" name="lhs" checked={lhsIdx===i} onChange={()=>setLhsIdx(i)} /> Left</label>
                            <label className="block"><input type="radio" name="rhs" checked={rhsIdx===i} onChange={()=>setRhsIdx(i)} /> Right</label>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Diff summary */}
                <div className="md:col-span-2">
                  <div className="mb-2 text-sm text-gray-600">
                    Comparing <span className="font-medium">v{revisions[lhsIdx]?.version}</span> → <span className="font-medium">v{revisions[rhsIdx]?.version}</span>
                  </div>
                  {(() => {
                    const lhs = revisions[lhsIdx]?.snapshot ?? {};
                    const rhs = revisions[rhsIdx]?.snapshot ?? {};
                    const d = summarizeDiff(lhs, rhs);
                    return (
                      <>
                        {/* Chips */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {d.changes.length === 0 ? (
                            <span className="text-sm text-gray-500">No content changes</span>
                          ) : d.changes.map((c, idx) => (
                            <span key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded">{c.label}</span>
                          ))}
                        </div>
                        {/* Key fields table */}
                        <div className="bg-gray-50 rounded border">
                          <table className="w-full text-sm">
                            <thead className="text-left text-gray-500">
                              <tr><th className="p-2 w-1/3">Field</th><th className="p-2">v{revisions[lhsIdx]?.version}</th><th className="p-2">v{revisions[rhsIdx]?.version}</th></tr>
                            </thead>
                            <tbody>
                              {d.changes.map((c, i)=>(
                                <tr key={i} className="border-t">
                                  <td className="p-2 font-medium">{c.label}</td>
                                  <td className="p-2 text-gray-600">{c.before ?? '—'}</td>
                                  <td className="p-2">{c.after ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Itinerary changes */}
                        <div className="mt-4">
                          <h4 className="font-semibold mb-2">Itinerary changes</h4>
                          {(d.itinerary.added.length + d.itinerary.removed.length + d.itinerary.edited.length === 0) ? (
                            <div className="text-sm text-gray-500">No itinerary changes</div>
                          ) : (
                            <div className="space-y-2 text-sm">
                              {d.itinerary.added.length > 0 && (
                                <div>
                                  <div className="font-medium text-green-700 mb-1">➕ Added</div>
                                  <ul className="list-disc ml-5">
                                    {d.itinerary.added.map((r:any, i:number)=>(
                                      <li key={`a${i}`}>{r.date} {r.time} — {r.activity} @ {r.location}{r.remarks ? ` (${r.remarks})` : ''}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {d.itinerary.removed.length > 0 && (
                                <div>
                                  <div className="font-medium text-red-700 mb-1">➖ Removed</div>
                                  <ul className="list-disc ml-5 text-gray-600">
                                    {d.itinerary.removed.map((r:any, i:number)=>(
                                      <li key={`r${i}`}>{r.date} {r.time} — {r.activity} @ {r.location}{r.remarks ? ` (${r.remarks})` : ''}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {d.itinerary.edited.length > 0 && (
                                <div>
                                  <div className="font-medium text-amber-700 mb-1">✎ Edited remarks</div>
                                  <ul className="list-disc ml-5">
                                    {d.itinerary.edited.map((p:any, i:number)=>(
                                      <li key={`e${i}`}>
                                        {p.after.date} {p.after.time} — {p.after.activity} @ {p.after.location}
                                        <div className="text-xs">
                                          <span className="line-through text-gray-500">{p.before.remarks || '—'}</span>
                                          <span className="mx-1">→</span>
                                          <span>{p.after.remarks || '—'}</span>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={()=>{
                              const snap = revisions[lhsIdx]?.snapshot;
                              if (!snap) return;
                              setCustomerName(snap.customerName);
                              setCustomerEmail(snap.customerEmail);
                              setCustomerPhone(snap.customerPhone);
                              setStartDate (snap.startDate.slice(0,10));
                              setEndDate   (snap.endDate   ? snap.endDate.slice(0,10) : '');
                              setAdults    (String(snap.adults));
                              setChildren  (String(snap.children));
                              setCurrency  (snap.currency);
                              setCD       (snap.customDetails);
                              setHistoryOpen(false);
                              toast.success(`Loaded v${revisions[lhsIdx]?.version}. Review and click "Save Revision".`);
                            }}
                            className="px-3 py-2 bg-gray-100 rounded"
                          >
                            Load v{revisions[lhsIdx]?.version} into editor
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};