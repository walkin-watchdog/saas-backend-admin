import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilters, usePagination } from '@/hooks/usePlatformStore';
import { CopyButton } from '@/components/ui/copy-button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, FileText, User, Calendar, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { auditLogApi, type AuditLogFilters } from '@/api/platform/auditLog';
import type { AuditLogEntry } from '@/api/platform/auditLog';
import { toast } from '@/hooks/use-toast';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PERMISSIONS } from '@/constants/permissions';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
export default function PlatformAuditLog() {
  const { platformPermissions, platformUser } = usePlatformAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<AuditLogEntry[]>([]);
  const { searchTerm, setSearchTerm } = useFilters();
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const hasPermission = (permission: string) => {
    return (
      platformUser?.roles.includes('super_admin') ||
      platformPermissions.includes(permission)
    );
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchAuditLog();
    }, 300); // Debounce API calls
    
    return () => clearTimeout(timeoutId);
  }, [searchTerm, actionFilter, resourceFilter, userFilter, startDateFilter, endDateFilter, currentPage, pageSize]);

  useEffect(() => {
    filterEntries();
  }, [searchTerm, actionFilter, resourceFilter, userFilter, startDateFilter, endDateFilter, entries]);

  const fetchAuditLog = async () => {
    try {
      const filters: AuditLogFilters = {
        offset: (currentPage - 1) * pageSize,
        limit: pageSize,
        action: actionFilter || undefined,
        resource: resourceFilter || undefined,
        platformUserId: userFilter || undefined,
        ...(startDateFilter && { startDate: new Date(startDateFilter).toISOString() }),
        ...(endDateFilter && { endDate: new Date(endDateFilter).toISOString() })
      };
      const response = await auditLogApi.list(filters);
      setTotal(response.pagination.total ?? 0);
      setHasMore((filters.offset || 0) + pageSize < (response.pagination.total ?? 0));
      setEntries(response.data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch audit log', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filterEntries = () => {
    let filtered = entries;

    if (searchTerm) {
      filtered = filtered.filter(entry =>
        entry.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (entry.platformUserId && entry.platformUserId.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (entry.resourceId && entry.resourceId.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (actionFilter) {
      filtered = filtered.filter(entry => entry.action === actionFilter);
    }

    if (resourceFilter) {
      filtered = filtered.filter(entry => entry.resource === resourceFilter);
    }

    if (userFilter) {
      filtered = filtered.filter(entry => entry.platformUserId === userFilter);
    }

    setFilteredEntries(filtered);
  };

  const handleViewDetails = async (id: string) => {
    setShowDetailModal(true);
    setIsDetailLoading(true);
    try {
      const log = await auditLogApi.getById(id);
      setDetailEntry(log);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch audit log entry', variant: 'destructive' });
      setShowDetailModal(false);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const showingFrom = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingTo = Math.min(showingFrom + filteredEntries.length - 1, total);

  const handleNavigateToEntity = (resourceId?: string, tenantId?: string, resource?: string) => {
    // Navigate to tenant/subscriber details if tenantId is available
    if (tenantId) {
      // Use search params to pre-filter subscribers page
      navigate(`/platform/subscribers?search=${tenantId}`);
      return;
    }
    
    // Navigate based on resource type and resourceId
    if (resourceId && resource) {
      switch (resource.toLowerCase()) {
        case 'user':
        case 'platform_user':
          navigate(`/platform/users?search=${resourceId}`);
          break;
        case 'plan':
        case 'subscription_plan':
          navigate(`/platform/plans?search=${resourceId}`);
          break;
        case 'coupon':
          navigate(`/platform/coupons?search=${resourceId}`);
          break;
        case 'invoice':
          navigate(`/platform/invoices?search=${resourceId}`);
          break;
        case 'order':
        case 'payment':
          navigate(`/platform/orders?search=${resourceId}`);
          break;
        case 'webhook':
          navigate(`/platform/webhooks?search=${resourceId}`);
          break;
        default:
          // For unknown resources, show a toast or fallback behavior
          console.warn(`Navigation not implemented for resource type: ${resource}`);
          break;
      }
    }
  };

  const handleExport = async () => {
    if (!hasPermission(PERMISSIONS.AUDIT.EXPORT)) {
      toast({ title: 'Error', description: 'No permission to export audit logs', variant: 'destructive' });
      return;
    }

    try {
      setIsExporting(true);
      const blob = await auditLogApi.exportCsv({
        action: actionFilter || undefined,
        resource: resourceFilter || undefined,
        platformUserId: userFilter || undefined,
        ...(startDateFilter && { startDate: new Date(startDateFilter).toISOString() }),
        ...(endDateFilter && { endDate: new Date(endDateFilter).toISOString() })
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: 'Success',
        description: 'Audit log exported successfully',
      });
    } catch (error) {
      console.error('Failed to export audit log:', error);
      toast({
        title: 'Error',
        description: 'Failed to export audit log',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getActionBadge = (action: string) => {
    const actionColors = {
      CREATE: 'bg-green-100 text-green-800',
      UPDATE: 'bg-blue-100 text-blue-800',
      DELETE: 'bg-red-100 text-red-800',
      LOGIN: 'bg-purple-100 text-purple-800',
      LOGOUT: 'bg-gray-100 text-gray-800'
    };

    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
        actionColors[action as keyof typeof actionColors] || 'bg-gray-100 text-gray-800'
      }`}>
        {action}
      </span>
    );
  };

  const uniqueActions = Array.from(new Set(entries.map(e => e.action)));
  const uniqueResources = Array.from(new Set(entries.map(e => e.resource)));
  const uniqueUsers = Array.from(new Set(entries.map(e => e.platformUserId).filter(Boolean)));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground">
            Track platform activities and changes
          </p>
        </div>
        
        {hasPermission(PERMISSIONS.AUDIT.EXPORT) && (
          <Button 
            onClick={handleExport} 
            disabled={isExporting}
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Action</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Actions</SelectItem>
                  {uniqueActions.map(action => (
                    <SelectItem key={action} value={action}>{action}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Resource</label>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Resources</SelectItem>
                  {uniqueResources.map(resource => (
                    <SelectItem key={resource} value={resource}>{resource}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">User</label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Users</SelectItem>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
              />
            </div>
          </div>
          
          {/* Additional Date Filter Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                min={startDateFilter}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-4">
                  <div className="rounded bg-muted h-12 w-full"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEntries.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No audit entries found</h3>
                  <p className="text-muted-foreground">
                    No entries match your current filters.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Action</th>
                        <th className="text-left py-3 px-4 font-medium">Resource</th>
                        <th className="text-left py-3 px-4 font-medium">Performed By</th>
                        <th className="text-left py-3 px-4 font-medium">Tenant</th>
                        <th className="text-left py-3 px-4 font-medium">Timestamp</th>
                        <th className="text-left py-3 px-4 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((entry) => (
                        <tr key={entry.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            {getActionBadge(entry.action)}
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <button
                                onClick={() => handleNavigateToEntity(entry.resourceId, entry.tenantId, entry.resource)}
                                className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                title="Navigate to resource details"
                              >
                                {entry.resource}
                              </button>
                              {entry.resourceId && (
                                <div className="flex items-center gap-2 mt-1">
                                  <button
                                    onClick={() => handleNavigateToEntity(entry.resourceId, entry.tenantId, entry.resource)}
                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-mono cursor-pointer"
                                    title="Navigate to resource details"
                                  >
                                    {entry.resourceId}
                                  </button>
                                  <CopyButton text={entry.resourceId} size="sm" />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{entry.platformUserId}</span>
                              {entry.platformUserId && <CopyButton text={entry.platformUserId} />}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {entry.tenantId ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleNavigateToEntity(undefined, entry.tenantId)}
                                  className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                  title="View subscriber details"
                                >
                                  {entry.tenantId}
                                </button>
                                <CopyButton text={entry.tenantId} />
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">
                                {new Date(entry.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewDetails(entry.id)}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          
          {/* Pagination */}
          {(filteredEntries.length > 0 && (currentPage > 1 || hasMore)) && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {showingFrom}&ndash;{showingTo} of {total}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {currentPage}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={!hasMore}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ModalWrapper
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setDetailEntry(null);
        }}
        title="Audit Log Details"
        size="lg"
      >
        {isDetailLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : detailEntry ? (
          <div className="space-y-2 text-sm">
            <div>
              <strong>Action:</strong> {detailEntry.action}
            </div>
            <div>
              <strong>Resource:</strong> {detailEntry.resource}
            </div>
            {detailEntry.resourceId && (
              <div>
                <strong>Resource ID:</strong> {detailEntry.resourceId}
              </div>
            )}
            {detailEntry.platformUserId && (
              <div>
                <strong>Performed By:</strong> {detailEntry.platformUserId}
              </div>
            )}
            {detailEntry.tenantId && (
              <div>
                <strong>Tenant:</strong> {detailEntry.tenantId}
              </div>
            )}
            <div>
              <strong>Timestamp:</strong> {new Date(detailEntry.createdAt).toLocaleString()}
            </div>
            {detailEntry.changes && (
              <div>
                <strong>Changes:</strong>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                  {JSON.stringify(detailEntry.changes, null, 2)}
                </pre>
              </div>
            )}
            {detailEntry.metadata && (
              <div>
                <strong>Metadata:</strong>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                  {JSON.stringify(detailEntry.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : null}
      </ModalWrapper>
    </div>
  );
}