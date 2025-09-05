import { useState, useEffect } from 'react';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { useFilters } from '@/hooks/usePlatformStore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Trash2,
  UserPlus,
  Mail,
  Search,
  Edit,
  Shield,
  Key,
  Globe,
  CheckCircle,
  XCircle,
  Monitor
} from 'lucide-react';
import { usersApi } from '@/api/platform/users';
import { authApi } from '@/api/platform/auth';
import type { PlatformUserSummary, UserLoginHistory } from '@/types/platform';
import { toast } from '@/hooks/use-toast';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { PERMISSIONS } from '@/constants/permissions';
import { Link } from 'react-router-dom';
import type { PlatformRoleCode } from '@/constants/platformRoles';

export default function PlatformUsers() {
  const { platformUser } = usePlatformAuth();
  const [users, setUsers] = useState<PlatformUserSummary[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<PlatformUserSummary[]>([]);
  const { searchTerm, setSearchTerm } = useFilters();
  const [roleFilter, setRoleFilter] = useState<PlatformRoleCode | ''>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [availableRoles, setAvailableRoles] = useState<PlatformRoleCode[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [selectedUser, setSelectedUser] = useState<PlatformUserSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLoginHistory, setShowLoginHistory] = useState(false);
  const [loginHistory, setLoginHistory] = useState<UserLoginHistory[]>([]);
  const [isRevoking, setIsRevoking] = useState(false);

  const hasPermission = (permission: string) => {
    return (
      platformUser?.roles.includes('super_admin') ||
      (platformUser?.permissions || []).includes(permission)
    );
  };

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    roles: [] as PlatformRoleCode[],
    mfaEnabled: false,
    ssoSubject: '',
    ipAllowlist: [] as string[],
  });

  const [roleError, setRoleError] = useState('');

  const [ipInput, setIpInput] = useState('');

  const currentUserRoles = platformUser?.roles || [];

  useEffect(() => {
    fetchUsers();
    usersApi
      .listRoles()
      .then(setAvailableRoles)
      .catch(() => setAvailableRoles([]));
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchTerm, roleFilter, statusFilter, users]);

  const fetchUsers = async () => {
    try {
      const data = await usersApi.list();
      setUsers(data.data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch users', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeMySessions = async () => {
    try {
      setIsRevoking(true);
      await authApi.revokeMySessions();
      toast({ title: 'Success', description: 'Sessions revoked' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to revoke sessions', variant: 'destructive' });
    } finally {
      setIsRevoking(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.roles.includes(roleFilter));
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(user => user.status === statusFilter);
    }

    setFilteredUsers(filtered);
  };

  const handleInviteUser = () => {
    setSelectedUser(null);
    setFormData({
      email: '',
      name: '',
      roles: [],
      mfaEnabled: false,
      ssoSubject: '',
      ipAllowlist: [],
    });
    setIpInput('');
    setShowInviteModal(true);
  };

  const handleCreateUser = () => {
    setSelectedUser(null);
    setFormData({
      email: '',
      name: '',
      roles: [],
      mfaEnabled: false,
      ssoSubject: '',
      ipAllowlist: [],
    });
    setIpInput('');
    setShowCreateModal(true);
  };

  const handleEditUser = async (user: PlatformUserSummary) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      roles: [...user.roles],
      mfaEnabled: user.mfaEnabled,
      ssoSubject: user.ssoSubject || '',
      ipAllowlist: [],
    });
    setIpInput('');
    setShowEditModal(true);
    try {
      const ips = await usersApi.getIpAllowlist(user.id);
      setFormData(prev => ({ ...prev, ipAllowlist: ips }));
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch IP allowlist',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email) {
      toast({ title: 'Error', description: 'Email is required', variant: 'destructive' });
      return;
    }

    if (formData.roles.length === 0) {
      setRoleError('Please select at least one role');
      toast({ title: 'Error', description: 'At least one role must be selected', variant: 'destructive' });
      return;
    }

    setRoleError('');

    try {
      setIsSubmitting(true);

      if (selectedUser) {
        await usersApi.update(selectedUser.id, {
          name: formData.name,
          mfaEnabled: formData.mfaEnabled,
          ssoSubject: formData.ssoSubject || null,
        });
        await usersApi.updateRoles(selectedUser.id, formData.roles);
        toast({ title: 'Success', description: 'User updated successfully' });
        setShowEditModal(false);
      } else {
        await usersApi.invite({ email: formData.email, roleCodes: formData.roles });
        toast({ title: 'Success', description: 'User invited successfully' });
        setShowInviteModal(false);
      }
      
      fetchUsers();
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: `Failed to ${selectedUser ? 'update' : 'invite'} user`, 
        variant: 'destructive' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.name) {
      toast({ title: 'Error', description: 'Name and email are required', variant: 'destructive' });
      return;
    }

    if (formData.roles.length === 0) {
      setRoleError('Please select at least one role');
      toast({ title: 'Error', description: 'At least one role must be selected', variant: 'destructive' });
      return;
    }

    setRoleError('');

    try {
      setIsSubmitting(true);
      await usersApi.create({
        email: formData.email,
        name: formData.name,
        roleCodes: formData.roles,
        ipAllowlist: formData.ipAllowlist,
        ssoSubject: formData.ssoSubject || undefined,
      });
      toast({ title: 'Success', description: 'User created successfully' });
      setShowCreateModal(false);
      fetchUsers();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create user', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!selectedUser) return;
    
    try {
      setIsProcessing(true);
      const newStatus = selectedUser.status === 'active' ? 'disabled' : 'active';
      await usersApi.update(selectedUser.id, { status: newStatus });

      toast({
        title: 'Success',
        description: `User ${newStatus === 'active' ? 'enabled' : 'disabled'} successfully`,
      });

      setShowStatusModal(false);
      fetchUsers();
    } catch (error) {
      console.error('Failed to update user status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = (user: PlatformUserSummary) => {
    setSelectedUser(user);
    setConfirmAction(() => async () => {
      try {
        setIsProcessing(true);
        await usersApi.delete(user.id);
        toast({ title: 'Success', description: 'User deleted successfully' });
        fetchUsers();
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' });
      } finally {
        setIsProcessing(false);
      }
    });
    setShowConfirmModal(true);
  };

  const toggleUserStatus = async (user: PlatformUserSummary) => {
    setSelectedUser(user);
    setShowStatusModal(true);
  };

  const handleViewLoginHistory = async (user: PlatformUserSummary) => {
    if (!hasPermission(PERMISSIONS.PLATFORM_USERS.READ)) {
      toast({
        title: 'Unauthorized',
        description: 'You do not have permission to view login history',
        variant: 'destructive',
      });
      return;
    }

    if (
      user.id !== platformUser?.id &&
      !hasPermission(PERMISSIONS.PLATFORM_USERS.WRITE)
    ) {
      toast({
        title: 'Unauthorized',
        description: "You do not have permission to view others' login history",
        variant: 'destructive',
      });
      return;
    }

    try {
      const history = await usersApi.getLoginHistory(user.id, {
        id: platformUser?.id || '',
        permissions: platformUser?.permissions || [],
      });
      setLoginHistory(history);
      setSelectedUser(user);
      setShowLoginHistory(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch login history',
        variant: 'destructive',
      });
    }
  };


  const handleResetMfa = async (userId: string) => {
    setConfirmTitle('Reset MFA');
    setConfirmDescription('Are you sure you want to reset MFA for this user? They will need to set it up again.');
    setShowConfirmModal(true);
    setConfirmAction(() => async () => {
      try {
        const res = await usersApi.resetMfa(userId);
        if (res.ok) {
          toast({
            title: 'Success',
            description: 'MFA reset successfully',
          });
          fetchUsers();
        } else {
          toast({
            title: 'Error',
            description: 'Failed to reset MFA',
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to reset MFA',
          variant: 'destructive',
        });
      }
    });
  };

  const handleRequireMfa = async (userId: string) => {
    setConfirmTitle('Require MFA Setup');
    setConfirmDescription('Are you sure you want to require MFA setup for this user? They will be prompted to set it up on next login.');
    setShowConfirmModal(true);
    setConfirmAction(() => async () => {
      try {
        const res = await usersApi.requireMfa(userId);
        if (res.ok) {
          toast({
            title: 'Success',
            description: 'MFA requirement set successfully',
          });
          fetchUsers();
        } else {
          toast({
            title: 'Error',
            description: 'Failed to require MFA',
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to require MFA',
          variant: 'destructive',
        });
      }
    });
  };
  const addRole = (role: PlatformRoleCode) => {
    if (!formData.roles.includes(role)) {
      setFormData(prev => ({
        ...prev,
        roles: [...prev.roles, role]
      }));
      setRoleError('');
    }
  };

  const removeRole = (roleToRemove: PlatformRoleCode) => {
    setFormData(prev => ({
      ...prev,
      roles: prev.roles.filter(role => role !== roleToRemove)
    }));
  };

  const addIpAddress = async () => {
    const ip = ipInput.trim();
    if (!ip || formData.ipAllowlist.includes(ip)) return;

    if (selectedUser) {
      try {
        const ips = await usersApi.addIp(selectedUser.id, ip);
        setFormData(prev => ({ ...prev, ipAllowlist: ips }));
        setIpInput('');
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to add IP address',
          variant: 'destructive',
        });
      }
    } else {
      setFormData(prev => ({ ...prev, ipAllowlist: [...prev.ipAllowlist, ip] }));
      setIpInput('');
    }
  };

  const removeIpAddress = async (addressToRemove: string) => {
    if (selectedUser) {
      try {
        const ips = await usersApi.removeIp(selectedUser.id, addressToRemove);
        setFormData(prev => ({ ...prev, ipAllowlist: ips }));
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to remove IP address',
          variant: 'destructive',
        });
      }
    } else {
      setFormData(prev => ({
        ...prev,
        ipAllowlist: prev.ipAllowlist.filter(address => address !== addressToRemove)
      }));
    }
  };

  const getStatusBadge = (status: string) => {
    return status === 'active' ? (
      <Badge variant="default" className="flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />
        Active
      </Badge>
    ) : (
      <Badge variant="destructive" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        Disabled
      </Badge>
    );
  };

  const getRoleBadges = (roles: PlatformRoleCode[]) => {
    const roleColors = {
      super_admin: 'default',
      billing_admin: 'outline',
      support_agent: 'secondary',
      analyst: 'outline',
      readonly: 'secondary'
    };

    return roles.map(code => (
      <Badge
        key={code}
        variant={roleColors[code as keyof typeof roleColors] as any || 'secondary'}
        size="sm"
      >
        {code.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </Badge>
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Platform Users & Roles</h1>
          <p className="text-muted-foreground">
            Manage platform administrators and their permissions
          </p>
        </div>
        
        <div className="flex gap-2">
          {hasPermission(PERMISSIONS.PERMISSIONS.READ) && (
            <Button
              variant="outline"
              asChild
            >
              <Link to="/platform/permissions">
                <Monitor className="h-4 w-4 mr-2" />
                Permission Matrix
              </Link>
            </Button>
          )}

          {/* Link to MFA settings */}
          <Button
            variant="outline"
            asChild
          >
            <Link to="/platform/mfa-settings">
              <Shield className="h-4 w-4 mr-2" />
              My 2FA Settings
            </Link>
          </Button>

          <Button
            variant="outline"
            onClick={handleRevokeMySessions}
            disabled={isRevoking}
          >
            <Key className="h-4 w-4 mr-2" />
            {isRevoking ? 'Revoking...' : 'Revoke My Sessions'}
          </Button>

          {hasPermission(PERMISSIONS.PLATFORM_USERS.WRITE) && (
            <Button onClick={handleCreateUser}>
              <UserPlus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          )}

          {hasPermission(PERMISSIONS.PLATFORM_USERS.INVITE) && (
            <Button onClick={handleInviteUser}>
              <Mail className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={roleFilter} onValueChange={value => setRoleFilter(value as PlatformRoleCode | '')}>
                <SelectTrigger>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {availableRoles.map(role => (
                    <SelectItem key={role} value={role}>
                      {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-4">
                  <div className="rounded-full bg-muted h-10 w-10"></div>
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8">
                  <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No users found</h3>
                  {hasPermission(PERMISSIONS.PLATFORM_USERS.WRITE) && (
                    <Button onClick={handleCreateUser}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create User
                    </Button>
                  )}
                  {hasPermission(PERMISSIONS.PLATFORM_USERS.INVITE) && (
                    <Button onClick={handleInviteUser}>
                      <Mail className="h-4 w-4 mr-2" />
                      Invite User
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">User</th>
                        <th className="text-left py-3 px-4 font-medium">Roles</th>
                        <th className="text-left py-3 px-4 font-medium">Security</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Last Login</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="flex-shrink-0">
                                <div className="h-8 w-8 bg-muted rounded-full flex items-center justify-center">
                                  <span className="text-sm font-medium">
                                    {user.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{user.name}</p>
                                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {getRoleBadges(user.roles)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-1">
                              {user.roles.includes('super_admin') && (
                                <Shield className="h-4 w-4 text-blue-500" />
                              )}
                              {user.mfaEnabled && (
                                <Key className="h-4 w-4 text-green-500" />
                              )}
                              {user.status === 'active' && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                              {user.ipAllowlist && user.ipAllowlist.length > 0 && (
                                <Globe className="h-4 w-4 text-purple-500" />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(user.status)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">
                              {user.lastLoginAt 
                                ? new Date(user.lastLoginAt).toLocaleDateString()
                                : 'Never'
                              }
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewLoginHistory(user)}
                                disabled={
                                  !hasPermission(PERMISSIONS.PLATFORM_USERS.READ) ||
                                  (user.id !== platformUser?.id &&
                                    !hasPermission(PERMISSIONS.PLATFORM_USERS.WRITE))
                                }
                                title={
                                  !hasPermission(PERMISSIONS.PLATFORM_USERS.READ)
                                    ? 'Requires read permission'
                                    : user.id !== platformUser?.id &&
                                        !hasPermission(
                                          PERMISSIONS.PLATFORM_USERS.WRITE
                                        )
                                      ? 'Requires write permission'
                                      : undefined
                                }
                              >
                                <Monitor className="h-4 w-4" />
                              </Button>
                              
                              {hasPermission(PERMISSIONS.PLATFORM_USERS.WRITE) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditUser(user)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              
                              {hasPermission(PERMISSIONS.PLATFORM_USERS.WRITE) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleUserStatus(user)}
                                >
                                  {user.status === 'active' ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                                </Button>
                              )}
                              
                              {user.mfaEnabled && hasPermission(PERMISSIONS.PLATFORM_USERS.WRITE) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleResetMfa(user.id)}
                                  title="Reset MFA"
                                >
                                  <Key className="h-4 w-4" />
                                </Button>
                              )}

                              {!user.mfaEnabled && hasPermission(PERMISSIONS.PLATFORM_USERS.WRITE) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRequireMfa(user.id)}
                                  title="Require MFA Setup"
                                >
                                  <Key className="h-4 w-4 text-orange-500" />
                                </Button>
                              )}
                              {hasPermission(PERMISSIONS.PLATFORM_USERS.DELETE) && user.id !== platformUser?.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteUser(user)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              )}
                              
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite User Modal */}
      <ModalWrapper
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite New User"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email*</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="space-y-2">
              <Select onValueChange={value => addRole(value as PlatformRoleCode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Add a role" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.filter(role => !formData.roles.includes(role)).map(role => (
                    <SelectItem key={role} value={role}>
                      {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {formData.roles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.roles.map(role => (
                    <Badge key={role} variant="secondary" className="flex items-center gap-1">
                      {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      <button
                        type="button"
                        onClick={() => removeRole(role)}
                        className="ml-1 text-xs hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {roleError && <p className="text-sm text-destructive">{roleError}</p>}
          </div>
          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowInviteModal(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </ModalWrapper>

      {/* Create User Modal */}
      <ModalWrapper
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New User"
        size="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-name">Name*</Label>
            <Input
              id="create-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-email">Email*</Label>
            <Input
              id="create-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="space-y-2">
              <Select onValueChange={value => addRole(value as PlatformRoleCode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Add a role" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.filter(role => !formData.roles.includes(role)).map(role => (
                    <SelectItem key={role} value={role}>
                      {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {formData.roles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.roles.map(role => (
                    <Badge key={role} variant="secondary" className="flex items-center gap-1">
                      {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      <button
                        type="button"
                        onClick={() => removeRole(role)}
                        className="ml-1 text-xs hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {roleError && <p className="text-sm text-destructive">{roleError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-sso">SSO Subject</Label>
            <Input
              id="create-sso"
              value={formData.ssoSubject}
              onChange={(e) => setFormData(prev => ({ ...prev, ssoSubject: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>IP Allowlist</Label>
            <div className="flex space-x-2">
              <Input
                placeholder="Enter IP address"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addIpAddress())}
              />
              <Button type="button" onClick={addIpAddress}>Add</Button>
            </div>

            {formData.ipAllowlist.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.ipAllowlist.map((ip: string, index: number) => (
                  <Badge key={index} variant="outline" className="flex items-center gap-1">
                    {ip}
                    <button
                      type="button"
                      onClick={() => removeIpAddress(ip)}
                      className="ml-1 text-xs hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateModal(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </form>
      </ModalWrapper>

      {/* Edit User Modal */}
      <ModalWrapper
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Edit User: ${selectedUser?.name || ''}`}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Email: {selectedUser?.email}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                id="mfaEnabled"
                type="checkbox"
                checked={formData.mfaEnabled}
                onChange={(e) => setFormData(prev => ({ ...prev, mfaEnabled: e.target.checked }))}
              />
              <Label htmlFor="mfaEnabled" className="!mb-0">MFA Enabled</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ssoSubject">SSO Subject</Label>
              <Input
                id="ssoSubject"
                value={formData.ssoSubject}
                onChange={(e) => setFormData(prev => ({ ...prev, ssoSubject: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="space-y-2">
                <Select onValueChange={value => addRole(value as PlatformRoleCode)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Add a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.filter(role => !formData.roles.includes(role)).map(role => (
                      <SelectItem key={role} value={role}>
                        {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {formData.roles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.roles.map(role => (
                      <Badge key={role} variant="secondary" className="flex items-center gap-1">
                        {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        <button
                          type="button"
                          onClick={() => removeRole(role)}
                          className="ml-1 text-xs hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {roleError && <p className="text-sm text-destructive">{roleError}</p>}
            </div>

            <div className="space-y-2">
              <Label>IP Allowlist</Label>
              <div className="flex space-x-2">
                <Input
                  placeholder="Enter IP address"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addIpAddress())}
                />
                <Button type="button" onClick={addIpAddress}>Add</Button>
              </div>
              
              {formData.ipAllowlist.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.ipAllowlist.map((ip: string, index: number) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-1">
                      {ip}
                      <button
                        type="button"
                        onClick={() => removeIpAddress(ip)}
                        className="ml-1 text-xs hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update User'}
            </Button>
            <Button 
              type="button"
              variant="outline" 
              onClick={() => setShowEditModal(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalWrapper>

      {/* Status Change Modal */}
      <ModalWrapper
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title={`${selectedUser?.status === 'active' ? 'Disable' : 'Enable'} User`}
        size="md"
      >
        <div className="space-y-4">
          <p>
            Are you sure you want to {selectedUser?.status === 'active' ? 'disable' : 'enable'} the user {selectedUser?.name}?
          </p>
          
          <div className="flex gap-2">
            <Button 
              onClick={handleStatusChange}
              variant={selectedUser?.status === 'active' ? 'destructive' : 'default'}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : selectedUser?.status === 'active' ? 'Disable' : 'Enable'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowStatusModal(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </ModalWrapper>

      {/* Role Management Modal */}
      <ModalWrapper
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        title="Manage User Roles"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Available Roles</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableRoles.map(role => (
                  <Badge key={role} variant="outline">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Current User Roles</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {currentUserRoles.map(role => (
                  <Badge key={role} variant="default">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowRoleModal(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </ModalWrapper>

      {/* Login History Modal */}
      <ModalWrapper
        isOpen={showLoginHistory}
        onClose={() => setShowLoginHistory(false)}
        title={`Login History - ${selectedUser?.name || ''}`}
        size="2xl"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Timestamp</th>
                <th className="text-left py-2 px-3">IP Address</th>
                <th className="text-left py-2 px-3">User Agent</th>
                <th className="text-left py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loginHistory.map((entry) => (
                <tr key={entry.id} className="border-b">
                  <td className="py-2 px-3 text-sm">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-sm font-mono">
                    {entry.ipAddress}
                  </td>
                  <td className="py-2 px-3 text-sm max-w-xs truncate">
                    {entry.userAgent}
                  </td>
                  <td className="py-2 px-3">
                    {entry.action === 'platform.auth.login_success' ? (
                      <Badge variant="default" size="sm">Success</Badge>
                    ) : (
                      <Badge variant="destructive" size="sm">Failed</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        title={confirmTitle || "Confirm Action"}
        description={confirmDescription || "Are you sure you want to perform this action?"}
        confirmText="Confirm"
        isLoading={isProcessing}
      />
    </div>
  );
}