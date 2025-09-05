import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Eye, EyeOff, Settings, Globe, Shield, Mail, Database, Plus, X } from 'lucide-react';
import { configApi } from '@/api/platform/config';
import { tenantsApi } from '@/api/platform/tenants';
import { PlatformApiError } from '@/api/platform/base';
import { ImageRuleEditor } from '@/components/ImageRuleEditor';
import type { ImageResolutionRule } from '@/hooks/useImageRule';
import { invalidateImageRule } from '@/hooks/useImageRule';
import { toast } from '@/hooks/use-toast';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PERMISSIONS } from '@/constants/permissions';

const COMMON_IMAGE_RULE_TYPES = [
  { key: 'logos', label: 'Logo' },
  { key: 'products', label: 'Product' },
  { key: 'destination-card', label: 'Destination Card' },
  { key: 'destination-banner', label: 'Destination Banner' },
];

export default function PlatformSettings() {
  const [configs, setConfigs] = useState<{ key: string; hasValue: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [configValues, setConfigValues] = useState<Record<string, any>>({});
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [showSsoConfig, setShowSsoConfig] = useState(false);
  const [imageDefaults, setImageDefaults] = useState<any>(null);
  const [imageRules, setImageRules] = useState<Record<string, any> | null>(null);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTenant, setSelectedTenant] = useState('default');
  const [editingRule, setEditingRule] = useState<{ type: string; rule: ImageResolutionRule } | null>(null);
  const [ssoConfig] = useState<any>(null);
  const [maintenanceSettings, setMaintenanceSettings] = useState<{ enabled: boolean; message?: string; scheduledStart?: string; scheduledEnd?: string } | null>(null);
  const [signupSettings, setSignupSettings] = useState<{ mode: 'open' | 'invite_only'; allowedDomains: string[]; requireEmailVerification: boolean; trialEnabled: boolean; trialDurationDays: number } | null>(null);
  const [showMaintenanceEditor, setShowMaintenanceEditor] = useState(false);
  const [showSignupEditor, setShowSignupEditor] = useState(false);
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const [isSavingSignup, setIsSavingSignup] = useState(false);
  const [isSavingImageDefaults, setIsSavingImageDefaults] = useState(false);
  const { platformPermissions, platformUser } = usePlatformAuth();
  const hasPermission = (perm: string) =>
    platformUser?.roles.includes('super_admin') || platformPermissions.includes(perm);
  const canWrite = hasPermission(PERMISSIONS.CONFIG.WRITE);
  const canManageTenants = hasPermission(PERMISSIONS.TENANTS.MANAGE);

  useEffect(() => {
    fetchConfigs();
    loadSpecialConfigs();
  }, []);

  useEffect(() => {
    if (canManageTenants) {
      fetchTenants();
    }
  }, [canManageTenants]);

  useEffect(() => {
    if (selectedTenant && canManageTenants) {
      loadImageRules(selectedTenant);
    }
  }, [selectedTenant, canManageTenants]);

  const fetchConfigs = async () => {
    try {
      const configsData = await configApi.list();
      setConfigs(configsData || []);
      
      // Initialize config values - simplified for basic key/value pairs
      const values: Record<string, any> = {};
      (configsData || []).forEach((config) => {
        values[config.key] = ''; // Initialize empty, will be loaded when needed
      });
      setConfigValues(values);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch configurations', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSpecialConfigs = async () => {
    try {
      const [img, signup, maintenance] = await Promise.all([
        configApi.getImageDefaults().catch(() => null),
        configApi.getSignupMode().catch(() => null),
        configApi.getMaintenanceBanner().catch(() => null),
      ]);

      if (img) setImageDefaults(img);
      if (signup) setSignupSettings(signup);
      if (maintenance) {
        setMaintenanceSettings({
          enabled: maintenance.enabled,
          message: maintenance.message,
          scheduledStart: maintenance.scheduledStart
            ? new Date(maintenance.scheduledStart).toISOString().slice(0, 16)
            : undefined,
          scheduledEnd: maintenance.scheduledEnd
            ? new Date(maintenance.scheduledEnd).toISOString().slice(0, 16)
            : undefined,
        });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load special configs', variant: 'destructive' });
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await tenantsApi.list({ limit: 100 });
      setTenants(res.data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load tenants', variant: 'destructive' });
    }
  };

  const loadImageRules = async (tenantId: string) => {
    if (!canManageTenants) return;
    try {
      const rules = await configApi.getImageRules(tenantId);
      setImageRules(rules?.rules || {});
    } catch (error) {
      setImageRules(null);
      const msg =
        error instanceof PlatformApiError && error.status === 403
          ? 'You do not have permission to view image rules for this tenant'
          : 'Failed to load image rules';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const handleConfigUpdate = async (config: { key: string; hasValue: boolean }, newValue: any) => {
    if (!canWrite) return;
    const configKey = config.key;
    setIsSaving(true);
    
    try {
      await configApi.upsert({
        key: config.key,
        value: newValue
      });
      
      toast({
        title: 'Success',
        description: 'Configuration updated successfully',
      });
      
      setConfigValues(prev => ({
        ...prev,
        [configKey]: newValue
      }));
      
      fetchConfigs();
    } catch (error) {
      console.error('Failed to update config:', error);
      toast({
        title: 'Error',
        description: 'Failed to update configuration',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevealSecret = async (config: { key: string; hasValue: boolean }) => {
    const configKey = config.key;
    
    try {
      const result = await configApi.get(config.key);
      if (result.hasValue && result.value === '********') {
        // This is a masked secret, we need to implement reveal functionality
        // For now, show masked value
        alert(`Secret value for ${config.key} is masked. Reveal functionality not implemented.`);
        return;
      }
      
      setConfigValues(prev => ({
        ...prev,
        [configKey]: result.value
      }));
      
      setRevealedSecrets(prev => new Set([...prev, configKey]));
    } catch (error) {
      console.error('Failed to reveal secret:', error);
      toast({
        title: 'Error',
        description: 'Failed to reveal secret',
        variant: 'destructive',
      });
    }
  };

  const getScopeIcon = (scope: string) => {
    const iconMap = {
      'global': Globe,
      'security': Shield,
      'email': Mail,
      'gateway': Database,
      'default': Settings
    };
    
    const IconComponent = iconMap[scope as keyof typeof iconMap] || iconMap.default;
    return <IconComponent className="h-4 w-4" />;
  };

  const getScopeBadge = (scope: string) => {
    const scopeConfig = {
      global: { text: 'Global', variant: 'default' as const },
      security: { text: 'Security', variant: 'destructive' as const },
      email: { text: 'Email', variant: 'secondary' as const },
      gateway: { text: 'Gateway', variant: 'outline' as const },
    };

    const config = scopeConfig[scope as keyof typeof scopeConfig] || { text: scope, variant: 'secondary' as const };

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {getScopeIcon(scope)}
        {config.text}
      </Badge>
    );
  };

  const addImageType = () => {
    const newType = prompt('Enter allowed file type (e.g., image/webp):');
    if (newType && imageDefaults && !imageDefaults.allowedTypes.includes(newType)) {
      setImageDefaults({
        ...imageDefaults,
        allowedTypes: [...imageDefaults.allowedTypes, newType]
      });
    }
  };

  const removeImageType = (index: number) => {
    if (imageDefaults) {
      setImageDefaults({
        ...imageDefaults,
        allowedTypes: imageDefaults.allowedTypes.filter((_: any, i: number) => i !== index)
      });
    }
  };

  const addThumbnailSize = () => {
    const newSize = prompt('Enter thumbnail size (pixels):');
    const size = parseInt(newSize || '');
    if (size && imageDefaults && !imageDefaults.thumbnailSizes.includes(size)) {
      setImageDefaults({
        ...imageDefaults,
        thumbnailSizes: [...imageDefaults.thumbnailSizes, size].sort((a, b) => a - b)
      });
    }
  };

  const removeThumbnailSize = (index: number) => {
    if (imageDefaults) {
      setImageDefaults({
        ...imageDefaults,
        thumbnailSizes: imageDefaults.thumbnailSizes.filter((_: any, i: number) => i !== index)
      });
    }
  };

  const editImageRule = (type: string) => {
    if (!canManageTenants) return;
    const current: ImageResolutionRule = imageRules?.[type] || {
      imageType: type,
      width: 0,
      height: 0,
    };
    setEditingRule({ type, rule: current });
  };

  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [newRuleType, setNewRuleType] = useState('');

  const addImageRule = () => {
    if (!canManageTenants) return;
    setNewRuleType('');
    setShowNewRuleModal(true);
  };

  const saveImageRule = async (type: string, rule: ImageResolutionRule) => {
    if (!canManageTenants) return;
    try {
      const exists = imageRules && Object.prototype.hasOwnProperty.call(imageRules, type);
      const updated = exists
        ? await configApi.updateImageRule(selectedTenant, type, rule)
        : await configApi.createImageRule(selectedTenant, type, rule);
      setImageRules(prev => ({ ...(prev || {}), [type]: updated }));
      invalidateImageRule(selectedTenant, type);
      toast({ title: 'Success', description: exists ? 'Image rule updated' : 'Image rule created' });
    } catch (error) {
      const msg =
        error instanceof PlatformApiError && error.status === 403
          ? 'You do not have permission to update image rules'
          : 'Failed to save image rule';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
    }
  };

  const handleRuleSave = async (rule: ImageResolutionRule) => {
    if (!editingRule || !canManageTenants) return;
    await saveImageRule(editingRule.type, rule);
    setEditingRule(null);
  };

  const addAllowedDomain = () => {
    const domain = prompt('Enter allowed domain:');
    if (domain && signupSettings && !signupSettings.allowedDomains.includes(domain)) {
      setSignupSettings({
        ...signupSettings,
        allowedDomains: [...signupSettings.allowedDomains, domain]
      });
    }
  };

  const removeAllowedDomain = (index: number) => {
    if (signupSettings) {
      setSignupSettings({
        ...signupSettings,
        allowedDomains: signupSettings.allowedDomains.filter((_, i) => i !== index)
      });
    }
  };

  const saveImageDefaults = async () => {
    if (!imageDefaults) return;
    setIsSavingImageDefaults(true);
    try {
      await configApi.updateImageDefaults(imageDefaults);
      toast({ title: 'Success', description: 'Image defaults updated' });
      setShowImageEditor(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update image defaults', variant: 'destructive' });
    } finally {
      setIsSavingImageDefaults(false);
    }
  };

  const saveMaintenance = async () => {
    if (!maintenanceSettings) return;
    setIsSavingMaintenance(true);
    try {
      await configApi.updateMaintenanceBanner({
        enabled: Boolean(maintenanceSettings.enabled),
        message: maintenanceSettings.message,
        scheduledStart: maintenanceSettings.scheduledStart
          ? new Date(maintenanceSettings.scheduledStart).toISOString()
          : undefined,
        scheduledEnd: maintenanceSettings.scheduledEnd
          ? new Date(maintenanceSettings.scheduledEnd).toISOString()
          : undefined,
      });
      toast({ title: 'Success', description: 'Maintenance settings updated' });
      setShowMaintenanceEditor(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update maintenance settings', variant: 'destructive' });
    } finally {
      setIsSavingMaintenance(false);
    }
  };

  const saveSignup = async () => {
    if (!signupSettings) return;
    setIsSavingSignup(true);
    try {
      await configApi.updateSignupMode(signupSettings);
      toast({ title: 'Success', description: 'Signup settings updated' });
      setShowSignupEditor(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update signup settings', variant: 'destructive' });
    } finally {
      setIsSavingSignup(false);
    }
  };
  const groupedConfigs = { 'platform': configs.filter(c => !['maintenance_mode', 'signup_settings', 'image_defaults', 'image_rules'].includes(c.key)) };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Global Settings</h1>
          <p className="text-muted-foreground">
            Manage platform-wide configurations and defaults
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-muted rounded w-1/4"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-10 bg-muted rounded"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {maintenanceSettings && (
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Maintenance Mode</span>
                  {canWrite && (
                    <Button variant="outline" size="sm" onClick={() => setShowMaintenanceEditor(true)}>Edit</Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{maintenanceSettings.enabled ? 'Enabled' : 'Disabled'}</p>
                {maintenanceSettings.message && <p className="text-sm mt-2">{maintenanceSettings.message}</p>}
              </CardContent>
            </Card>
          )}

          {signupSettings && (
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Signup Settings</span>
                  {canWrite && (
                    <Button variant="outline" size="sm" onClick={() => setShowSignupEditor(true)}>Edit</Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Mode: {signupSettings.mode}</p>
              </CardContent>
            </Card>
          )}

          {canManageTenants && imageRules !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Image Rules</span>
                  <div className="flex items-center gap-2">
                    <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">default</SelectItem>
                        {tenants.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name || t.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {canManageTenants && (
                      <Button variant="outline" size="sm" onClick={addImageRule}>Add</Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {COMMON_IMAGE_RULE_TYPES.map(({ key, label }) => {
                    const rule = imageRules[key];
                    return (
                      <div key={key} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                        <div>
                          <div className="font-medium">{label}</div>
                          {rule && (
                            <div className="text-sm text-muted-foreground">{rule.width}×{rule.height}</div>
                          )}
                        </div>
                        {canManageTenants && (
                          <Button variant="ghost" size="sm" onClick={() => editImageRule(key)}>
                            {rule ? 'Edit' : 'Add'}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {Object.entries(imageRules)
                  .filter(([type]) => !COMMON_IMAGE_RULE_TYPES.some((c) => c.key === type))
                  .map(([type, rule]) => (
                    <div key={type} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                      <div>
                        <div className="font-medium">{type}</div>
                        <div className="text-sm text-muted-foreground">{rule.width}×{rule.height}</div>
                      </div>
                      {canManageTenants && (
                        <Button variant="ghost" size="sm" onClick={() => editImageRule(type)}>
                          Edit
                        </Button>
                      )}
                    </div>
                  ))
                }
              </CardContent>
            </Card>
          )}

          {imageDefaults && (
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Image Upload Defaults</span>
                  {canWrite && (
                    <Button variant="outline" size="sm" onClick={() => setShowImageEditor(true)}>Edit</Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Max File Size: {(imageDefaults.maxFileSize / (1024 * 1024)).toFixed(1)} MB</p>
              </CardContent>
            </Card>
          )}

          {Object.entries(groupedConfigs).map(([scope, scopeConfigs]) => (
            <Card key={scope}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {getScopeBadge(scope)}
                  <span className="capitalize">{scope} Configuration</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {scopeConfigs.map((config) => {
                  const configKey = config.key;
                  const isSecret = false; // Simplified - no secret detection for now
                  const isRevealed = revealedSecrets.has(configKey);
                  
                  return (
                    <div key={config.key} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor={configKey} className="text-sm font-medium">
                            {config.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {isSecret && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevealSecret(config)}
                              disabled={isRevealed}
                            >
                              {isRevealed ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <div className="flex-1">
                        {typeof configValues[configKey] === 'boolean' ? (
                          <Select
                            value={configValues[configKey] ? 'true' : 'false'}
                            onValueChange={(value) => {
                              const newValue = value === 'true';
                              setConfigValues(prev => ({ ...prev, [configKey]: newValue }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Enabled</SelectItem>
                              <SelectItem value="false">Disabled</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={configKey}
                            type={isSecret && !isRevealed ? 'password' : 'text'}
                            value={configValues[configKey] || ''}
                            onChange={(e) => setConfigValues(prev => ({ 
                              ...prev, 
                              [configKey]: e.target.value 
                            }))}
                            placeholder={isSecret ? 'Secret value...' : `Enter ${config.key}...`}
                            className="flex-1"
                          />
                        )}
                        </div>
                        
                        <Button
                          size="sm"
                          onClick={() => handleConfigUpdate(config, configValues[configKey])}
                          disabled={isSaving || !canWrite}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
          
          {Object.keys(groupedConfigs).length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No configurations found</h3>
                <p className="text-muted-foreground">
                  Global configurations will appear here when available.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      
      {/* Image Defaults Editor Modal */}
      {canWrite && (
        <ModalWrapper
          isOpen={showImageEditor}
          onClose={() => setShowImageEditor(false)}
          title="Image Upload Defaults"
          size="lg"
        >
          {imageDefaults && (
            <div className="space-y-6">
            <div>
              <Label className="text-sm font-medium mb-3 block">Max File Size (MB)</Label>
              <Input
                type="number"
                step="0.1"
                value={imageDefaults.maxFileSize / (1024 * 1024)}
                onChange={(e) => setImageDefaults({
                  ...imageDefaults,
                  maxFileSize: parseFloat(e.target.value) * 1024 * 1024
                })}
              />
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-3 block">Allowed File Types</Label>
              <div className="space-y-2">
                {imageDefaults.allowedTypes?.map((type: string, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input value={type} readOnly className="flex-1" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeImageType(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addImageType}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Type
                </Button>
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-3 block">Compression Quality (0-100)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={imageDefaults.compressionQuality}
                onChange={(e) => setImageDefaults({
                  ...imageDefaults,
                  compressionQuality: parseInt(e.target.value) || 80
                })}
              />
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-3 block">Thumbnail Sizes</Label>
              <div className="space-y-2">
                {imageDefaults.thumbnailSizes?.map((size: number, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input value={`${size}px`} readOnly className="flex-1" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeThumbnailSize(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addThumbnailSize}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Size
                </Button>
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowImageEditor(false)}>
                Cancel
              </Button>
              <Button onClick={saveImageDefaults} disabled={isSavingImageDefaults || !canWrite}>
                Save
              </Button>
            </div>
          </div>
          )}
        </ModalWrapper>
      )}

      {canManageTenants && (
        <>
          <ModalWrapper
            isOpen={showNewRuleModal}
            onClose={() => setShowNewRuleModal(false)}
            title="Add Image Rule"
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="newRuleType">Image Type Key</Label>
                <Input
                  id="newRuleType"
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNewRuleModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const type = newRuleType.trim();
                    if (type) {
                      setShowNewRuleModal(false);
                      editImageRule(type);
                    }
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          </ModalWrapper>

          {editingRule && (
            <ImageRuleEditor
              isOpen={true}
              imageType={editingRule.type}
              initialRule={editingRule.rule}
              onClose={() => setEditingRule(null)}
              onSave={handleRuleSave}
            />
          )}
        </>
      )}

      {/* Maintenance Mode Editor Modal */}
      {canWrite && (
        <ModalWrapper
          isOpen={showMaintenanceEditor}
          onClose={() => setShowMaintenanceEditor(false)}
          title="Maintenance Mode"
          size="lg"
        >
          {maintenanceSettings && (
            <div className="space-y-6">
            <div>
              <Label className="text-sm font-medium mb-3 block">Enabled</Label>
              <Select
                value={maintenanceSettings.enabled ? 'true' : 'false'}
                onValueChange={(v) =>
                  setMaintenanceSettings({ ...maintenanceSettings, enabled: v === 'true' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Enabled</SelectItem>
                  <SelectItem value="false">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium mb-3 block">Message</Label>
              <Textarea
                value={maintenanceSettings.message || ''}
                onChange={(e) =>
                  setMaintenanceSettings({ ...maintenanceSettings, message: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-3 block">Start</Label>
                <Input
                  type="datetime-local"
                  value={maintenanceSettings.scheduledStart || ''}
                  onChange={(e) =>
                    setMaintenanceSettings({ ...maintenanceSettings, scheduledStart: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-3 block">End</Label>
                <Input
                  type="datetime-local"
                  value={maintenanceSettings.scheduledEnd || ''}
                  onChange={(e) =>
                    setMaintenanceSettings({ ...maintenanceSettings, scheduledEnd: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowMaintenanceEditor(false)}>
                Cancel
              </Button>
              <Button onClick={saveMaintenance} disabled={isSavingMaintenance || !canWrite}>
                Save
              </Button>
            </div>
          </div>
          )}
        </ModalWrapper>
      )}

      {/* Signup Settings Editor Modal */}
      {canWrite && (
        <ModalWrapper
          isOpen={showSignupEditor}
          onClose={() => setShowSignupEditor(false)}
          title="Signup Settings"
          size="lg"
        >
          {signupSettings && (
            <div className="space-y-6">
            <div>
              <Label className="text-sm font-medium mb-3 block">Mode</Label>
              <Select
                value={signupSettings.mode}
                onValueChange={(v) => setSignupSettings({ ...signupSettings, mode: v as 'open' | 'invite_only' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="invite_only">Invite Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium mb-3 block">Allowed Domains</Label>
              <div className="space-y-2">
                {signupSettings.allowedDomains.map((domain, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input value={domain} readOnly className="flex-1" />
                    <Button variant="outline" size="sm" onClick={() => removeAllowedDomain(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addAllowedDomain}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Domain
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-3 block">Email Verification</Label>
                <Select
                  value={signupSettings.requireEmailVerification ? 'true' : 'false'}
                  onValueChange={(v) =>
                    setSignupSettings({ ...signupSettings, requireEmailVerification: v === 'true' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Required</SelectItem>
                    <SelectItem value="false">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-3 block">Trial Enabled</Label>
                <Select
                  value={signupSettings.trialEnabled ? 'true' : 'false'}
                  onValueChange={(v) =>
                    setSignupSettings({ ...signupSettings, trialEnabled: v === 'true' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-3 block">Trial Duration (days)</Label>
              <Input
                type="number"
                value={signupSettings.trialDurationDays}
                onChange={(e) =>
                  setSignupSettings({
                    ...signupSettings,
                    trialDurationDays: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowSignupEditor(false)}>
                Cancel
              </Button>
              <Button onClick={saveSignup} disabled={isSavingSignup || !canWrite}>
                Save
              </Button>
            </div>
          </div>
          )}
        </ModalWrapper>
      )}

      {/* SSO Configuration Viewer Modal */}
      <ModalWrapper
        isOpen={showSsoConfig}
        onClose={() => setShowSsoConfig(false)}
        title="SSO Configuration"
        size="lg"
      >
        {ssoConfig && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Enabled</Label>
                <p className={ssoConfig.enabled ? 'text-green-600' : 'text-red-600'}>
                  {ssoConfig.enabled ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Provider</Label>
                <p className="text-sm text-muted-foreground">{ssoConfig.provider || '-'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Issuer</Label>
                <p className="text-sm text-muted-foreground font-mono">{ssoConfig.issuer || '-'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Client ID</Label>
                <p className="text-sm text-muted-foreground font-mono">{ssoConfig.clientId || '-'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Redirect URI</Label>
                <p className="text-sm text-muted-foreground font-mono">{ssoConfig.redirectUri || '-'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Scopes</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ssoConfig.scopes?.map((scope: string, index: number) => (
                    <Badge key={index} variant="secondary" size="sm">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </ModalWrapper>
    </div>
  );
}