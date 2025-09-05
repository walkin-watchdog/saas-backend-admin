import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/ui/toaster';
import { useAuth } from '../contexts/AuthContext';
import { ProductContentTab } from '../components/products/ProductContentTab';
import { SchedulePriceTab } from '../components/products/SchedulePriceTab';
import { BookingProcessTab } from '../components/products/BookingProcessTab';
import { CancellationPolicyTab } from '../components/products/CancellationPolicyTab';
import { TravelerRequirementsTab } from '../components/products/TravelerRequirementsTab';
import { AvailabilityTab } from '../components/products/AvailabilityTab';
import type { ProductFormData } from '../types/index.ts';
import {
  Info, Image, Route, MapPin, Star, Settings, Users,
  CalendarClock, ClipboardCheck, Ban, UserCheck, CalendarRange,
  CheckCircle, AlertCircle, Save, Eye
} from 'lucide-react';

export const ProductForm = () => {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const toast = useToast();
  const [productId, setProductId] = useState<string | undefined>(routeId);
  const isEdit = Boolean(productId);
  const today = new Date().toISOString().split('T')[0];
  const [destinations, setDestinations] = useState<any[]>([]);
  const [experienceCategories, setExperienceCategories] = useState<any[]>([]);
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const busyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted   = useRef(true);
  const [askedOnce, setAskedOnce] = useState(false);

  const createDraft = async (): Promise<string | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    try {
      const ctrl = new AbortController();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...formData, isDraft: true }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('Server refused draft creation');
      const saved = await res.json();
      
      setProductId(saved.id);
      toast({ message: 'Draft saved', type: 'success' });
      return saved.id as string;
    } catch (err: any) {
      toast({ message: err.message || 'Failed to save draft', type: 'error' });
    } finally { busyRef.current = false; }
  };

  const updateDraft = async () => {
    if (!productId || busyRef.current) return;
    busyRef.current = true;
    try {
      const ctrl = new AbortController();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...formData, isDraft: true }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('Save failed');
      toast({ message: 'Draft updated', type: 'success' });
    } catch (err: any) {
      toast({ message: err.message || 'Draft save failed', type: 'error' });
    } finally { busyRef.current = false; }
  };

  const fetchDestinations = useCallback(async () => {
    setIsLoadingDestinations(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/destinations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setDestinations(await res.json());
    } finally {
      setIsLoadingDestinations(false);
    }
  }, [token]);

  const fetchExperienceCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/experience-categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setExperienceCategories(await res.json());
    } finally {
      setIsLoadingCategories(false);
    }
  }, [token]);

  const makeContent = useCallback((inner: string) =>
    (props: any) => (
      <ProductContentTab
        {...props}
        initialTab={inner}
        hideSidebar
        isEdit={isEdit}
        destinations={destinations}
        experienceCategories={experienceCategories}
        isLoadingDestinations={isLoadingDestinations}
        isLoadingCategories={isLoadingCategories}
        onDestinationsCreated={fetchDestinations}
        onCategoriesCreated={fetchExperienceCategories}
      />
    ), [destinations, experienceCategories, fetchDestinations, fetchExperienceCategories, isEdit]);

  const tabs = useMemo(() => [
    { id: 'basic', name: 'Basic Info', icon: Info, component: makeContent('basic') },
    { id: 'images', name: 'Images', icon: Image, component: makeContent('images') },
    { id: 'itinerary', name: 'Itinerary', icon: Route, component: makeContent('itinerary') },
    { id: 'pickup', name: 'Pickup Options', icon: MapPin, component: makeContent('pickup') },
    { id: 'content', name: 'Inclusions', icon: Star, component: makeContent('content') },
    { id: 'details', name: 'Additional Details', icon: Settings, component: makeContent('details') },
    { id: 'guides', name: 'Guides & Languages', icon: Users, component: makeContent('guides') },

    { id: 'schedule', name: 'Schedule & Price', icon: CalendarClock, component: SchedulePriceTab },
    { id: 'payment-options', name: 'Payment Options', icon: ClipboardCheck, component: BookingProcessTab },
    { id: 'cancellation', name: 'Cancellation Policy', icon: Ban, component: CancellationPolicyTab },
    { id: 'traveler-requirements', name: 'Traveler Requirements', icon: UserCheck, component: TravelerRequirementsTab },
    { id: 'availability', name: 'Availability', icon: CalendarRange, component: AvailabilityTab },
  ], [makeContent, isEdit]);

  const initialTab = searchParams.get('tab') || (location.state as any)?.activeTab || 'basic';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<ProductFormData>({
    title: '',
    productCode: '',
    description: '',
    type: 'TOUR',
    category: '',
    location: '',
    duration: '2 days',
    images: [],
    highlights: [],
    inclusions: [],
    exclusions: [],
    tags: [],
    pickupLocations: [],
    guides: [],
    languages: [],
    destinationId: '',
    experienceCategoryId: '',
    cancellationPolicy: '',
    cancellationPolicyType: 'standard',
    freeCancellationHours: 24,
    partialRefundPercent: 50,
    noRefundAfterHours: 12,
    cancellationTerms: [],
    requirePhone: false,
    requireId: false,
    requireAge: false,
    requireMedical: false,
    requireDietary: false,
    requireEmergencyContact: false,
    requirePassportDetails: false,
    additionalRequirements: '',
    customRequirementFields: [],
    isActive: true,
    isDraft: false,
    availabilityStartDate: today,
    availabilityEndDate: undefined,
    permanentAvailabilityStatus: null,
    availabilitySubranges: [],
    blockedDates: [],
    capacity: 0,
    accessibilityFeatures: [], // Add this new field
    // Accessibility fields
    wheelchairAccessible: '',
    strollerAccessible: '',
    serviceAnimalsAllowed: '',
    publicTransportAccess: '',
    infantSeatsRequired: '',
    infantSeatsAvailable: '',
    accessibilityNotes: '',
    pickupOption: '',
    allowTravelersPickupPoint: false,
    pickupStartTime: '',
    additionalPickupDetails: '',
    pickupLocationDetails: [],
    pickupStartTimeValue: 0,
    pickupStartTimeUnit: 'minutes',
    meetingPoints: [],
    phonenumber: '',
    tourType: '',
    paymentType: 'FULL',
    minimumPaymentPercent: 20,
    depositAmount: 0,
    currency: 'INR',
  });

  const tabValidations: Record<string, (formData: any) => string[]> = {
    basic: (formData) => {
      const missing: string[] = [];
      if (!formData.title) missing.push('Title');
      if (isEdit && !formData.productCode) missing.push('Product Code');
      if (!formData.description) missing.push('Description');
      if (!formData.type) missing.push('Type');
      if (!formData.location) missing.push('Location');
      if (formData.type == 'EXPERIENCE' && !formData.category) missing.push('Category');
      if (!formData.duration) missing.push('Duration');
      if (!formData.capacity || formData.capacity < 1) missing.push('Max Capacity');
      if (
        formData.wheelchairAccessible === 'yes' ||
        formData.strollerAccessible === 'yes' ||
        formData.serviceAnimalsAllowed === 'yes' ||
        formData.publicTransportAccess === 'yes'
      ) {
      }
      return missing;
    },
    images: f => (f.images?.length ?? 0) < 1 ? ['At least 1 image'] : [],
    itinerary: f => {
      if (f.type !== 'TOUR') {
        return [];
      }

      if ((f.itineraries?.length || 0) < 1) {
        return ['Please add at least one itinerary day'];
      }

      if (typeof f.duration === 'string' &&
          (f.duration.includes('Hour') || f.duration === 'Full Day' || f.duration === 'Half Day')
      ) {
          if (f.itineraries!.length !== 1) {
              return ['Hourly, Full Day, and Half Day tours require exactly one itinerary day'];
          }
      }

      if (typeof f.duration === 'string' &&
          !f.duration.includes('Hour') &&
          f.duration !== 'Full Day' &&
          f.duration !== 'Half Day'
      ) {
          const expected = parseInt(f.duration, 10) || 1;
          if (f.itineraries!.length !== expected) {
              return [`Itinerary must have exactly ${expected} day(s)`];
          }
      }
      return [];
    },
    pickup: f => {
      const m: string[] = [];
      if (!f.pickupOption) m.push('Pickup Option');
      if (f.pickupOption.startsWith('We pick up all travelers')) {
        if (!(f.pickupLocationDetails || []).length && !f.allowTravelersPickupPoint) {
          m.push('At least one Pickup Location or enable “travellers choose”');
        }
      }
      if (
        f.pickupOption.includes('meeting point') &&
        !(f.meetingPoints || []).length &&
        !(f.meetingPoint || '').trim()
      ) {
        m.push('At least one Meeting Point');
      }
      if (
        f.pickupOption.includes('meeting point') &&
        f.doesTourEndAtMeetingPoint === false &&
        !(f.endPoints || []).length
      ) {
        m.push('At least one End Location');
      }
      return m;
    },
    content: f => {
      const m = [];
      if (!f.inclusions?.length) m.push('At least one Inclusion');
      return m;
    },
    details: _ => [],
    guides: f => {
      if (!f.guides?.length && !f.languages?.length) {
        return ['Choose at least one language or guide'];
      }
      return [];
    },
    schedule: f => {
      const errs: string[] = [];

      if (!Array.isArray(f.packages) || f.packages.length === 0) {
        errs.push('Add at least one Package');
        return errs;
      }

      f.packages.forEach((pkg: any, i: number) => {
        if (
          !(Array.isArray(pkg.slots) && pkg.slots.length > 0) &&
          !(Array.isArray(pkg.slotConfigs) && pkg.slotConfigs.length > 0)
        ) {
          errs.push(`Package ${pkg.name || i + 1}: add at least one Slot`);
        }
      });

      const cap = typeof f.capacity === 'number' ? f.capacity : 0;
      f.packages.forEach((pkg: any, i: number) => {
        if (pkg.maxPeople > cap) {
          errs.push(`Package ${pkg.name || i + 1}: max travellers (${pkg.maxPeople}) exceed product capacity (${cap})`);
        }
      });

      return errs;
    },
    'payment-options': _ => [],
    cancellation: f => {
      const m: string[] = [];
      if (!f.cancellationPolicy) m.push('Cancellation Policy');
      if (f.cancellationPolicyType === 'custom') {
        if (!f.cancellationTerms.length) m.push('At least one Cancellation Term');
        else {
          const invalid = f.cancellationTerms.some((t: any) =>
            !t.timeframe || !t.description || t.refundPercent < 0 || t.refundPercent > 100
          );
          if (invalid) m.push('Complete all Cancellation Term details');
        }
      }
      return m;
    },
    'traveler-requirements': f => {
      const m: string[] = [];
      if (f.customRequirementFields.length) {
        const invalidField = f.customRequirementFields.some((fld: any) =>
          !fld.label || (fld.type === 'select' && !fld.options.length)
        );
        if (invalidField) m.push('Complete all Custom Requirement Fields');
      }
      return m;
    },
    availability: _ => [],
  };

  const handleTabChange = async (nextTab: string) => {
    // Only validate when moving forward
    const currentIndex = tabs.findIndex(t => t.id === activeTab);
    const nextIndex = tabs.findIndex(t => t.id === nextTab);
    if (nextIndex > currentIndex && !formData.isDraft) {
      const validate = tabValidations[activeTab];
      const missing = validate?.(formData) || [];
      if (missing.length) {
        toast({ message: `Please fill out: ${missing.join(', ')}`, type: 'error' });
        return;
      }
    }
    if (formData.isDraft && !productId) {
      if (!askedOnce) {
        setAskedOnce(true);
        const shouldSave = window.confirm('Save this draft so you can resume later?');
        if (shouldSave) {
          const newId = await createDraft();
          if (newId) {
            navigate(`/products/${newId}/edit?tab=${nextTab}`, {
              replace: true,
            });
          }
        } else {
          setActiveTab(nextTab);
        }
        return;
      }
    }

    setActiveTab(nextTab);

    if (!formData.isDraft) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateDraft();
    }, 300);
  };

  // Transform slots data to slotConfigs format for the form
  const transformProductDataForForm = useCallback((product: any) => {
    const normaliseCoords = (day: any) => ({
      ...day,
      activities: day.activities.map((a: any) => ({
        ...a,
        lat: a.lat ?? a.locationLat ?? null,
        lng: a.lng ?? a.locationLng ?? null,
        placeId: a.placeId ?? a.locationPlaceId ?? null,
      })),
    });

    if (product?.itineraries?.length) {
      product.itineraries = product.itineraries.map(normaliseCoords);
    }
    if (product?.itinerary?.length) {
      product.itinerary = product.itinerary.map(normaliseCoords);
    }

    if (product && product.packages) {
      const transformedPackages = product.packages.map((pkg: any) => {
        // Only transform if slots exist and slotConfigs doesn't
        if (pkg.slots && Array.isArray(pkg.slots) && !pkg.slotConfigs) {
          const slotConfigs = pkg.slots.map((slot: any) => {
            return {
              id: slot.id,
              times: slot.Time || [],
              days: slot.days || [],
              adultTiers: slot.adultTiers || [],
              childTiers: slot.childTiers || [],
            };
          });

          return {
            ...pkg,
            slotConfigs: slotConfigs,
          };
        }
        return pkg;
      });

      return {
        ...product,
        packages: transformedPackages,
      };
    }
    return product;
  }, []);

  const fetchProduct = useCallback(async () => {
    setIsLoading(true);
    try {
      const ctrl = new AbortController();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/products/${productId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal:  ctrl.signal,
        }
      );

      if (response.ok) {
        const product = await response.json();
        const transformedProduct = transformProductDataForForm(product);

        const startDate = transformedProduct.availabilityStartDate?.split('T')[0] || '';
        const endDate = transformedProduct.availabilityEndDate
          ? transformedProduct.availabilityEndDate.split('T')[0]
          : undefined;

        const blockedDates = (product.blockedDates || []).map((b: any) => ({
          id: b.id,
          date: b.date.split('T')[0],
          reason: b.reason,
        }));

        const availabilitySubranges = (product.availabilitySubranges || []).map((r:any) => ({
        id: r.id,
        startDate: r.startDate.slice(0,10),
        endDate:   r.endDate  .slice(0,10),
        status:    r.status as 'SOLD_OUT'|'NOT_OPERATING'
      }));

        // --- Split pickupStartTime into value and unit ---
        let pickupStartTimeValue = 0;
        let pickupStartTimeUnit = 'minutes';
        if (transformedProduct.pickupStartTime) {
          const [value, unit] = transformedProduct.pickupStartTime.split(' ');
          pickupStartTimeValue = Number(value) || 0;
          pickupStartTimeUnit = unit || 'minutes';
        }

        const formattedData = {
          ...transformedProduct,
          availabilityStartDate: startDate,
          availabilityEndDate: endDate || undefined,
          blockedDates,
          permanentAvailabilityStatus: product.permanentAvailabilityStatus,
          availabilitySubranges,
          pickupStartTimeValue,
          pickupStartTimeUnit,
        };
        
        const topCurrency =
          formattedData.currency ||
          (formattedData.packages && formattedData.packages[0]?.currency) ||
          'INR';

        setFormData({
          ...formattedData,
          currency: topCurrency
        });
      }
    } catch (error) {
      console.error('Error fetching product:', error);
    } finally {
      setIsLoading(false);
    }
  }, [productId, token, transformProductDataForForm]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      busyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (busyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // Effects for loading data
  useEffect(() => {
    fetchDestinations();
    fetchExperienceCategories();
  }, [fetchDestinations, fetchExperienceCategories]);

  useEffect(() => {
    if (productId) fetchProduct();
  }, [productId, fetchProduct]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    if (!formData.isDraft) {
      let firstBadTab: string | null = null;
      let firstErrMsg: string | null = null;

      Object.entries(tabValidations).forEach(([tabId, validate]) => {
        if (firstBadTab) return;
        const errs = validate(formData) || [];
        if (errs.length) {
          firstBadTab  = tabId;
          firstErrMsg  = errs.join(', ');
        }
      });

      if (firstBadTab) {
        setActiveTab(firstBadTab);
        toast({ message: firstErrMsg!, type: 'error' });
        setIsSaving(false);
        return;
      }
    }
    if (
    !formData.isDraft &&
    formData.type === 'TOUR' &&
    formData.itineraries &&
    formData.duration &&
    formData.duration !== 'Full Day' &&
    formData.duration !== 'Half Day'
  ) {
    let expectedDays = 1;
    if (typeof formData.duration === 'string') {
      if (formData.duration.includes('Hour')) {
        expectedDays = 1;
      } else if (formData.duration.includes('Day')) {
        expectedDays = parseInt(formData.duration.split(' ')[0]) || 1;
      }
    }
    const actualDays = formData.itineraries.length;
    if (actualDays !== expectedDays) {
      toast({
        message: `Itinerary days (${actualDays}) must exactly match the duration (${expectedDays} day${expectedDays > 1 ? 's' : ''}).`,
        type: 'error'
      });
      setActiveTab('itinerary');
      setIsSaving(false);
      return;
    }
  }
    console.log('Submitting form data:', formData);

    const payload = {
      ...formData,
      passportDetailsOption: formData.passportDetailsOption || "",
      permanentAvailabilityStatus: formData.permanentAvailabilityStatus,
      availabilitySubranges: formData.availabilitySubranges,
      pickupStartTime:
        formData.pickupStartTimeValue !== undefined && formData.pickupStartTimeUnit
          ? `${formData.pickupStartTimeValue} ${formData.pickupStartTimeUnit}`
          : '',
    };
    console.log(formData.pickupStartTimeUnit, formData.pickupStartTimeValue);
    console.log(formData.pickupStartTime);
    try {
      const url = productId
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/products/${productId}`
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/products`;

      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 400) {
        const errorData = await response.json();
        let errorMessage = 'Validation Error';

        if (errorData.error && typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        } else if (errorData.message && typeof errorData.message === 'string') {
          errorMessage = errorData.message;
        } else if (errorData.details) {
          errorMessage =
            'Validation errors: ' +
            Object.keys(errorData.details)
              .map((key) => `${key} - ${errorData.details[key]}`)
              .join(', ');
        }

        toast({ message: errorMessage, type: 'error' });
        return;
      } else if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Server error');
      }
      toast({ message: isEdit ? 'Product updated' : 'Product created', type: 'success' });

      navigate('/products');
    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        message: error instanceof Error ? error.message : 'Failed to save product',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateFormData = (updates: Partial<ProductFormData>) => {
    setFormData((prev) => {
      if (updates.currency && prev.packages?.length) {
        const pkgs = prev.packages.map(pkg => ({
          ...pkg,
          currency: updates.currency!
        }));
        return { ...prev, packages: pkgs, ...updates };
      }
      return { ...prev, ...updates };
    });
  };

  const ActiveTabComponent = tabs.find((tab) => tab.id === activeTab)?.component;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 md:space-y-6 ${isEdit && formData.isDraft ? 'bg-yellow-50 border border-yellow-300 p-3 md:p-4 rounded-lg' : ''}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div className="flex items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              {isEdit ? 'Edit Product' : 'Create New Product'}
            </h1>
            <p className="text-gray-600 mt-2 text-sm md:text-base">
              {isEdit
                ? 'Update product details and settings'
                : 'Add a new tour or experience to your platform'}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
          {/* Draft Toggle */}
          <div className="flex items-center justify-between sm:justify-start space-x-2 p-2 sm:p-0">
            <span
              className={`text-sm font-medium ${formData.isDraft ? 'text-yellow-800' : 'text-gray-500'
                }`}
            >
              Draft
            </span>
            <button
              onClick={() =>
                updateFormData({
                  isDraft: !formData.isDraft,
                  ...(!formData.isDraft
                    ? { isActive: false }
                    : { isActive: true }
                  ),
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.isDraft ? 'bg-[var(--brand-primary)]' : 'bg-gray-200'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.isDraft ? 'translate-x-1' : 'translate-x-6'
                  }`}
              />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
            {/* Discard Draft Button */}
            {formData.isDraft && !isEdit && (
              <button
                onClick={() => {
                  if (window.confirm('Discard draft and leave?')) {
                    navigate('/products');
                  }
                }}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
                type="button"
              >
                Discard
              </button>
            )}

            {/* Status Toggle */}
            {!formData.isDraft && (
              <div className="flex items-center justify-between sm:justify-start space-x-2 p-2 sm:p-0">
                <span
                  className={`text-sm font-medium ${formData.isActive ? 'text-green-600' : 'text-gray-500'
                    }`}
                >
                  {formData.isActive ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => updateFormData({ isActive: !formData.isActive })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.isActive ? 'bg-[var(--brand-primary)]' : 'bg-gray-200'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.isActive ? 'translate-x-1' : 'translate-x-6'
                      }`}
                  />
                </button>
              </div>
            )}

            {/* Cancel */}
            {!isEdit && !formData.isDraft && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      'Are you sure you want to cancel? Unsaved changes will be lost.'
                    )
                  ) {
                    navigate('/products');
                  }
                }}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
                type="button"
              >
                Cancel
              </button>
            )}

            {/* Go Back */}
            {isEdit && (
              <button
                onClick={() => navigate('/products')}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
                type="button"
              >
                Go Back
              </button>
            )}

            {/* Preview Button */}
            {isEdit && (
              <button
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
                onClick={() => navigate(`/products/${productId}/preview`)}
                type="button"
              >
                <Eye className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Preview</span>
              </button>
            )}

            {/* Save Button */}
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex items-center justify-center px-4 md:px-6 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <Save className="h-4 w-4 mr-2" />
              <span>
                {isSaving
                  ? 'Saving...'
                  : isEdit && formData.isDraft
                    ? 'Update Draft'
                    : isEdit
                      ? 'Update Product'
                      : formData.isDraft
                        ? 'Create Draft'
                        : 'Create Product'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <div className="md:flex space-y-4 md:space-y-0">
        <aside className="hidden md:block w-64 bg-white rounded-lg shadow-sm border border-gray-200 mr-6 overflow-y-auto">
          <nav className="p-4 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isValid = !tabValidations[tab.id] || tabValidations[tab.id](formData).length === 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tab.id
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  {Icon && <Icon className="h-5 w-5 mr-2" />}
                  <span className="flex-1 text-left">{tab.name}</span>
                  {isValid
                    ? <CheckCircle className="h-5 w-5 text-green-500" />
                    : <AlertCircle className="h-5 w-5 text-gray-400" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* main content */}
        <main className="flex-1 space-y-4 md:space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
            {ActiveTabComponent && (
              <ActiveTabComponent
                formData={formData}
                updateFormData={updateFormData}
                isEdit={isEdit}
              />
            )}
          </div>
        </main>
      </div>

      {/* Mobile Tab Navigation at Bottom */}
      <div className="md:hidden bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="text-center mb-2 text-sm font-medium text-gray-900">
          {tabs.find(t => t.id === activeTab)?.name}
        </div>
        <div className="flex justify-between items-center">
          <button
            onClick={() => {
              const raw = tabs.findIndex((t) => t.id === activeTab);
              const currentIndex = raw === -1 ? 0 : raw;
              if (currentIndex > 0) {
                handleTabChange(tabs[currentIndex - 1].id);
              }
            }}
            disabled={tabs.findIndex((tab) => tab.id === activeTab) === 0}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          <div className="flex space-x-1">
            {tabs.map((tab, _index) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`w-2 h-2 rounded-full transition-colors ${activeTab === tab.id ? 'bg-[var(--brand-primary)]' : 'bg-gray-300'
                  }`}
              />
            ))}
          </div>

          <button
            onClick={() => {
              const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
              if (currentIndex < tabs.length - 1) {
                handleTabChange(tabs[currentIndex + 1].id);
              }
            }}
            disabled={tabs.findIndex((tab) => tab.id === activeTab) === tabs.length - 1}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-[var(--brand-primary)] border border-transparent rounded-lg hover:bg-[var(--brand-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};