import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  AlertCircle, 
  X, 
  Settings, 
  ArrowRight,
  Building,
  CreditCard,
  Cloud,
  Mail,
  MapPin,
  Calculator
} from 'lucide-react';
import { useConfigApi } from '@/hooks/useConfigApi';
import type { CompletionProgress, SetupCompletionStatus } from '@/types/config';
import { useAuth } from '@/contexts/AuthContext';

export const SetupProgress = () => {
  const { user } = useAuth();
  const { getConfigs, getCloudinaryCloudName } = useConfigApi();
  const [progress, setProgress] = useState<CompletionProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if progress was previously dismissed
    const wasDismissed = localStorage.getItem('setup-progress-dismissed') === 'true';
    setDismissed(wasDismissed);
    
    if (!wasDismissed) {
      calculateProgress();
    } else {
      setLoading(false);
    }
  }, []);

  const calculateProgress = async () => {
    try {
      setLoading(true);
      
      // Get all relevant configs
      const [configData, cloudinaryData] = await Promise.all([
        getConfigs(['companyName', 'logoUrl', 'primaryColor', 'smtp', 'currencyApi', 'maps', 'razorpay', 'paypal']),
        getCloudinaryCloudName()
      ]);

      const status: SetupCompletionStatus = {
        branding: Boolean(configData.companyName && (configData.logoUrl || configData.primaryColor)),
        cloudinary: cloudinaryData.configured,
        smtp: Boolean(configData.smtp?.secretSet),
        currencyApi: Boolean(configData.currencyApi?.secretSet),
        maps: Boolean(configData.maps?.secretSet),
        paymentGateway: Boolean(configData.razorpay?.secretSet || configData.paypal?.secretSet),
      };

      const items = [
        {
          key: 'branding',
          label: 'Company Branding',
          completed: status.branding,
          link: '/settings/brand',
          required: true,
          icon: Building
        },
        {
          key: 'cloudinary',
          label: 'Image Management',
          completed: status.cloudinary,
          link: '/settings/integrations#cloudinary',
          required: true,
          icon: Cloud
        },
        {
          key: 'smtp',
          label: 'Email Configuration',
          completed: status.smtp,
          link: '/settings/integrations#smtp',
          required: true,
          icon: Mail
        },
        {
          key: 'currencyApi',
          label: 'Currency Conversion',
          completed: status.currencyApi,
          link: '/settings/integrations#currencyApi',
          required: false,
          icon: Calculator
        },
        {
          key: 'maps',
          label: 'Google Maps Integration',
          completed: status.maps,
          link: '/settings/integrations#maps',
          required: false,
          icon: MapPin
        },
        {
          key: 'paymentGateway',
          label: 'Payment Gateway',
          completed: status.paymentGateway,
          link: '/settings/integrations#razorpay',
          required: true,
          icon: CreditCard
        },
      ];

      const requiredItems = items.filter(item => item.required);
      const completed = requiredItems.filter(item => item.completed).length;
      const total = requiredItems.length;
      const percentage = Math.round((completed / total) * 100);

      setProgress({
        percentage,
        completed,
        total,
        items: items.map(({ icon, ...item }) => ({ ...item, iconName: icon.name }))
      });
    } catch (error) {
      console.error('Failed to calculate setup progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('setup-progress-dismissed', 'true');
    setDismissed(true);
  };

  const getItemIcon = (iconName: string) => {
    const iconMap: Record<string, any> = {
      Building, Cloud, Mail, Calculator, MapPin, CreditCard
    };
    return iconMap[iconName] || Building;
  };

  if (loading || dismissed || !progress || progress.percentage === 100) {
    return null;
  }

  const canClick = (item: { link: string }) => {
    // Brand settings: ADMIN or EDITOR
    if (item.link.startsWith('/settings/brand')) {
      return user?.role === 'ADMIN' || user?.role === 'EDITOR';
    }
    // Everything else in the setup list requires ADMIN (integrations)
    return user?.role === 'ADMIN';
  };


  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center mb-4">
            <Settings className="h-6 w-6 text-[var(--brand-primary)] mr-3" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Complete Your Setup</h3>
              <p className="text-gray-600 text-sm">
                {progress.completed} of {progress.total} required configurations completed
              </p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Setup Progress</span>
              <span>{progress.percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-[var(--brand-primary)] h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
          
          {/* Items List */}
          <div className="space-y-2">
            {progress.items.filter(item => item.required && !item.completed).slice(0, 3).map((item) => {
              const IconComponent = getItemIcon(item.iconName);
              const disabled = !canClick(item);
              return (
                <div key={item.key} className="flex items-center justify-between py-2">
                  <div className="flex items-center">
                    <IconComponent className="h-4 w-4 text-gray-400 mr-3" />
                    <span className="text-sm text-gray-700">{item.label}</span>
                    {!item.completed && (
                      <AlertCircle className="h-4 w-4 text-yellow-500 ml-2" />
                    )}
                  </div>
                  <Link
                    to={item.link}
                    className={`flex items-center text-sm ${disabled ? 'text-gray-400 cursor-not-allowed pointer-events-none' : 'text-[var(--brand-primary)] hover:text-[var(--brand-tertiary)]'}`}
                    title={disabled ? 'Contact an admin to configure' : ''}
                  >
                    Configure
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </div>
              );
            })}
          </div>
          
          {progress.items.filter(item => item.required && !item.completed).length > 3 && (
            <div className="text-center mt-3">
              <Link
                to="/settings/integrations"
                className="text-sm text-[var(--brand-primary)] hover:text-[var(--brand-tertiary)]"
              >
                View all configurations →
              </Link>
            </div>
          )}
        </div>
        
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 ml-4"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};