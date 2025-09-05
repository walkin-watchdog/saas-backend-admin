import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useAuth } from '../contexts/AuthContext';
import type { Product, PackageOption } from '../types/index.ts';
import { formatDate, parse } from 'date-fns';
import { isSlotBookable } from '../lib/utils';
import { ProductImageGallery } from '../components/productpreviewcomp/ProductImageGallery.tsx';
import { Navbar } from '../components/productpreviewcomp/Navbar.tsx';
import { ProductOverview } from '../components/productpreviewcomp/ProductOverview.tsx';
import { DetailsDropdown } from '../components/productpreviewcomp/DetailsDropdown.tsx';
import { InclusionsExclusions } from '../components/productpreviewcomp/InclusionsExclusions.tsx';
import { PickupMeetingInfo } from '../components/productpreviewcomp/PickupMeetingInfo.tsx';
import { AccessibilityInfo } from '../components/productpreviewcomp/AccessibilityInfo.tsx';
import { GuidesAndLanguages } from '../components/productpreviewcomp/GuidesAndLanguages.tsx';
import { AdditionalRequirements } from '../components/productpreviewcomp/Additionalrequirements.tsx';
import { ProductPolicies } from '../components/productpreviewcomp/ProductPolicies.tsx';
import { Itinerary } from '../components/productpreviewcomp/Itinerary.tsx';
import { BookingSidebar } from '../components/productpreviewcomp/BookingSidebar.tsx';
import { calculateEffectivePrice } from '@/components/productpreviewcomp/globalfunc.tsx';
import { CurrencySelector } from '../components/common/CurrencySelector';
import { getOptimalCurrencyForProduct, setCurrencyAndNotify } from '../utils/currencyUtils';
import ProductHelp from '../components/productpreviewcomp/ProductHelp.tsx';

// Helper function to calculate the effective price after disco

export const ProductPreview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const todayStr = new Date().toLocaleDateString('en-US');
  const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
  const [adultsCount, setAdultsCount] = useState(2);
  const [childrenCount, setChildrenCount] = useState(0);
  const [selectedDateStatus, setSelectedDateStatus] = useState<'AVAILABLE'|'SOLD_OUT'|'NOT_OPERATING'|null>(null);
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [isDateOk, setIsDateOk] = useState<boolean | null>(null);
  const [availablePackages, setAvailablePackages] = useState<PackageOption[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<PackageOption | null>(null);
  const [cheapestPackage, setCheapestPackage] = useState<PackageOption | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [slotsForPackage, setSlotsForPackage] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>('includes');
  // const [showAvail, setShowAvail] = useState(false);
  const isMobile = useMediaQuery('(max-width:1023px)');

  // Refs for scroll navigation
  const overviewRef = useRef<HTMLDivElement>(null);
  const itineraryRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const base = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';
        const res = await fetch(`${base}/products/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        setProduct(await res.json());
      } catch (err) {
        console.error('Error fetching product:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, token]);

  // Find the cheapest package when product data loads
  useEffect(() => {
    if (!product || !product.packages || product.packages.length === 0) {
      return;
    }

    let cheapest = product.packages[0];
    let lowestPrice = calculateEffectivePrice(
      cheapest.basePrice,
      cheapest.discountType,
      cheapest.discountValue
    );

    for (const pkg of product.packages) {
      const effectivePrice = calculateEffectivePrice(
        pkg.basePrice,
        pkg.discountType,
        pkg.discountValue
      );

      if (effectivePrice < lowestPrice) {
        cheapest = pkg;
        lowestPrice = effectivePrice;
      }
    }

    setCheapestPackage(cheapest);
  }, [product]);

  // Set optimal currency based on product packages
  useEffect(() => {
    if (!product || !product.packages || product.packages.length === 0) {
      return;
    }

    const optimalCurrency = getOptimalCurrencyForProduct(product.packages);
    const currentCurrency = localStorage.getItem('preferredCurrency') || 'INR';
    
    // Only update if the optimal currency is different from current
    if (optimalCurrency !== currentCurrency) {
      console.log(`Setting admin currency to ${optimalCurrency} based on product packages`);
      setCurrencyAndNotify(optimalCurrency);
    }
  }, [product]);

  // Fetch available slots when a package is selected
  useEffect(() => {
    if (!selectedPackage || !selectedDateStr) return;

    const fetchSlots = async () => {
      setSlotsLoading(true);
      try {
        const iso = formatDate(parse(selectedDateStr, 'MM/dd/yyyy', new Date()), 'yyyy-MM-dd');
        const dayOfWeek = parse(selectedDateStr, 'MM/dd/yyyy', new Date()).toLocaleDateString('en-US', { weekday: 'long' });
        const base = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const res = await fetch(`${base}/availability/package/${selectedPackage.id}/slots?date=${iso}`);

        if (res.ok) {
          const data = await res.json();
          if (data.slots && Array.isArray(data.slots)) {
            // Filter slots based on day of week
            const filteredSlots = data.slots.filter((slot: { days: string | string[]; }) =>
              Array.isArray(slot.days) && slot.days.includes(dayOfWeek)
            );

            // Filter slots based on cutoff time
            const availableSlots = filteredSlots.filter((slot: any) => {
              if (!slot.Time || !Array.isArray(slot.Time) || slot.Time.length === 0) {
                return false;
              }

              // Check if any time in the slot is still bookable
              return slot.Time.some((time: string) => {
                const cutoffTime = slot.cutoffTime || 24;
                const { isBookable } = isSlotBookable(iso, time, cutoffTime);
                return isBookable;
              });
            });

            setSlotsForPackage(availableSlots);
            // Reset selected time slot when slots change
            setSelectedSlot(null);
            setSelectedSlotId(null);
            setSelectedTimeSlot(null);
          } else {
            setSlotsForPackage([]);
          }
        } else {
          console.error('Failed to fetch slots:', await res.text());
          setSlotsForPackage([]);
        }
      } catch (error) {
        console.error('Error fetching slots:', error);
        setSlotsForPackage([]);
      } finally {
        setSlotsLoading(false);
      }
    };

    fetchSlots();
  }, [selectedPackage, selectedDateStr]);

  const handleBarChange = ({ date, adults, children }: {
    date: string; adults: number; children: number;
  }) => {
    setSelectedDateStr(date);
    setAdultsCount(adults);
    setChildrenCount(children);
    setSelectedDateStatus(null);
    setSelectedPackage(null);
    setSelectedSlotId(null);
    setSelectedSlot(null);
    setIsDateOk(null);
    setAvailablePackages([]);
  };

  const handlePackageSelect = (pkgId: string) => {
    const pkg = product?.packages?.find((p: any) => p.id === pkgId);
    if (!pkg) return;

    setSelectedPackage(pkg);
    setSelectedSlotId(null);
    setSelectedSlot(null);
    setSelectedTimeSlot(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium mb-2">Product not found</h3>
        <button
          onClick={() => navigate('/products')}
          className="text-[var(--brand-primary)] hover:underline"
        >
          Back to Products
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/products')}
            className="mr-4 p-2 text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Product Preview</h1>
            <p className="text-gray-600">Viewing as customers would see it</p>
          </div>
        </div>
        <div className="flex items-center px-4 py-2">
          <p className="text-gray-600 font-bold">Choose Currency</p>
          <CurrencySelector className="px-2" />
          <button
          onClick={() => navigate(`/products/${id}/edit`)}
          className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-tertiary)]"
        >
          Edit Product
        </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Image Gallery */}
        <ProductImageGallery
          setCurrentImageIndex={setCurrentImageIndex}
          currentImageIndex={currentImageIndex}
          product={product}
        />

        {/* Thumbnail Grid */}
        {product.images.length > 1 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 mt-4">
            {product.images.slice(0, 10).map((image, index) => (
              <button
                key={index}
                onClick={() => setCurrentImageIndex(index)}
                className={`h-20 rounded-lg overflow-hidden border-2 ${index === currentImageIndex ? 'border-[var(--brand-primary)]' : 'border-transparent'
                  }`}
              >
                <img src={image} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 ml-5 mr-5 lg:ml-10 lg:mr-10">
        <div className="lg:col-span-2">
          {/* Tabbed Navigation Bar */}
          <Navbar
            overviewRef={overviewRef}
            itineraryRef={itineraryRef}
            detailsRef={detailsRef}
            isExperience={product.type === 'EXPERIENCE'}
          />

          {/* Main Content */}
          <div className="relative mb-8">
              {/* Overview Section */}
              <ProductOverview 
                  overviewRef={overviewRef}
                  dateStatus={selectedDateStatus}
                  product={product}
              />

              {/* Details Section */}
              <div ref={detailsRef} className="bg-white rounded-lg shadow-sm p-6 mb-8 scroll-mt-20">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Details</h2>

                  {/* Details Dropdowns */}
                  <div className="space-y-4">
                      {/* What's included */}
                      <DetailsDropdown
                          title="What's included"
                          isOpen={openDropdown === 'includes'}
                          onToggle={(open) => setOpenDropdown(open ? 'includes' : null)}
                      >
                          <InclusionsExclusions product={product}/>
                      </DetailsDropdown>

                      {/* Departure and return */}
                      <div data-dropdown="departure-return">
                          <DetailsDropdown
                              title="Departure and return"
                              isOpen={openDropdown === 'departure'}
                              onToggle={(open) => setOpenDropdown(open ? 'departure' : null)}
                          >
                              <PickupMeetingInfo product={product}/>
                          </DetailsDropdown>
                      </div>

                      {/* Accessibility */}
                      <DetailsDropdown
                          title="Accessibility"
                          isOpen={openDropdown === 'accessibility'}
                          onToggle={(open) => setOpenDropdown(open ? 'accessibility' : null)}
                      >
                          <AccessibilityInfo product={product}/>
                      </DetailsDropdown>

                      {/* Guides and Languages */}
                      {Array.isArray(product.guides) && product.guides.length > 0 && (
                          <DetailsDropdown
                              title="Guides and Languages"
                              isOpen={openDropdown === 'guides'}
                              onToggle={(open) => setOpenDropdown(open ? 'guides' : null)}
                          >
                              <GuidesAndLanguages product={product}/>
                          </DetailsDropdown>
                      )}

                      {/* Additional Information */}
                      {(product.requirePhone || product.requireId || product.requireAge ||
                        product.requireMedical || product.requireDietary ||
                        product.requireEmergencyContact || product.requirePassportDetails ||
                        (Array.isArray(product.customRequirementFields) &&
                        product.customRequirementFields.length > 0) ||
                        product.additionalRequirements) && (
                      <DetailsDropdown
                          title="Additional information"
                          isOpen={openDropdown === 'additional'}
                          onToggle={(open) => setOpenDropdown(open ? 'additional' : null)}
                      >
                          <div>
                              <AdditionalRequirements product={product}/>
                          </div>
                      </DetailsDropdown>
                          )}

                      {/* Cancellation policy */}
                      {product.cancellationPolicy && (
                          <DetailsDropdown
                              title="Cancellation policy"
                              isOpen={openDropdown === 'cancellation'}
                              onToggle={(open) => setOpenDropdown(open ? 'cancellation' : null)}
                          >
                              <ProductPolicies product={product}/>
                          </DetailsDropdown>
                      )}

                      {/* Help */}
                      <DetailsDropdown
                          title="Assistance"
                          isOpen={openDropdown === 'help'}
                          onToggle={(open) => setOpenDropdown(open ? 'help' : null)}
                      >
                          <div>
                              <ProductHelp/>
                          </div>
                      </DetailsDropdown>
                  </div>
              </div>

              {/* Itinerary Section */}
              <Itinerary
                  itineraryRef={itineraryRef}
                  detailsRef={detailsRef}
                  onNavigateToDeparture={() => setOpenDropdown('departure')}
                  product={product}
              />
          </div>
        </div>

        {/* Booking Sidebar */}
        <BookingSidebar
          cheapestPackage={cheapestPackage}
          currentProduct={product}
          selectedDateStr={selectedDateStr}
          adultsCount={adultsCount}
          childrenCount={childrenCount}
          isMobile={isMobile}
          setCheckingAvail={setCheckingAvail}
          setIsDateOk={setIsDateOk}
          setAvailablePackages={setAvailablePackages}
          setSelectedSlotId={setSelectedSlotId}
          setSelectedTimeSlot={setSelectedTimeSlot}
          calculateEffectivePrice={calculateEffectivePrice}
          handleBarChange={handleBarChange}
          selectedPackage={selectedPackage}
          checkingAvail={checkingAvail}
          isDateOk={isDateOk}
          availablePackages={availablePackages}
          slotsLoading={slotsLoading}
          slotsForPackage={slotsForPackage}
          selectedSlot={selectedSlot}
          selectedSlotId={selectedSlotId}
          selectedTimeSlot={selectedTimeSlot}
          handlePackageSelect={handlePackageSelect}
          setSelectedSlot={setSelectedSlot}
          isSlotBookable={isSlotBookable}
          onDateStatusChange={(status) => {
            setSelectedDateStatus(status);
          }}
        />
      </div>
    </div>
  );
};