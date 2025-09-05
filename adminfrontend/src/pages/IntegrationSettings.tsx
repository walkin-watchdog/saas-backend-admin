import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Settings,
  Save,
  Eye,
  CheckCircle,
  XCircle,
  TestTube,
  Mail,
  Cloud,
  CreditCard,
  MapPin,
  Users,
  Calculator,
  Newspaper,
  AlertCircle,
  X,
  Shield
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useConfigApi } from '@/hooks/useConfigApi';
import { useToast } from '@/components/ui/toaster';
import type { 
  IntegrationKey,
  SecretMetadata
} from '@/types/config';

// Validation schemas matching backend
const smtpSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1, 'User is required'),
  pass: z.string().min(1, 'Password is required').or(z.literal('')),
  from: z.string().email('Valid from email is required')
});

const cloudinarySchema = z.object({
  cloudName: z.string().min(1, 'Cloud name is required'),
  apiKey: z.string().min(1, 'API key is required').or(z.literal('')),
  apiSecret: z.string().min(1, 'API secret is required').or(z.literal(''))
});

const razorpaySchema = z.object({
  keyId: z.string().min(1, 'Key ID is required'),
  keySecret: z.string().min(1, 'Key secret is required').or(z.literal('')),
  webhookSecret: z.string().min(1, 'Webhook secret is required').or(z.literal(''))
});

const paypalSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required').or(z.literal('')),
  webhookId: z.string().min(1, 'Webhook ID is required'),
  baseUrl: z.string().url('Valid base URL is required'),
  redirectUrl: z.string().url('Valid redirect URL is required')
});

const mapsSchema = z.object({
  provider: z.enum(['google']).optional().default('google'),
  googleApiKey: z.string().min(1, 'Google API key is required').or(z.literal(''))
});

const hubspotSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required').or(z.literal('')),
  defaultOwnerId: z.string().optional(),
  contactSourceProperty: z.string().optional(),
  dealsPipelineId: z.string().optional(),
  dealsPipelineName: z.string().optional()
});

const currencyApiSchema = z.object({
  apiKey: z.string().min(1, 'API key is required').or(z.literal(''))
});

const wordpressSchema = z.object({
  baseUrl: z.string().url('Valid base URL is required'),
  username: z.string().min(1, 'Username is required'),
  appPassword: z.string().min(1, 'App password is required').or(z.literal(''))
});

const taxSchema = z.object({
  percent: z.number().min(0).max(100),
  jurisdiction: z.string().min(1, 'Jurisdiction is required')
});

export const IntegrationSettings = () => {
  const { user } = useAuth();
  const { getConfigs, getConfig, saveConfig } = useConfigApi();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<IntegrationKey>('smtp');
  const [configStates, setConfigStates] = useState<Record<IntegrationKey, any>>({} as any);
  const [secretStates, setSecretStates] = useState<Record<IntegrationKey, SecretMetadata | null>>({} as any);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<IntegrationKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<IntegrationKey | null>(null);
  const [testing, setTesting] = useState<IntegrationKey | null>(null);
  const [configError, setConfigError] = useState(false);

  const integrationSections = [
    { key: 'smtp' as const, label: 'SMTP Email', icon: Mail, schema: smtpSchema },
    { key: 'cloudinary' as const, label: 'Cloudinary', icon: Cloud, schema: cloudinarySchema },
    { key: 'razorpay' as const, label: 'Razorpay', icon: CreditCard, schema: razorpaySchema },
    { key: 'paypal' as const, label: 'PayPal', icon: CreditCard, schema: paypalSchema },
    { key: 'maps' as const, label: 'Google Maps', icon: MapPin, schema: mapsSchema },
    { key: 'hubspot' as const, label: 'HubSpot', icon: Users, schema: hubspotSchema },
    { key: 'currencyApi' as const, label: 'Currency API', icon: Calculator, schema: currencyApiSchema },
    { key: 'wordpress' as const, label: 'WordPress', icon: Newspaper, schema: wordpressSchema },
    { key: 'tax' as const, label: 'Tax Settings', icon: Calculator, schema: taxSchema }
  ];

  // React Hook Form setup for current section
  const currentSection = integrationSections.find(s => s.key === activeSection);
  const form = useForm({
    resolver: zodResolver(currentSection?.schema || z.object({})),
    defaultValues: configStates[activeSection] || {},
    mode: 'onChange'
  });

  useEffect(() => {
    const hashSection = location.hash.replace('#', '') as IntegrationKey;
    if (hashSection && integrationSections.some(s => s.key === hashSection)) {
      setActiveSection(hashSection);
    }
    loadConfigs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const hashSection = location.hash.replace('#', '') as IntegrationKey;
    if (hashSection && hashSection !== activeSection && integrationSections.some(s => s.key === hashSection)) {
      setActiveSection(hashSection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  useEffect(() => {
    // Reset form when section changes
    form.reset(configStates[activeSection] || {});
  }, [activeSection, configStates, form]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      setConfigStates(prev => ({ ...prev, [activeSection]: value }));
    });
    return () => subscription.unsubscribe();
  }, [form, activeSection]);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const keys = integrationSections.map(s => s.key);
      const configs = await getConfigs(keys);
      
      const newConfigStates: Record<IntegrationKey, any> = {} as any;
      const newSecretStates: Record<IntegrationKey, SecretMetadata | null> = {} as any;
      
      for (const section of integrationSections) {
        const configValue = configs[section.key];
        
        if (configValue && typeof configValue === 'object' && 'secretSet' in configValue) {
          newSecretStates[section.key] = configValue as SecretMetadata;
          newConfigStates[section.key] = {};
        } else {
          newConfigStates[section.key] = configValue || {};
          newSecretStates[section.key] = null;
        }
      }
      
      // Handle OAuth providers specially
      setConfigStates(newConfigStates);
      setSecretStates(newSecretStates);
    } catch (error) {
      setConfigError(true);
      toast({ message: 'Failed to load configuration', type: 'error' });
      console.error('Config load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const revealSecret = async (key: IntegrationKey) => {
    try {
      const config = await getConfig(key);
      if ('secret' in config) {
        setConfigStates(prev => ({ ...prev, [key]: config.secret }));
        form.reset(config.secret);
        setRevealedSecrets(prev => new Set([...prev, key]));
      }
    } catch (error) {
      toast({ message: 'Failed to load secret configuration', type: 'error' });
    }
  };

  const handleSave = async (data: any) => {
    if (!currentSection) return;
    
    try {
      setSaving(activeSection);

      let valueToSave = { ...data };

      if (secretStates[activeSection]?.secretSet) {
        const current = configStates[activeSection] || {};
        for (const key of Object.keys(valueToSave)) {
          if (valueToSave[key] === '') {
            const existingValue = current[key];
            if (existingValue !== undefined && existingValue !== '') {
              valueToSave[key] = existingValue;
            } else {
              delete valueToSave[key];
              continue;
            }
          }
          if (!revealedSecrets.has(activeSection) && valueToSave[key] === current[key]) {
            delete valueToSave[key];
          }
        }
      }

      await saveConfig(activeSection, valueToSave);

      toast({ message: `${currentSection.label} configuration saved successfully`, type: 'success' });

      // Update local state
      setConfigStates(prev => ({
        ...prev,
        [activeSection]: { ...(prev[activeSection] || {}), ...valueToSave }
      }));
      setSecretStates(prev => ({ ...prev, [activeSection]: { secretSet: true } }));
    } catch (error) {
      toast({ message: 'Failed to save configuration', type: 'error' });
      console.error('Save error:', error);
    } finally {
      setSaving(null);
    }
  };

  const testIntegration = async (key: IntegrationKey) => {
    setTesting(key);
    try {
      // Simple test calls that will return 412 if config is missing
      const base = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      let response: Response;
      switch (key) {
        case 'currencyApi':
          response = await fetch(`${base}/currency/rates?base=USD&symbols=INR`);
          break;
        case 'maps':
          response = await fetch(`${base}/reviews`);
          break;
        case 'cloudinary':
          response = await fetch(`${base}/uploads`);
          break;
        default:
          toast({ message: 'Test not implemented for this integration', type: 'info' });
          return;
      }
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed with status ${response.status}`);
      }
      toast({ message: `${currentSection?.label} test successful`, type: 'success' });
    } catch (error: any) {
      if (error.message?.includes('PRECONDITION:')) {
        toast({ message: `${currentSection?.label} configuration incomplete`, type: 'error' });
      } else {
        toast({ message: `${currentSection?.label} test failed`, type: 'error' });
      }
    } finally {
      setTesting(null);
    }
  };


  if (user?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">You need administrator privileges to manage integrations.</p>
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

  const isSecretConfigured = (key: IntegrationKey) => {
    return secretStates[key]?.secretSet || false;
  };

  const isRevealed = (key: IntegrationKey) => {
    return revealedSecrets.has(key);
  };

  const canTest = (key: IntegrationKey) => {
    const config = configStates[key];
    if (!config) return false;
    
    switch (key) {
      case 'currencyApi':
        return Boolean(config.apiKey);
      case 'maps':
        return Boolean(config.googleApiKey);
      case 'cloudinary':
        return Boolean(config.cloudName && config.apiKey && config.apiSecret);
      default:
        return false;
    }
  };

  const getTestTooltip = (key: IntegrationKey) => {
    if (canTest(key)) return '';
    const errors = form.formState.errors as Record<string, any>;
    const missing = Object.keys(errors);
    if (missing.length) {
      return `Missing fields: ${missing.join(', ')}`;
    }
    const cfg = configStates[key] || {};
    const required: string[] = [];
    switch (key) {
      case 'currencyApi':
        if (!cfg.apiKey) required.push('apiKey');
        break;
      case 'maps':
        if (!cfg.googleApiKey) required.push('googleApiKey');
        break;
      case 'cloudinary':
        if (!cfg.cloudName) required.push('cloudName');
        if (!cfg.apiKey) required.push('apiKey');
        if (!cfg.apiSecret) required.push('apiSecret');
        break;
    }
    return required.length ? `Missing fields: ${required.join(', ')}` : 'Complete configuration to test';
  };

  const renderConfigForm = () => {
    const isSecret = secretStates[activeSection];
    
    switch (activeSection) {
      case 'smtp':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center">
                  <Mail className="h-5 w-5 mr-2 text-blue-600" />
                  SMTP Email Configuration
                </h3>
                <p className="text-gray-600 text-sm">Configure outgoing email settings</p>
              </div>
              {isSecret && (
                <div className="flex items-center space-x-2">
                  {isSecretConfigured('smtp') && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {!isRevealed('smtp') && isSecretConfigured('smtp') && (
                    <button
                      onClick={() => revealSecret('smtp')}
                      className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                    >
                      <Eye className="h-4 w-4 mr-1 inline" />
                      Reveal
                    </button>
                  )}
                </div>
              )}
            </div>
            
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Host</label>
                  <input
                    {...form.register('host')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="smtp.gmail.com"
                  />
                  {form.formState.errors.host && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.host.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Port</label>
                  <input
                    {...form.register('port', { valueAsNumber: true })}
                    type="number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="587"
                  />
                  {form.formState.errors.port && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.port.message as string}</p>
                  )}
                </div>
              </div>
              
              <div>
                <label className="flex items-center">
                  <input
                    {...form.register('secure')}
                    type="checkbox"
                    className="mr-2"
                  />
                  Use secure connection (TLS)
                </label>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                <input
                  {...form.register('user')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="your-email@gmail.com"
                />
                {form.formState.errors.user && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.user.message as string}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <input
                    {...form.register('pass')}
                    type={isRevealed('smtp') ? 'text' : 'password'}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md"
                    placeholder="App password or SMTP password"
                  />
                  {form.formState.errors.pass && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.pass.message as string}</p>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">From Email</label>
                <input
                  {...form.register('from')}
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="noreply@yourcompany.com"
                />
                {form.formState.errors.from && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.from.message as string}</p>
                )}
              </div>
              
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={saving === 'smtp'}
                  className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-2 inline" />
                  {saving === 'smtp' ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        );

      case 'cloudinary':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center">
                  <Cloud className="h-5 w-5 mr-2 text-blue-600" />
                  Cloudinary Configuration
                </h3>
                <p className="text-gray-600 text-sm">Configure image upload and management</p>
              </div>
              {isSecret && (
                <div className="flex items-center space-x-2">
                  {isSecretConfigured('cloudinary') && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {!isRevealed('cloudinary') && isSecretConfigured('cloudinary') && (
                    <button
                      onClick={() => revealSecret('cloudinary')}
                      className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                    >
                      <Eye className="h-4 w-4 mr-1 inline" />
                      Reveal
                    </button>
                  )}
                </div>
              )}
            </div>
            
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cloud Name</label>
                <input
                  {...form.register('cloudName')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="your-cloud-name"
                />
                {form.formState.errors.cloudName && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.cloudName.message as string}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                <input
                  {...form.register('apiKey')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="123456789012345"
                />
                {form.formState.errors.apiKey && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.apiKey.message as string}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">API Secret</label>
                <input
                  {...form.register('apiSecret')}
                  type={isRevealed('cloudinary') ? 'text' : 'password'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Your API secret"
                />
                {form.formState.errors.apiSecret && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.apiSecret.message as string}</p>
                )}
              </div>
              
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={saving === 'cloudinary'}
                  className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-2 inline" />
                  {saving === 'cloudinary' ? 'Saving...' : 'Save Configuration'}
                </button>
                
                <button
                  type="button"
                  onClick={() => testIntegration('cloudinary')}
                  disabled={testing === 'cloudinary' || !canTest('cloudinary')}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  title={getTestTooltip('cloudinary')}
                >
                  <TestTube className="h-4 w-4 mr-2 inline" />
                  {testing === 'cloudinary' ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </form>
          </div>
        );

      case 'razorpay':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center">
                  <CreditCard className="h-5 w-5 mr-2 text-purple-600" />
                  Razorpay Configuration
                </h3>
                <p className="text-gray-600 text-sm">Configure Razorpay payment gateway</p>
              </div>
              {isSecret && (
                <div className="flex items-center space-x-2">
                  {isSecretConfigured('razorpay') && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {!isRevealed('razorpay') && isSecretConfigured('razorpay') && (
                    <button
                      onClick={() => revealSecret('razorpay')}
                      className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                    >
                      <Eye className="h-4 w-4 mr-1 inline" />
                      Reveal
                    </button>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Key ID</label>
                  <input
                    {...form.register('keyId')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.keyId && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.keyId.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Key Secret</label>
                  <input
                    {...form.register('keySecret')}
                    type={isRevealed('razorpay') ? 'text' : 'password'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.keySecret && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.keySecret.message as string}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Webhook Secret</label>
                  <input
                    {...form.register('webhookSecret')}
                    type={isRevealed('razorpay') ? 'text' : 'password'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.webhookSecret && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.webhookSecret.message as string}</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving === 'razorpay'}
                className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2 inline" />
                {saving === 'razorpay' ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          </div>
        );

      case 'paypal':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center">
                  <CreditCard className="h-5 w-5 mr-2 text-blue-600" />
                  PayPal Configuration
                </h3>
                <p className="text-gray-600 text-sm">Configure PayPal payment gateway</p>
              </div>
              {isSecret && (
                <div className="flex items-center space-x-2">
                  {isSecretConfigured('paypal') && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {!isRevealed('paypal') && isSecretConfigured('paypal') && (
                    <button
                      onClick={() => revealSecret('paypal')}
                      className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                    >
                      <Eye className="h-4 w-4 mr-1 inline" />
                      Reveal
                    </button>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Client ID</label>
                  <input
                    {...form.register('clientId')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.clientId && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.clientId.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Client Secret</label>
                  <input
                    {...form.register('clientSecret')}
                    type={isRevealed('paypal') ? 'text' : 'password'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.clientSecret && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.clientSecret.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Webhook ID</label>
                  <input
                    {...form.register('webhookId')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.webhookId && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.webhookId.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Base URL</label>
                  <input
                    {...form.register('baseUrl')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.baseUrl && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.baseUrl.message as string}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Redirect URL</label>
                  <input
                    {...form.register('redirectUrl')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.redirectUrl && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.redirectUrl.message as string}</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving === 'paypal'}
                className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2 inline" />
                {saving === 'paypal' ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          </div>
        );

      case 'maps':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center">
                  <MapPin className="h-5 w-5 mr-2 text-red-600" />
                  Google Maps Configuration
                </h3>
                <p className="text-gray-600 text-sm">Configure map services</p>
              </div>
              {isSecret && (
                <div className="flex items-center space-x-2">
                  {isSecretConfigured('maps') && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {!isRevealed('maps') && isSecretConfigured('maps') && (
                    <button
                      onClick={() => revealSecret('maps')}
                      className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                    >
                      <Eye className="h-4 w-4 mr-1 inline" />
                      Reveal
                    </button>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
                  <select
                    {...form.register('provider')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="google">Google Maps</option>
                  </select>
                  {form.formState.errors.provider && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.provider.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Google API Key</label>
                  <input
                    {...form.register('googleApiKey')}
                    type={isRevealed('maps') ? 'text' : 'password'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.googleApiKey && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.googleApiKey.message as string}</p>
                  )}
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={saving === 'maps'}
                  className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-2 inline" />
                  {saving === 'maps' ? 'Saving...' : 'Save Configuration'}
                </button>

                <button
                  type="button"
                  onClick={() => testIntegration('maps')}
                  disabled={testing === 'maps' || !canTest('maps')}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  title={getTestTooltip('maps')}
                >
                  <TestTube className="h-4 w-4 mr-2 inline" />
                  {testing === 'maps' ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </form>
          </div>
        );

      case 'hubspot':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center">
                  <Users className="h-5 w-5 mr-2 text-orange-600" />
                  HubSpot Configuration
                </h3>
                <p className="text-gray-600 text-sm">Configure HubSpot integration</p>
              </div>
              {isSecret && (
                <div className="flex items-center space-x-2">
                  {isSecretConfigured('hubspot') && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {!isRevealed('hubspot') && isSecretConfigured('hubspot') && (
                    <button
                      onClick={() => revealSecret('hubspot')}
                      className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                    >
                      <Eye className="h-4 w-4 mr-1 inline" />
                      Reveal
                    </button>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Access Token</label>
                  <input
                    {...form.register('accessToken')}
                    type={isRevealed('hubspot') ? 'text' : 'password'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.accessToken && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.accessToken.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Default Owner ID (optional)</label>
                  <input
                    {...form.register('defaultOwnerId')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.defaultOwnerId && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.defaultOwnerId.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Source Property (optional)</label>
                  <input
                    {...form.register('contactSourceProperty')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.contactSourceProperty && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.contactSourceProperty.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Deals Pipeline ID (optional)</label>
                  <input
                    {...form.register('dealsPipelineId')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.dealsPipelineId && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.dealsPipelineId.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Deals Pipeline Name (optional)</label>
                  <input
                    {...form.register('dealsPipelineName')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.dealsPipelineName && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.dealsPipelineName.message as string}</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving === 'hubspot'}
                className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2 inline" />
                {saving === 'hubspot' ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          </div>
        );

      case 'currencyApi':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center">
                  <Calculator className="h-5 w-5 mr-2 text-green-600" />
                  Currency API Configuration
                </h3>
                <p className="text-gray-600 text-sm">Configure currency conversion service</p>
              </div>
              {isSecret && (
                <div className="flex items-center space-x-2">
                  {isSecretConfigured('currencyApi') && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {!isRevealed('currencyApi') && isSecretConfigured('currencyApi') && (
                    <button
                      onClick={() => revealSecret('currencyApi')}
                      className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                    >
                      <Eye className="h-4 w-4 mr-1 inline" />
                      Reveal
                    </button>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                <input
                  {...form.register('apiKey')}
                  type={isRevealed('currencyApi') ? 'text' : 'password'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                {form.formState.errors.apiKey && (
                  <p className="text-red-600 text-sm mt-1">{form.formState.errors.apiKey.message as string}</p>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={saving === 'currencyApi'}
                  className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-2 inline" />
                  {saving === 'currencyApi' ? 'Saving...' : 'Save Configuration'}
                </button>

                <button
                  type="button"
                  onClick={() => testIntegration('currencyApi')}
                  disabled={testing === 'currencyApi' || !canTest('currencyApi')}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  title={getTestTooltip('currencyApi')}
                >
                  <TestTube className="h-4 w-4 mr-2 inline" />
                  {testing === 'currencyApi' ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </form>
          </div>
        );

      case 'wordpress':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center">
                  <Newspaper className="h-5 w-5 mr-2 text-gray-600" />
                  WordPress Configuration
                </h3>
                <p className="text-gray-600 text-sm">Configure WordPress integration</p>
              </div>
              {isSecret && (
                <div className="flex items-center space-x-2">
                  {isSecretConfigured('wordpress') && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {!isRevealed('wordpress') && isSecretConfigured('wordpress') && (
                    <button
                      onClick={() => revealSecret('wordpress')}
                      className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                    >
                      <Eye className="h-4 w-4 mr-1 inline" />
                      Reveal
                    </button>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Base URL</label>
                  <input
                    {...form.register('baseUrl')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.baseUrl && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.baseUrl.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                  <input
                    {...form.register('username')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.username && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.username.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">App Password</label>
                  <input
                    {...form.register('appPassword')}
                    type={isRevealed('wordpress') ? 'text' : 'password'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {form.formState.errors.appPassword && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.appPassword.message as string}</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving === 'wordpress'}
                className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2 inline" />
                {saving === 'wordpress' ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          </div>
        );

      case 'tax':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center">
                  <Calculator className="h-5 w-5 mr-2 text-green-600" />
                  Tax Configuration
                </h3>
                <p className="text-gray-600 text-sm">Configure tax calculation settings</p>
              </div>
            </div>
            
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tax Percentage</label>
                  <input
                    {...form.register('percent', { valueAsNumber: true })}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="18.00"
                  />
                  {form.formState.errors.percent && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.percent.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Jurisdiction</label>
                  <input
                    {...form.register('jurisdiction')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="IN, US-CA, GB, etc."
                  />
                  {form.formState.errors.jurisdiction && (
                    <p className="text-red-600 text-sm mt-1">{form.formState.errors.jurisdiction.message as string}</p>
                  )}
                </div>
              </div>
              
              <button
                type="submit"
                disabled={saving === 'tax'}
                className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2 inline" />
                {saving === 'tax' ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          </div>
        );

      default:
        return (
          <div className="text-center py-12">
            <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {currentSection?.label} Configuration
            </h3>
            <p className="text-gray-600">
              Configuration form for {currentSection?.label} will be displayed here.
            </p>
            {isSecret && (
              <div className="mt-4">
                {isSecretConfigured(activeSection) ? (
                  <div className="flex items-center justify-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-sm text-green-700">Configuration saved</span>
                    {!isRevealed(activeSection) && (
                      <button
                        onClick={() => revealSecret(activeSection)}
                        className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200 ml-2"
                      >
                        <Eye className="h-4 w-4 mr-1 inline" />
                        Reveal
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <span className="text-sm text-yellow-700">Not configured</span>
                  </div>
                )}
              </div>
            )}
            {['currencyApi', 'maps', 'cloudinary'].includes(activeSection) && (
              <button
                onClick={() => testIntegration(activeSection)}
                disabled={testing === activeSection || !canTest(activeSection)}
                className="mt-4 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                title={getTestTooltip(activeSection)}
              >
                <TestTube className="h-4 w-4 mr-2 inline" />
                {testing === activeSection ? 'Testing...' : 'Test Integration'}
              </button>
            )}
          </div>
        );
    }
  };

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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Integration Settings</h1>
        <p className="text-gray-600 mt-2">Configure third-party integrations and services</p>
      </div>

      <div className="md:flex md:space-x-6 space-y-6 md:space-y-0">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 bg-white rounded-lg shadow-sm border border-gray-200">
          <nav className="p-4 space-y-1">
            {integrationSections.map((section) => {
              const Icon = section.icon;
              const isConfigured = isSecretConfigured(section.key) || 
                                  (section.key === 'tax' && configStates[section.key]?.percent !== undefined);
              
              return (
                <button
                  key={section.key}
                  onClick={() => {
                    setActiveSection(section.key);
                    navigate(`#${section.key}`, { replace: true });
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === section.key
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center">
                    <Icon className="h-5 w-5 mr-3" />
                    {section.label}
                  </div>
                  {isConfigured ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          <div className="hidden">
            {integrationSections.filter(s => s.key !== activeSection).map(s => (
              <span key={s.key} id={s.key}></span>
            ))}
          </div>
          <div
            id={activeSection}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            {renderConfigForm()}
          </div>
        </main>
      </div>
    </div>
  );
};