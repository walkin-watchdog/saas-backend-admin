import { useState, useEffect } from 'react';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Shield, Clock, User, ExternalLink, AlertTriangle, Copy, CheckCircle } from 'lucide-react';
import { impersonationApi } from '@/api/platform/impersonation';
import type { ImpersonationGrant } from '@/types/platform';
import { toast } from '@/hooks/use-toast';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { PERMISSIONS } from '@/constants/permissions';

export default function PlatformImpersonation() {
  const { platformPermissions, platformUser } = usePlatformAuth();
  const [grants, setGrants] = useState<ImpersonationGrant[]>([]);
  const [history, setHistory] = useState<ImpersonationGrant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [filters, setFilters] = useState({
    tenantId: '',
    platformUserId: ''
  });
  const [formData, setFormData] = useState({
    tenantId: '',
    reason: '',
    scope: 'read_only' as 'read_only' | 'billing_support' | 'full_tenant_admin',
    durationMinutes: 60
  });

  const hasPermission = (permission: string) => {
    return (
      platformUser?.roles.includes('super_admin') ||
      platformPermissions.includes(permission)
    );
  };

  useEffect(() => {
    fetchGrants();
    if (showHistory) {
      fetchHistory();
    }
  }, [showHistory]);

  const fetchGrants = async () => {
    try {
      const data = await impersonationApi.listGrants(filters);
      setGrants(data.data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch grants', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (!formData.tenantId) return;
    try {
      const data = await impersonationApi.getHistory(formData.tenantId);
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const handleCreateGrant = async () => {
    if (!formData.tenantId || !formData.reason) {
      toast({ title: 'Error', description: 'Tenant ID and reason are required', variant: 'destructive' });
      return;
    }

    try {
      setIsCreating(true);
      const result = await impersonationApi.createGrant({
        tenantId: formData.tenantId,
        reason: formData.reason,
        scope: formData.scope,
        durationMinutes: formData.durationMinutes
      });
      
      setGeneratedLink(result.loginUrl);
      
      toast({
        title: 'Success',
        description: 'Impersonation grant created successfully',
      });
      
      fetchGrants();
    } catch (error) {
      console.error('Failed to create grant:', error);
      toast({
        title: 'Error',
        description: 'Failed to create impersonation grant',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeGrant = async (grantId: string) => {
    setShowConfirmModal(true);
    setConfirmAction(() => async () => {
      try {
        const res = await impersonationApi.revokeGrant(grantId, 'Revoked by admin');

        toast({
          title: 'Success',
          description: res.message || 'Impersonation grant revoked successfully',
        });

        fetchGrants();
      } catch (error) {
        console.error('Failed to revoke grant:', error);
        toast({
          title: 'Error',
          description: 'Failed to revoke grant',
          variant: 'destructive',
        });
      }
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Success',
        description: 'Link copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      });
    }
  };

  const getScopeBadge = (scope: string) => {
    const scopeConfig = {
      read_only: { variant: 'secondary' as const, text: 'Read Only' },
      billing_support: { variant: 'default' as const, text: 'Billing Support' },
      full_tenant_admin: { variant: 'destructive' as const, text: 'Full Admin' },
    };

    const config = scopeConfig[scope as keyof typeof scopeConfig] || scopeConfig.read_only;

    return (
      <Badge variant={config.variant}>
        {config.text}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Tenant Impersonation</h1>
          <p className="text-muted-foreground">
            Safely impersonate tenants for support and troubleshooting
          </p>
        </div>
        
        {hasPermission(PERMISSIONS.IMPERSONATION.ISSUE) && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Eye className="h-4 w-4 mr-2" />
            Create Grant
          </Button>
        )}
      </div>

      {/* Active Grants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Active Grants
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? 'Hide History' : 'Show History'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-2 mb-4">
            <Input
              placeholder="Tenant ID"
              value={filters.tenantId}
              onChange={(e) => setFilters(prev => ({ ...prev, tenantId: e.target.value }))}
            />
            <Input
              placeholder="Platform User ID"
              value={filters.platformUserId}
              onChange={(e) => setFilters(prev => ({ ...prev, platformUserId: e.target.value }))}
            />
            <Button variant="outline" onClick={fetchGrants}>Apply</Button>
          </div>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-4">
                  <div className="rounded bg-muted h-16 w-full"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {grants.length === 0 ? (
                <div className="text-center py-8">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No active grants</h3>
                  <p className="text-muted-foreground">
                    Create an impersonation grant to access tenant accounts.
                  </p>
                </div>
              ) : (
                grants.map((grant) => (
                  <div key={grant.id} className="border rounded-lg p-4 hover:bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{grant.tenantId}</span>
                          {getScopeBadge(grant.scope)}
                        </div>
                        <p className="text-sm text-muted-foreground">{grant.reason}</p>
                        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>Expires: {new Date(grant.expiresAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        {hasPermission(PERMISSIONS.IMPERSONATION.REVOKE) && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRevokeGrant(grant.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle>Impersonation History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-muted-foreground">No history available</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 text-sm font-medium">Tenant</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">Issued By</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">Reason</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">Created</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((entry) => (
                        <tr key={entry.id} className="border-b text-sm">
                          <td className="py-2 px-3 font-mono">{entry.tenantId}</td>
                          <td className="py-2 px-3">
                            {entry.issuedBy.name || entry.issuedBy.email || entry.issuedBy.id}
                          </td>
                          <td className="py-2 px-3 max-w-xs truncate">{entry.reason}</td>
                          <td className="py-2 px-3">{new Date(entry.createdAt).toLocaleDateString()}</td>
                          <td className="py-2 px-3">
                            {entry.revokedAt ? (
                              <Badge variant="destructive" size="sm">Revoked</Badge>
                            ) : new Date(entry.expiresAt) < new Date() ? (
                              <Badge variant="secondary" size="sm">Expired</Badge>
                            ) : (
                              <Badge variant="default" size="sm">Active</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Grant Modal */}
      <ModalWrapper
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setGeneratedLink(null);
          setFormData({
            tenantId: '',
            reason: '',
            scope: 'read_only',
            durationMinutes: 60
          });
        }}
        title="Create Impersonation Grant"
        size="md"
      >
        <div className="space-y-4">
          {!generatedLink ? (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <strong>Warning:</strong> Impersonation grants provide access to tenant accounts. 
                    Only create grants with proper justification and use the minimum required scope.
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="tenantId">Tenant ID*</Label>
                <Input
                  id="tenantId"
                  placeholder="Enter tenant ID"
                  value={formData.tenantId}
                  onChange={(e) => setFormData(prev => ({ ...prev, tenantId: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="reason">Reason*</Label>
                <Input
                  id="reason"
                  placeholder="Support ticket #12345, billing issue, etc."
                  value={formData.reason}
                  onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="scope">Access Scope*</Label>
                <Select 
                  value={formData.scope} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, scope: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read_only">Read Only</SelectItem>
                    <SelectItem value="billing_support">Billing Support</SelectItem>
                    <SelectItem value="full_tenant_admin">Full Tenant Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Select 
                  value={formData.durationMinutes.toString()} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, durationMinutes: parseInt(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Grant Created Successfully</span>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-green-700">Impersonation URL:</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={generatedLink}
                      readOnly
                      className="text-xs font-mono bg-green-50"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(generatedLink)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-green-700 mt-2">
                  This link expires in {formData.durationMinutes} minutes. Use it responsibly.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setIsModalOpen(false);
                setGeneratedLink(null);
                setFormData({
                  tenantId: '',
                  reason: '',
                  scope: 'read_only',
                  durationMinutes: 60
                });
              }}
            >
              {generatedLink ? 'Close' : 'Cancel'}
            </Button>
            
            {!generatedLink && (
              <Button
                onClick={handleCreateGrant}
                disabled={isCreating || !formData.tenantId || !formData.reason}
              >
                {isCreating ? 'Creating...' : 'Create Grant'}
              </Button>
            )}
            
            {generatedLink && (
              <Button
                onClick={() => window.open(generatedLink, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Link
              </Button>
            )}
          </div>
        </div>
      </ModalWrapper>
      
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          confirmAction();
          setShowConfirmModal(false);
        }}
        title="Revoke Grant"
        description="Are you sure you want to revoke this impersonation grant? It will become invalid immediately."
        confirmText="Revoke"
        confirmVariant="destructive"
      />
    </div>
  );
}