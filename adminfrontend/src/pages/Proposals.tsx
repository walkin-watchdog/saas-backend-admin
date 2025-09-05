import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Proposal, ProposalStatus } from '@/types';
import { Search, Eye, Send, Check, FileText, Plus, Copy, Filter, Link2 } from 'lucide-react';
import { useToast } from '../components/ui/toaster';

export const Proposals = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Proposal[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<''|ProposalStatus>('');
  const [loading, setLoading] = useState(true);

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
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return true;
    } catch {}
    try { window.prompt('Copy this link:', text); } catch {}
    return false;
  };

  const fetchData = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [token, q, status]);

  const copyViewLink = async (id: string) => {
    try {
      const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const r = await fetch(`${API}/proposals/${id}/share`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!r.ok) throw new Error();
      const j = await r.json();
      const url = j.publicUrl || j.pdfUrl;
      if (!url) throw new Error();
      const copied = await copyText(url);
      if (copied) {
        toast({ message: 'View link copied', type: 'success' });
      } else {
        toast({ message: 'Link ready — couldn’t auto-copy. It’s shown in a prompt.', type: 'success' });
      }
    } catch {
      toast({ message: 'Could not get link', type: 'error' });
    }
  };

  const previewPdf = async (id: string) => {
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
    } catch {
      toast({ message: 'Preview failed', type: 'error' });
    }
  };
  const sendDraft = async (id: string) => {
    const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}/send`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) { toast({ message: 'Proposal sent', type: 'success' }); fetchData(); }
    else toast({ message: 'Failed to send', type: 'error' });
  };
  const approve = async (id: string) => {
    const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}/approve`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) { toast({ message: 'Finalised', type: 'success' }); fetchData(); }
    else toast({ message: 'Failed', type: 'error' });
  };
  const cloneProposal = async (id: string) => {
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}/clone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error();
      const p = await r.json();
      toast({ message: 'Cloned to new draft', type: 'success' });
      navigate(`/proposals/${p.id}/edit`);
    } catch {
      toast({ message: 'Clone failed', type: 'error' });
    }
  };

  const resend = async (id: string) => {
    try {
      const personalMessage = window.prompt('Optional message to include in the email (leave blank to skip):') || '';
      const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/proposals/${id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalMessage, changeNote: 'Resent from list' })
      });
      if (r.ok) toast({ message: 'Proposal resent', type: 'success' });
      else toast({ message: 'Failed to resend', type: 'error' });
    } catch {
      toast({ message: 'Failed to resend', type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Itinerary Proposals</h1>
          <p className="text-gray-600 mt-2">Create, review, send and convert proposals</p>
        </div>
        {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
          <Link to="/proposals/new" className="w-10 sm:w-auto flex justify-center items-center px-3 sm:px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-tertiary)]">
            <Plus className="h-5 w-5" /><span className="ml-2 hidden sm:inline">New Proposal</span>
          </Link>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-sm border p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input 
            className="pl-9 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            placeholder="Search..."
            value={q}
            onChange={e=>setQ(e.target.value)} />
        </div>
        <select 
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          value={status}
          onChange={e=>setStatus(e.target.value as any)}>
          <option value="">All Status</option>
          {['DRAFT','SENT','REVISED','APPROVED','ARCHIVED'].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <div className="md:col-span-2 flex text-sm text-gray-500 self-center"><Filter className="h-4 w-4 mr-2" />{items.length} results</div>
      </div>
      <div className="hidden md:block bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trip</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">Loading...</td></tr>
              ) : items.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.customerName}</div>
                    <div className="text-sm text-gray-600">{p.customerEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.customDetails?.packageName || '—'}</div>
                    <div className="text-sm text-gray-600">{new Date(p.startDate).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded bg-gray-100">{p.status}</span></td>
                  <td className="px-4 py-3">v{p.version}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <button onClick={()=>navigate(`/proposals/${p.id}/edit`)} className="p-1 text-gray-500 hover:text-[var(--brand-primary)]" title="Open"><Eye className="h-4 w-4"/></button>
                      <button onClick={()=>previewPdf(p.id)} className="p-1 text-gray-500 hover:text-blue-600" title="Preview PDF"><FileText className="h-4 w-4"/></button>
                      {(p.status==='DRAFT'||p.status==='REVISED') && (
                        <button onClick={()=>sendDraft(p.id)} className="p-1 text-gray-500 hover:text-green-600" title="Send"><Send className="h-4 w-4"/></button>
                      )}
                      {(p.status==='SENT') && (
                        <button onClick={()=>approve(p.id)} className="p-1 text-gray-500 hover:text-green-700" title="Approve"><Check className="h-4 w-4"/></button>
                      )}
                      {(p.status==='SENT') && (
                        <button onClick={()=>resend(p.id)} className="p-1 text-gray-500 hover:text-green-600" title="Resend">
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
                        <button
                          onClick={()=>copyViewLink(p.id)}
                          className="p-1 text-gray-500 hover:text-indigo-600"
                          title="Copy view link"><Link2 className="h-4 w-4"/></button>
                      )}
                      <button onClick={()=>cloneProposal(p.id)} className="p-1 text-gray-500 hover:text-amber-600" title="Clone">
                        <Copy className="h-4 w-4"/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="block md:hidden space-y-4">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : items.map(p => (
          <div key={p.id} className="bg-white rounded-lg shadow p-4">
            {/* top row: customer and status */}
            <div className="flex justify-between mb-2">
              <div>
                <div className="font-medium">{p.customerName}</div>
                <div className="text-sm text-gray-600">{p.customerEmail}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-gray-100">{p.status}</span>
            </div>

            {/* trip info */}
            <div className="mb-2 text-sm text-gray-700">
              <div>{p.customDetails?.packageName || '—'}</div>
              <div className="text-gray-600">{new Date(p.startDate).toLocaleDateString()}</div>
            </div>

            {/* version and actions */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-500">v{p.version}</div>
              <div className="flex space-x-2">
                <button onClick={()=>navigate(`/proposals/${p.id}/edit`)} className="p-1 text-gray-500 hover:text-[var(--brand-primary)]" title="Open">
                  <Eye className="h-5 w-5"/>
                </button>
                <button onClick={()=>previewPdf(p.id)} className="p-1 text-gray-500 hover:text-blue-600" title="Preview PDF">
                  <FileText className="h-5 w-5"/>
                </button>
                {(p.status==='DRAFT'||p.status==='REVISED') && (
                  <button onClick={()=>sendDraft(p.id)} className="p-1 text-gray-500 hover:text-green-600" title="Send">
                    <Send className="h-5 w-5"/>
                  </button>
                )}
                {(p.status==='SENT') && (
                  <button onClick={()=>approve(p.id)} className="p-1 text-gray-500 hover:text-green-700" title="Approve">
                    <Check className="h-5 w-5"/>
                  </button>
                )}
                {(p.status==='SENT') && (
                  <button
                    onClick={()=>resend(p.id)}
                    className="p-1 text-gray-500 hover:text-green-600"
                    title="Resend"><Send className="h-5 w-5"/></button>
                )}
                {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
                  <button
                    onClick={()=>copyViewLink(p.id)}
                    className="p-1 text-gray-500 hover:text-indigo-600"
                    title="Copy view link"><Link2 className="h-5 w-5"/></button>
                )}
                {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
                  <button
                  onClick={()=>cloneProposal(p.id)}
                  className="p-1 text-gray-500 hover:text-amber-600"
                  title="Copy view link"><Copy className="h-5 w-5"/></button>
                )}
              </div>
            </div>
          </div>
        ))}
        {/* empty state when there are no proposals */}
        {(!loading && items.length === 0) && (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No proposals found</h3>
            <p className="text-gray-600">Try adjusting the filters or come back later.</p>
          </div>
        )}
      </div>
    </div>
  );
};