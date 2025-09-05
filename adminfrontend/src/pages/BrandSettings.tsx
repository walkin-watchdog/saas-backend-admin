import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Palette,
  Save,
  Eye,
  Building,
  Globe,
  MessageSquare,
  Plus,
  X,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useConfigApi } from '@/hooks/useConfigApi';
import { useToast } from '@/components/ui/toaster';
import { useTheme } from '@/hooks/useTheme';
import type { BrandingConfig, TenantDomain, DomainVerificationInfo, BrandingKey } from '@/types/config';

const brandingSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').optional(),
  companyEmail: z.string().email().optional().or(z.literal('')),
  companyPhone: z.string().optional(),
  companyAddress: z.string().optional(),
  whatsappNumber: z.string().optional(),
  facebookUrl: z.string().url().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  xUrl: z.string().url().optional().or(z.literal('')),
  instagramUrl: z.string().url().optional().or(z.literal('')),
  logoUrl: z.string().url().optional().or(z.literal('')),
  footerHtml: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Valid hex color required').optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Valid hex color required').optional(),
  tertiaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Valid hex color required').optional(),
  whiteLabelBranding: z.boolean().optional()
});

export const BrandSettings = () => {
  const { user, token } = useAuth();
  const { saveBranding, getConfigs, testTemplate } = useConfigApi();
  const toast = useToast();
  const { refreshTheme } = useTheme();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brandingData, setBrandingData] = useState<BrandingConfig>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showDomainsModal, setShowDomainsModal] = useState(false);
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [verificationInfo, setVerificationInfo] = useState<DomainVerificationInfo | null>(null);
  const [defaultFields, setDefaultFields] = useState<Set<BrandingKey>>(new Set());
  const [configError, setConfigError] = useState(false);

  const form = useForm<BrandingConfig>({
    resolver: zodResolver(brandingSchema),
    defaultValues: brandingData
  });

  useEffect(() => {
    loadBrandingData();
  }, []);

  useEffect(() => {
    form.reset(brandingData);
  }, [brandingData, form]);

  const loadBrandingData = async () => {
    try {
      setLoading(true);
      const brandingKeys: BrandingKey[] = [
        'companyName',
        'companyEmail',
        'companyPhone',
        'companyAddress',
        'whatsappNumber',
        'facebookUrl',
        'linkedinUrl',
        'xUrl',
        'instagramUrl',
        'logoUrl',
        'footerHtml',
        'primaryColor',
        'secondaryColor',
        'tertiaryColor',
        'whiteLabelBranding'
      ];
      const configs = await getConfigs(brandingKeys);

      const fieldDefaults = new Set<BrandingKey>();
      const branding: BrandingConfig = {};
      for (const key of brandingKeys) {
        const value = configs[key];
        if (value === undefined) {
          fieldDefaults.add(key);
        }
        (branding as any)[key] = value ?? (key === 'whiteLabelBranding' ? false : '');
      }
      if (configs.defaultsUsed) {
        branding.defaultsUsed = true;
      }
      setDefaultFields(fieldDefaults);
      setBrandingData(branding);
      setConfigError(false);
    } catch (error) {
      setConfigError(true);
      toast({ message: 'Failed to load branding configuration', type: 'error' });
      console.error('Branding load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDomains = async () => {
    try {
      setDomainsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/tenant/domains`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDomains(data);
      }
    } catch (error) {
      toast({ message: 'Failed to load domains', type: 'error' });
    } finally {
      setDomainsLoading(false);
    }
  };

  const handleSave = async (data: BrandingConfig) => {
    const changedFields: BrandingConfig = {};
    for (const key of Object.keys(data) as (keyof BrandingConfig)[]) {
      if (data[key] !== brandingData[key]) {
        (changedFields as any)[key] = data[key];
      }
    }

    if (Object.keys(changedFields).length === 0) {
      return;
    }

    try {
      setSaving(true);
      await saveBranding(changedFields);
      await refreshTheme();
      setBrandingData({ ...brandingData, ...changedFields });
      toast({ message: 'Branding configuration saved successfully', type: 'success' });
    } catch (error) {
      toast({ message: 'Failed to save branding configuration', type: 'error' });
      console.error('Branding save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewTemplate = async (templateName: string) => {
    try {
      setPreviewLoading(true);
      const html = await testTemplate(templateName, {
        customerName: 'John Doe',
        bookingCode: 'TEST123',
        productTitle: 'Sample Tour Package',
        paymentAmount: 500
      });
      setPreviewContent(html);
      setShowPreviewModal(true);
    } catch (error) {
      toast({ message: 'Failed to generate template preview', type: 'error' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewInvoiceHeader = () => {
    const values = form.getValues();
    const html = `
      <div style="font-family:sans-serif;padding:20px;border-bottom:1px solid #ddd;text-align:center;">
        ${values.logoUrl ? `<img src="${values.logoUrl}" style="max-height:60px;margin-bottom:10px;" />` : ''}
        ${values.companyName ? `<h1 style="margin:0;color:${values.primaryColor || '#000'};">${values.companyName}</h1>` : ''}
        ${values.companyAddress ? `<p style="margin:4px 0;">${values.companyAddress}</p>` : ''}
        <p style="margin:4px 0;">${[values.companyEmail, values.companyPhone].filter(Boolean).join(' | ')}</p>
      </div>`;
    setPreviewContent(html);
    setShowPreviewModal(true);
  };

  const handleAddDomain = async (domain: string, isAdminHost: boolean = false) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/tenant/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ domain, isAdminHost })
      });
      
      if (response.ok) {
        toast({ message: 'Domain added successfully', type: 'success' });
        loadDomains();
      } else {
        const error = await response.json();
        toast({ message: error.error || 'Failed to add domain', type: 'error' });
      }
    } catch (error) {
      toast({ message: 'Failed to add domain', type: 'error' });
    }
  };

  const handleStartVerification = async (domainId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/tenant/domains/${domainId}/verify/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const info = await response.json();
        setVerificationInfo(info);
        toast({ message: 'Verification started. Add the DNS record and verify.', type: 'info' });
      }
    } catch (error) {
      toast({ message: 'Failed to start verification', type: 'error' });
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/tenant/domains/${domainId}/verify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        toast({ message: 'Domain verified successfully', type: 'success' });
        setVerificationInfo(null);
        loadDomains();
      } else {
        const err = await response.json();
        toast({ message: err.error || 'Verification failed', type: 'error' });
      }
    } catch (error) {
      toast({ message: 'Verification failed', type: 'error' });
    }
  };

  const handleToggleAdminHost = async (domain: TenantDomain) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/tenant/domains/${domain.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isAdminHost: !domain.isAdminHost })
      });
      if (response.ok) {
        toast({ message: 'Domain updated', type: 'success' });
        loadDomains();
      }
    } catch (error) {
      toast({ message: 'Failed to update domain', type: 'error' });
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/tenant/domains/${domainId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        toast({ message: 'Domain removed', type: 'success' });
        loadDomains();
      } else {
        const err = await response.json();
        toast({ message: err.error || 'Failed to remove domain', type: 'error' });
      }
    } catch (error) {
      toast({ message: 'Failed to remove domain', type: 'error' });
    }
  };

  const renderLabel = (field: BrandingKey, label: string) => (
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label}
      {defaultFields.has(field) && (
        <span className="ml-1 text-xs text-blue-600">(default)</span>
      )}
    </label>
  );

  if (!user || (user.role !== 'ADMIN' && user.role !== 'EDITOR')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Palette className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">You need administrator or editor privileges to manage brand settings.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {configError && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded relative">
          <span>Using static defaults due to config fetch error.</span>
          <button
            type="button"
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
            onClick={() => setConfigError(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Brand Settings</h1>
          <p className="text-gray-600 mt-2">Customize your company branding and appearance</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => handlePreviewTemplate('booking-confirmation')}
            disabled={previewLoading}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <Eye className="h-4 w-4 mr-2" />
            {previewLoading ? 'Loading...' : 'Preview Email'}
          </button>
          <button
            onClick={handlePreviewInvoiceHeader}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <FileText className="h-4 w-4 mr-2" />
            Preview Invoice
          </button>
          {user.role === 'ADMIN' && (
            <button
              onClick={() => {
                loadDomains();
                setShowDomainsModal(true);
              }}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <Globe className="h-4 w-4 mr-2" />
              Custom Domains
            </button>
          )}
        </div>
      </div>

      {/* Default Usage Warning */}
      {brandingData.defaultsUsed && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
            <span className="text-sm text-blue-800">
              Some settings are using platform defaults. Customize them below to match your brand.
            </span>
          </div>
        </div>
      )}

      {/* Branding Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-8">
          {/* Company Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Building className="h-5 w-5 mr-2 text-blue-600" />
              Company Information
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                {renderLabel('companyName', 'Company Name')}
                <input
                  {...form.register('companyName')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Your Company Name"
                />
                {form.formState.errors.companyName && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.companyName.message as string}</p>
                )}
              </div>
              
              <div>
                {renderLabel('companyEmail', 'Company Email')}
                <input
                  {...form.register('companyEmail')}
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="contact@yourcompany.com"
                />
                {form.formState.errors.companyEmail && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.companyEmail.message as string}</p>
                )}
              </div>
              
              <div>
                {renderLabel('companyPhone', 'Phone Number')}
                <input
                  {...form.register('companyPhone')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              
              <div>
                {renderLabel('whatsappNumber', 'WhatsApp Number')}
                <input
                  {...form.register('whatsappNumber')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>
            
            <div className="mt-4">
              {renderLabel('companyAddress', 'Address')}
              <textarea
                {...form.register('companyAddress')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
                placeholder="123 Main St, City, State, Country"
              />
            </div>
          </div>

          {/* Social Media */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <MessageSquare className="h-5 w-5 mr-2 text-blue-600" />
              Social Media Links
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                {renderLabel('facebookUrl', 'Facebook URL')}
                <input
                  {...form.register('facebookUrl')}
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="https://facebook.com/yourcompany"
                />
                {form.formState.errors.facebookUrl && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.facebookUrl.message as string}</p>
                )}
              </div>
              
              <div>
                {renderLabel('linkedinUrl', 'LinkedIn URL')}
                <input
                  {...form.register('linkedinUrl')}
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="https://linkedin.com/company/yourcompany"
                />
                {form.formState.errors.linkedinUrl && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.linkedinUrl.message as string}</p>
                )}
              </div>
              
              <div>
                {renderLabel('xUrl', 'X (Twitter) URL')}
                <input
                  {...form.register('xUrl')}
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="https://x.com/yourcompany"
                />
                {form.formState.errors.xUrl && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.xUrl.message as string}</p>
                )}
              </div>
              
              <div>
                {renderLabel('instagramUrl', 'Instagram URL')}
                <input
                  {...form.register('instagramUrl')}
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="https://instagram.com/yourcompany"
                />
                {form.formState.errors.instagramUrl && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.instagramUrl.message as string}</p>
                )}
              </div>
            </div>
          </div>

          {/* Visual Branding */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Palette className="h-5 w-5 mr-2 text-blue-600" />
              Visual Branding
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                {renderLabel('logoUrl', 'Logo URL')}
                <input
                  {...form.register('logoUrl')}
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="https://yoursite.com/logo.png"
                />
                {form.formState.errors.logoUrl && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.logoUrl.message as string}</p>
                )}
                {form.watch('logoUrl') && (
                  <div className="mt-2 p-2 border border-gray-200 rounded-md">
                    <img 
                      src={form.watch('logoUrl')} 
                      alt="Logo preview" 
                      className="h-12 object-contain"
                      onError={() => toast({ message: 'Invalid logo URL', type: 'error' })}
                    />
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <div>
                  {renderLabel('primaryColor', 'Primary Color')}
                  <div className="flex space-x-2">
                    <input
                      {...form.register('primaryColor')}
                      type="color"
                      className="w-16 h-10 border border-gray-300 rounded-md"
                    />
                    <input
                      {...form.register('primaryColor')}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md font-mono"
                      placeholder="#0F62FE"
                    />
                  </div>
                  {form.formState.errors.primaryColor && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.primaryColor.message as string}</p>
                  )}
                </div>
                
                <div>
                  {renderLabel('secondaryColor', 'Secondary Color')}
                  <div className="flex space-x-2">
                    <input
                      {...form.register('secondaryColor')}
                      type="color"
                      className="w-16 h-10 border border-gray-300 rounded-md"
                    />
                    <input
                      {...form.register('secondaryColor')}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md font-mono"
                      placeholder="#111827"
                    />
                  </div>
                  {form.formState.errors.secondaryColor && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.secondaryColor.message as string}</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <label className="flex items-center">
                <input
                  {...form.register('whiteLabelBranding')}
                  type="checkbox"
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  Enable white-label branding (applies theme to login page on custom domains)
                  {defaultFields.has('whiteLabelBranding') && (
                    <span className="ml-1 text-xs text-blue-600">(default)</span>
                  )}
                </span>
              </label>
            </div>
          </div>

          {/* Footer HTML */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Custom Footer HTML</h3>
            <div>
              {renderLabel('footerHtml', 'Footer HTML')}
              <textarea
                {...form.register('footerHtml')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                rows={6}
                placeholder="<div>Custom footer content here...</div>"
              />
              <p className="text-xs text-gray-500 mt-1">
                Custom HTML for email and document footers
              </p>
            </div>
          </div>

          {/* Save Button */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex justify-between items-center">
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => handlePreviewTemplate('booking-confirmation')}
                  disabled={previewLoading}
                  className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {previewLoading ? 'Loading...' : 'Preview Email Template'}
                </button>
              </div>
              
              <button
                type="submit"
                disabled={saving}
                className="bg-[var(--brand-primary)] text-white px-6 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2 inline" />
                {saving ? 'Saving...' : 'Save Brand Settings'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold">Email Template Preview</h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 overflow-auto max-h-[70vh]">
              <iframe
                srcDoc={previewContent}
                className="w-full h-96 border border-gray-200 rounded-md"
                title="Email Preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* Custom Domains Modal */}
      {showDomainsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold">Custom Domains</h3>
              <button
                onClick={() => setShowDomainsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {domainsLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-primary)] mx-auto"></div>
                </div>
              ) : (
                <>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="admin.yourcompany.com"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.target as HTMLInputElement;
                          handleAddDomain(input.value, true);
                          input.value = '';
                        }
                      }}
                    />
                    <button
                      onClick={(e) => {
                        const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                        handleAddDomain(input.value, true);
                        input.value = '';
                      }}
                      className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)]"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {domains.map(domain => (
                      <div key={domain.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div>
                          <div className="font-medium">{domain.domain}</div>
                          <div className="text-sm text-gray-500">
                            {domain.isAdminHost && <span className="text-blue-600">Admin Host • </span>}
                            {domain.verifiedAt ? (
                              <span className="text-green-600">Verified</span>
                            ) : (
                              <span className="text-yellow-600">Pending Verification</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                          <label className="flex items-center space-x-1">
                            <input
                              type="checkbox"
                              checked={domain.isAdminHost}
                              onChange={() => handleToggleAdminHost(domain)}
                            />
                            <span>Admin</span>
                          </label>
                          {!domain.verifiedAt && (
                            <>
                              <button
                                onClick={() => handleStartVerification(domain.id)}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                Start
                              </button>
                              <button
                                onClick={() => handleVerifyDomain(domain.id)}
                                className="text-green-600 hover:text-green-800"
                              >
                                Verify
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteDomain(domain.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {verificationInfo && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-medium text-yellow-800 mb-2">DNS Verification Required</h4>
                      <p className="text-sm text-yellow-700 mb-2">
                        Add this TXT record to verify domain ownership:
                      </p>
                      <div className="bg-white p-3 rounded border font-mono text-sm">
                        <div>Host: <strong>{verificationInfo.dnsRecord.host}</strong></div>
                        <div>Type: <strong>{verificationInfo.dnsRecord.type}</strong></div>
                        <div>Value: <strong>{verificationInfo.dnsRecord.value}</strong></div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};