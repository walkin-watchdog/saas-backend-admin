import { useState, useEffect } from 'react';
import { useFilters, usePagination } from '@/hooks/usePlatformStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { creditNotesApi, type CreditNoteFilters } from '@/api/platform/creditNotes';
import type { CreditNote } from '@/types/platform';
import { toast } from '@/hooks/use-toast';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PERMISSIONS } from '@/constants/permissions';
import { Download, FileCheck, XCircle } from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { formatMoney } from '@/utils/formatMoney';

export default function PlatformCreditNotes() {
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const [hasMore, setHasMore] = useState(false);
  const { searchTerm } = useFilters();
  const { platformPermissions, platformUser } = usePlatformAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [selectedNote, setSelectedNote] = useState<CreditNote | null>(null);

  const hasPermission = (perm: string) =>
    platformUser?.roles.includes('super_admin') || platformPermissions.includes(perm);

  useEffect(() => {
    fetchNotes();
  }, [currentPage, pageSize, searchTerm]);

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const blob = await creditNotesApi.exportCsv({ tenantId: searchTerm || undefined });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'credit-notes.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Success', description: 'Credit notes exported successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to export credit notes', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleApply = (note: CreditNote) => {
    setSelectedNote(note);
    setConfirmAction(() => async () => {
      try {
        const updated = await creditNotesApi.apply(note.id);
        toast({ title: 'Success', description: 'Credit note applied successfully' });
        setNotes(prev => prev.map(n => (n.id === updated.id ? updated : n)));
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to apply credit note', variant: 'destructive' });
      }
    });
    setShowConfirmModal(true);
  };

  const handleCancel = (note: CreditNote) => {
    setSelectedNote(note);
    setConfirmAction(() => async () => {
      try {
        const updated = await creditNotesApi.cancel(note.id);
        toast({ title: 'Success', description: 'Credit note cancelled successfully' });
        setNotes(prev => prev.map(n => (n.id === updated.id ? updated : n)));
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to cancel credit note', variant: 'destructive' });
      }
    });
    setShowConfirmModal(true);
  };

  const fetchNotes = async () => {
    try {
      const offset = (currentPage - 1) * pageSize;
      const filters: CreditNoteFilters = { limit: pageSize + 1, offset, tenantId: searchTerm || undefined };
      const res = await creditNotesApi.list(filters);
      setHasMore(res.data.length > pageSize);
      setNotes(res.data.slice(0, pageSize));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch credit notes', variant: 'destructive' });
    }
  };

  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = showingFrom + notes.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Credit Notes</h1>
          <p className="text-muted-foreground">Review issued credit notes</p>
        </div>
        <div className="flex space-x-2">
          {hasPermission(PERMISSIONS.CREDIT_NOTES.READ) && (
            <Button 
              onClick={handleExportCSV}
              variant="outline"
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          )}
          <Button onClick={fetchNotes}>Refresh</Button>
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">ID</th>
                  <th className="text-left py-3 px-4">Tenant</th>
                  <th className="text-left py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Applied</th>
                  <th className="text-left py-3 px-4">Cancelled</th>
                  <th className="text-left py-3 px-4">Created</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {notes.map(note => (
                  <tr key={note.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4 font-mono text-sm">{note.id}</td>
                    <td className="py-3 px-4 font-mono text-sm">{note.tenantId}</td>
                    <td className="py-3 px-4">{formatMoney(Math.round(note.amount * 100), note.currency as 'USD' | 'INR')}</td>
                    <td className="py-3 px-4">{note.status}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{note.appliedAt ? new Date(note.appliedAt).toLocaleDateString() : '-'}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{note.cancelledAt ? new Date(note.cancelledAt).toLocaleDateString() : '-'}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{new Date(note.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end space-x-2">
                        {note.status === 'open' && hasPermission(PERMISSIONS.CREDIT_NOTES.ISSUE) && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleApply(note)}
                            >
                              <FileCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(note)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {notes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-4">No credit notes found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {notes.length > 0 && (
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-muted-foreground">
                Showing {showingFrom} to {showingTo}
              </span>
              <div className="space-x-2">
                <Button variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>Prev</Button>
                <Button variant="outline" disabled={!hasMore} onClick={() => setCurrentPage(currentPage + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          confirmAction();
          setShowConfirmModal(false);
        }}
        title="Confirm Action"
        description={`Are you sure you want to ${selectedNote ? (confirmAction.toString().includes('apply') ? 'apply' : 'cancel') : 'perform this action on'} this credit note?`}
        confirmText="Confirm"
        isLoading={false}
      />
    </div>
  );
}