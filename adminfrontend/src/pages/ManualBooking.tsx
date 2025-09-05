import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Users, 
  Package, 
  MapPin, 
  Clock, 
  CreditCard, 
  Send, 
  ArrowLeft, 
  Check
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { PricingTier, Product } from '@/types';
import { getCurrencySymbol } from '../utils/currencyUtils';

interface FormValues {
  isCustom: boolean;
  customDetails: {
    packageName?: string;
    location?: string;
    itinerary?: {
      date: string;
      time: string;
      activity: string;
      location: string;
      remarks: string;
    }[];
    duration?: string;
    durationUnit?: 'hours' | 'days';
    code?: string;
    selectedTimeSlot?: string;
    pricePerPerson?: number;
    discountType?: 'percentage' | 'fixed';
    childPricePerPerson?: number;
    discountValue?: number;
  }
  productId: string;
  packageId: string;
  slotId: string;
  selectedTimeSlot: string;
  bookingDate: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  adults: number;
  children: number;
  notes: string;
  status: string;
  paymentStatus: string;
  additionalDiscount: number;
  sendVoucher: boolean;
  partialPaymentAmount?: number;
  currency: string;
}

const defaultFormValues: FormValues = {
   isCustom: false,
   customDetails: {
    packageName:       '',
    location:          '',
    duration:          '',
    durationUnit:      'hours',
    itinerary:          [],
    code:              '',
    selectedTimeSlot:  '',
    pricePerPerson:    0,
    discountType:      'percentage',
    childPricePerPerson: 0,
    discountValue:     0
  },
   productId: '',
   packageId: '',
   slotId: '',
   selectedTimeSlot: '',
   bookingDate: new Date().toISOString().split('T')[0],
   customerName: '',
   customerEmail: '',
   customerPhone: '',
   adults: 1,
   children: 0,
   notes: '',
   status: 'CONFIRMED',
   paymentStatus: 'PAID',
   additionalDiscount: 0,
   sendVoucher: true,
   partialPaymentAmount: 0,
   currency: 'INR',
 };

const currencySymbol = getCurrencySymbol;

const proposalTotal = (p:any) => {
  const cd = p.customDetails ?? {};
  const adultUnit  = cd.pricePerPerson      ?? 0;
  const childUnit  = cd.childPricePerPerson ?? adultUnit;
  const base       = adultUnit * p.adults + childUnit * p.children;
  if (cd.discountType === 'percentage')
    return base * (1 - (cd.discountValue ?? 0)/100);
  if (cd.discountType === 'fixed')
    return Math.max(0, base - (cd.discountValue ?? 0));
  return base;
};

export const ManualBooking = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<any[]>([]);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [proposalSearch, setProposalSearch] = useState('');
  const [proposalPage, setProposalPage]   = useState(0);
  const [isProposalLoading, setIsProposalLoading] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<any | null>(null);

  const [filteredTimeSlots, setFilteredTimeSlots] = useState<any[]>([]);
  const [formValues, setFormValues] = useState<FormValues>(defaultFormValues);
  const selectedSlot = filteredTimeSlots.find(s => s.id === formValues.slotId);
  
  
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [success, setSuccess] = useState<string | null>(null);

  const selectedPackage = filteredPackages.find(p => p.id === formValues.packageId);
  const childrenEnabled = selectedPackage?.ageGroups?.child?.enabled ?? true;

  useEffect(() => {
    if (!formValues.isCustom && selectedPackage?.currency && selectedPackage.currency !== formValues.currency) {
      setFormValues(prev => ({ ...prev, currency: selectedPackage.currency }));
    }
  }, [formValues.isCustom, selectedPackage]);
 
  useEffect(() => {
    if (!childrenEnabled && formValues.children !== 0) {
      setFormValues(prev => ({ ...prev, children: 0 }));
    }
  }, [childrenEnabled]);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProposals = async (q = '', page = 0) => {
    setIsProposalLoading(true);
    try {
      const url = new URL(`${import.meta.env.VITE_API_URL}/proposals`);
      url.searchParams.set('status', 'APPROVED');
      if (q)   url.searchParams.set('q', q);
      url.searchParams.set('limit', '20');
      url.searchParams.set('offset', String(page * 20));
      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r.ok) setProposals(await r.json());
    } finally {
      setIsProposalLoading(false);
    }
  };

  useEffect(() => { fetchProposals(); }, [token]);

  useEffect(() => {
    if (formValues.productId) {
      const selectedProduct = products.find(p => p.id === formValues.productId);
      if (selectedProduct && selectedProduct.packages) {
        setFilteredPackages(selectedProduct.packages);
      } else {
        setFilteredPackages([]);
      }
      // Reset package and slot selections
      setFormValues(prev => ({...prev, packageId: '', slotId: ''}));
      setFilteredTimeSlots([]);
    } else {
      setFilteredPackages([]);
    }
  }, [formValues.productId, products]);

  useEffect(() => {
    if (formValues.packageId && formValues.bookingDate) {
      fetchTimeSlots();
    } else {
      setFilteredTimeSlots([]);
    }
  }, [formValues.packageId, formValues.bookingDate]);

  useEffect(() => {
    calculateTotalAmount();
  }, [
    formValues.isCustom,
    formValues.bookingDate,
    formValues.packageId,
    formValues.slotId,
    formValues.adults,
    formValues.children,
    formValues.customDetails.pricePerPerson,
    formValues.customDetails.childPricePerPerson,
    formValues.customDetails.discountType,
    formValues.customDetails.discountValue
  ]);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/products`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTimeSlots = async () => {
    try {
      if (!formValues.packageId || !formValues.bookingDate) return;
      
      const formattedDate = new Date(formValues.bookingDate).toISOString().split('T')[0];
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/availability/package/${formValues.packageId}/slots?date=${formattedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.slots) {
          const dayName = new Date(formValues.bookingDate)
            .toLocaleDateString('en-US', { weekday: 'long' });
          setFilteredTimeSlots(
            data.slots.filter((slot: any) => slot.days.includes(dayName))
          );
        } else {
          setFilteredTimeSlots([]);
        }
      }
    } catch (error) {
      console.error('Error fetching time slots:', error);
      setFilteredTimeSlots([]);
    }
  };

  const calculateTotalAmount = () => {
    if (formValues.isCustom) {
      const {
        pricePerPerson = 0,
        childPricePerPerson,
        discountType = 'percentage',
        discountValue = 0
      } = formValues.customDetails;
      const adultTotal  = pricePerPerson * formValues.adults;
      const childTotal  = (childPricePerPerson ?? pricePerPerson) * formValues.children;
      const baseTotal   = adultTotal + childTotal;
      const finalTotal = discountType === 'percentage'
        ? baseTotal * (1 - discountValue/100)
        : Math.max(0, baseTotal - discountValue);
      setTotalAmount(finalTotal);
      return;
    }
    if (!formValues.packageId) {
      setTotalAmount(null);
      return;
    }

    const selectedPackage = filteredPackages.find(p => p.id === formValues.packageId);
    if (!selectedPackage) {
      setTotalAmount(null);
      return;
    }

    let adultPrice = selectedPackage.basePrice;
    let childPrice = selectedPackage.basePrice

    // Apply package discount if available
    if (selectedPackage.discountType === 'percentage' && selectedPackage.discountValue) {
      adultPrice = adultPrice * (1 - (selectedPackage.discountValue / 100));
      childPrice = childPrice * (1 - (selectedPackage.discountValue / 100));
    } else if (selectedPackage.discountType === 'fixed' && selectedPackage.discountValue) {
      adultPrice = Math.max(0, adultPrice - selectedPackage.discountValue);
      childPrice = Math.max(0, childPrice - selectedPackage.discountValue);
    }

    // Check for slot-specific pricing
    if (formValues.slotId) {
      const selectedSlot = filteredTimeSlots.find(s => s.id === formValues.slotId);
      if (selectedSlot) {
        // Use adult tier pricing if available
        if (selectedSlot.adultTiers && selectedSlot.adultTiers.length > 0) {
          const adultTier = selectedSlot.adultTiers.find((tier: PricingTier) => 
            formValues.adults >= tier.min && formValues.adults <= tier.max
          );
          if (adultTier) {
            adultPrice = adultTier.price;
          }
        }

        // Use child tier pricing if available and there are children
        if (formValues.children > 0 && selectedSlot.childTiers && selectedSlot.childTiers.length > 0) {
          const childTier = selectedSlot.childTiers.find((tier: PricingTier) => 
            formValues.children >= tier.min && formValues.children <= tier.max
          );
          if (childTier) {
            childPrice = childTier.price;
          }
        }
      }
    }

    // Calculate total
    const total = (adultPrice * formValues.adults) + (childPrice * formValues.children);
    setTotalAmount(total);
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    if (!formValues.isCustom) {
      if (!formValues.productId) newErrors.productId = 'Product is required';
      if (!formValues.packageId) newErrors.packageId = 'Package is required';
      if (!formValues.slotId) newErrors.slotId = 'Time slot is required';
    }
    if (!formValues.bookingDate) newErrors.bookingDate = 'Booking date is required';
    if (!formValues.customerName) newErrors.customerName = 'Customer name is required';
    if (!formValues.customerEmail) newErrors.customerEmail = 'Customer email is required';
    if (!formValues.customerPhone) newErrors.customerPhone = 'Customer phone is required';
    if (formValues.adults < 1) newErrors.adults = 'At least 1 adult is required';

    if (formValues.isCustom) {
      const cd = formValues.customDetails;
      if (!cd.packageName) newErrors['customDetails.packageName'] = 'Package Name is required';
      if (!cd.location)    newErrors['customDetails.location']    = 'Location is required';
      if (!cd.duration)    newErrors['customDetails.duration']    = 'Duration is required';
      if (!cd.selectedTimeSlot) newErrors['customDetails.selectedTimeSlot'] = 'Time Slot is required';
      if (cd.pricePerPerson == null || cd.pricePerPerson < 0)
        newErrors['customDetails.pricePerPerson'] = 'Price per person is required';
      if (cd.childPricePerPerson != null && cd.childPricePerPerson < 0)
        newErrors['customDetails.childPricePerPerson'] = 'Invalid child price';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fill all required fields');
      return;
    }

    setIsSaving(true);
    setSuccess(null);
    
    try {
      // Create booking
      const bookingData: any = {
        productId: formValues.isCustom ? undefined : formValues.productId,
        packageId: formValues.isCustom ? undefined : formValues.packageId,
        slotId:    formValues.slotId,
        selectedTimeSlot: formValues.isCustom
                        ? formValues.customDetails.selectedTimeSlot
                        : formValues.selectedTimeSlot,
        customerName: formValues.customerName,
        customerEmail: formValues.customerEmail,
        customerPhone: formValues.customerPhone,
        adults: formValues.adults,
        children: formValues.children,
        bookingDate: formValues.bookingDate,
        notes: formValues.notes,
        status: formValues.status,
        paymentStatus: formValues.paymentStatus,
        partialPaymentAmount: formValues.partialPaymentAmount,
        additionalDiscount: formValues.additionalDiscount,
        currency: formValues.currency,
      };
      if (formValues.isCustom) {
        bookingData.customDetails = formValues.customDetails;
        if (formValues.customDetails.itinerary?.length) {
          bookingData.customDetails.itinerary = formValues.customDetails.itinerary;
        }
      }
      if (selectedProposal) {
        bookingData.proposalId = selectedProposal.id;
        bookingData.proposalVersion = selectedProposal.version;
        bookingData.partialPaymentAmount = formValues.partialPaymentAmount;
        bookingData.status = formValues.status;
        bookingData.paymentStatus = formValues.paymentStatus;
      } else if (formValues.isCustom) {
        bookingData.customDetails = formValues.customDetails;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/bookings/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bookingData)
      });

      if (!response.ok) {
        throw new Error('Failed to create booking');
      }

      const result = await response.json();
      
      // If sending voucher is enabled
      if (formValues.sendVoucher) {
        const voucherResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/bookings/${result.id}/send-voucher`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!voucherResponse.ok) {
          toast.error('Booking created but failed to send voucher email');
        } else {
          setSuccess('Booking created successfully and voucher email sent!');
        }
      } else {
        setSuccess('Booking created successfully!');
      }
      
      toast.success('Booking created successfully');
      
      // Reset form
      setFormValues({
        isCustom: false,
        customDetails: {},
        productId: '',
        packageId: '',
        slotId: '',
        selectedTimeSlot: '',
        bookingDate: new Date().toISOString().split('T')[0],
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        adults: 1,
        children: 0,
        notes: '',
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        additionalDiscount: 0,
        sendVoucher: true,
        currency: 'INR'
      });
      
      // Redirect to bookings page after a brief delay
      setTimeout(() => {
        navigate('/bookings');
      }, 2000);
      
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error('Failed to create booking');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name.startsWith('customDetails.')) {
      const key = name.split('.')[1];
      setFormValues(prev => ({
        ...prev,
        customDetails: { ...prev.customDetails, [key]: value }
      }));
      return;
    }
    if (name === 'currency') {
      setFormValues(prev => ({
        ...prev,
        currency: value,
        customDetails: {
          ...prev.customDetails,
          pricePerPerson: 0,
          discountValue: 0
        }
      }));
      return;
    } else {
      setFormValues(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleNumberChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: parseInt(value, 10)
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const addItineraryRow = () => {
    setFormValues(prev => {
      const lastItin = prev.customDetails.itinerary?.slice(-1)[0];
      const lastDate = lastItin?.date; 
      const initialDate = lastDate && lastDate > prev.bookingDate
        ? lastDate
        : prev.bookingDate;
      return {
        ...prev,
        customDetails: {
          ...prev.customDetails,
          itinerary: [
            ...(prev.customDetails.itinerary || []),
            { date: initialDate, time: '', activity: '', location: '', remarks: '' }
          ]
        }
      };
    });
  };

  const removeItineraryRow = (index: number) => {
    setFormValues(prev => ({
      ...prev,
      customDetails: {
        ...prev.customDetails,
        itinerary: prev.customDetails.itinerary?.filter((_, i) => i !== index)
      }
    }));
  };

  const handleItineraryChange = (index: number, field: string, value: string) => {
    setFormValues(prev => {
      const itinerary = prev.customDetails.itinerary?.map((row, i) => {
        if (i !== index) return row;
        if (field === 'date') {
          const minDate = prev.bookingDate;
          const prevDate = prev.customDetails.itinerary?.[i - 1]?.date;
          const floor = prevDate && prevDate > minDate ? prevDate : minDate;
          if (value < floor) value = floor;
        }
        return { ...row, [field]: value };
      });
      return { ...prev, customDetails: { ...prev.customDetails, itinerary } };
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/bookings')}
            className="mr-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create Manual Booking</h1>
            <p className="text-gray-600 mt-2">Create a new booking for a customer</p>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 text-green-700 p-4 mb-4">
          <div className="flex items-center">
            <Check className="h-5 w-5 mr-2 text-green-500" />
            <p>{success}</p>
          </div>
        </div>
      )}

      {/* Choose voucher type */}
      <div className="flex space-x-6 mb-4">
        {['Existing','Custom'].map(type => (
          <label key={type} className="flex items-center space-x-2">
            <input
              type="radio"
              checked={type==='Custom'? formValues.isCustom : !formValues.isCustom}
              onChange={() => {
                if (type === 'Custom') {
                  setFormValues({
                    ...defaultFormValues,
                    isCustom: true
                  });
                } else {
                  setFormValues({
                    ...defaultFormValues,
                    isCustom: false
                  });
                }
                setTotalAmount(null);
              }}
            />
            <span>{type} Product</span>
          </label>
        ))}
        {formValues.isCustom && (
          <button
            type="button"
            onClick={() => setProposalModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded mb-4"
          >
            Use Existing Proposal
          </button>
        )}
      </div>

      {proposalModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
          onClick={e=>{
            if (e.target === e.currentTarget) setProposalModalOpen(false);
          }}
        >
          <div
            className="bg-white rounded-lg shadow max-w-3xl w-full p-6"
            onKeyDown={e=>{ if(e.key==='Escape') setProposalModalOpen(false); }}
            tabIndex={-1}
          >
            <h3 className="text-lg font-semibold mb-4">Choose a proposal</h3>
            <div className="mb-3 flex">
              <input
                type="text"
                placeholder="Search by customer / trip name / date…"
                value={proposalSearch}
                onChange={e=>{
                  setProposalSearch(e.target.value);
                  fetchProposals(e.target.value, 0);
                  setProposalPage(0);
                }}
                className="flex-1 px-3 py-2 border rounded"
              />
            </div>
            <div className="overflow-y-auto max-h-80 relative">
              {isProposalLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <div className="animate-spin h-6 w-6 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full"/>
                </div>
              )}
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Customer</th>
                    <th className="p-2 text-left">Trip</th>
                    <th className="p-2 text-left">Version</th>
                    <th className="p-2 text-left">Total</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p:any) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2">{p.customerName}</td>
                      <td className="p-2">{p.customDetails?.packageName}</td>
                      <td className="p-2">v{p.version}</td>
                      <td className="p-2">
                        {currencySymbol(p.currency)}{proposalTotal(p).toLocaleString()}
                      </td>
                      <td className="p-2 space-x-2">
                        <button
                          onClick={() => {
                            setSelectedProposal(p);
                            setFormValues(prev => ({
                              ...prev,
                              isCustom: true,
                              customDetails: p.customDetails,
                              bookingDate:   p.startDate.slice(0,10),
                              adults:        p.adults,
                              children:      p.children,
                              customerName:  p.customerName,
                              customerEmail: p.customerEmail,
                              customerPhone: p.customerPhone,
                              currency:      p.currency,
                            }));
                            setProposalModalOpen(false);
                          }}
                          className="px-3 py-1 bg-[var(--brand-primary)] text-white rounded"
                        >
                          Prefill
                        </button>
                        <button
                          onClick={async()=>{
                            try{
                              const resp = await fetch(
                                `${import.meta.env.VITE_API_URL}/proposals/${p.id}/convert-to-booking`,
                                {
                                  method:'POST',
                                  headers:{Authorization:`Bearer ${token}`}
                                }
                              );
                              if(!resp.ok) throw new Error('convert failed');
                              const { bookingId } = await resp.json() as { bookingId: string };
                              toast.success('Converted to booking!');
                              navigate(`/bookings/${bookingId}`);
                            }catch(err){ toast.error('Conversion failed'); }
                          }}
                          className="px-3 py-1 bg-emerald-600 text-white rounded"
                        >
                          Convert&nbsp;now
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between items-center mt-2 text-sm">
                <button
                  disabled={proposalPage===0}
                  className="px-2 py-1 border rounded disabled:opacity-40"
                  onClick={()=>{
                    const pg = Math.max(0, proposalPage-1);
                    setProposalPage(pg); fetchProposals(proposalSearch,pg);
                  }}
                >Prev</button>
                <span>Page {proposalPage+1}</span>
                <button
                  className="px-2 py-1 border rounded"
                  onClick={()=>{
                    const pg = proposalPage+1;
                    setProposalPage(pg); fetchProposals(proposalSearch,pg);
                  }}
                >Next</button>
              </div>
            </div>
            <div className="text-right mt-4">
              <button
                onClick={()=>setProposalModalOpen(false)}
                className="px-4 py-2 border rounded"
              >Close</button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {selectedProposal && (
          <div className="p-4 bg-amber-50 border-l-4 border-amber-400 text-amber-700 rounded">
            Using <strong>proposal v{selectedProposal.version}</strong>. Fields are read-only.
          </div>
        )}
        <fieldset disabled={!!selectedProposal} className="space-y-8">
          {formValues.isCustom
            ? (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h2 className="text-xl font-semibold mb-4">Custom Voucher Details</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Booking Date */}
                    <div>
                      <label className="block text-sm mb-1">Booking Date *</label>
                      <input
                        type="date"
                        name="bookingDate"
                        value={formValues.bookingDate}
                        onChange={handleInputChange}
                        min={new Date().toISOString().split('T')[0]}
                        required
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>
                    <div>
                    <label className="block text-sm mb-1">Number of Adults *</label>
                    <input
                      type="number"
                      min="1"
                      name="adults"
                      value={formValues.adults}
                      onChange={handleNumberChange}
                      required
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Number of Children</label>
                    <input
                      type="number"
                      min="0"
                      name="children"
                      value={formValues.children}
                      onChange={handleNumberChange}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  {(['packageName','location'] as const).map(k => {
                    const label = k === 'packageName' ? 'Package Name' : 'Location';
                    return (
                      <div key={k}>
                        <label className="block text-sm mb-1">{label} *</label>
                        <input
                          type="text"
                          name={`customDetails.${k}`}
                          value={formValues.customDetails[k] ?? ''}
                          onChange={e => {
                            const v = e.target.value;
                            setFormValues(prev => ({
                              ...prev,
                              customDetails: {
                                ...prev.customDetails,
                                [k]: v
                              }
                            }));
                          }}
                          required
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                    )
                  })}

                  {/* duration + unit */}
                  <div>
                    <label className="block text-sm mb-1">Duration *</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        name="customDetails.duration"
                        value={formValues.customDetails.duration||''}
                        onChange={e=>{
                          const v=e.target.value;
                          setFormValues(prev=>({
                            ...prev,
                            customDetails:{...prev.customDetails,duration:v}
                          }));
                        }}
                        required
                        className="w-2/3 px-3 py-2 border rounded"
                      />
                      <select
                        name="customDetails.durationUnit"
                        value={formValues.customDetails.durationUnit}
                        onChange={e => {
                        const unit = e.target.value as 'hours' | 'days';
                        setFormValues(prev => ({
                          ...prev,
                          customDetails: {
                            ...prev.customDetails,
                            durationUnit: unit
                          }
                        }));
                      }}
                        className="w-1/3 px-3 py-2 border rounded"
                      >
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>

                  {/* free-text Time Slot */}
                  <div>
                    <label className="block text-sm mb-1">Time Slot *</label>
                    <input
                      type="text"
                      name="customDetails.selectedTimeSlot"
                      placeholder="09:30"
                      value={formValues.customDetails.selectedTimeSlot||''}
                      onChange={e=>{
                        const v=e.target.value;
                        setFormValues(prev=>({
                          ...prev,
                          customDetails:{...prev.customDetails,selectedTimeSlot:v}
                        }));
                      }}
                      required
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-1">
                    <label className="block text-sm mb-1">
                      Adult Price&nbsp;/&nbsp;person&nbsp;*
                    </label>
                    <div className="flex rounded border overflow-hidden">
                      <span className="px-3 py-2 bg-gray-50 border-r select-none">
                        {currencySymbol(formValues.currency)}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        name="customDetails.pricePerPerson"
                        value={formValues.customDetails.pricePerPerson ?? 0}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setFormValues(prev => ({
                            ...prev,
                            customDetails: { ...prev.customDetails, pricePerPerson: v }
                          }));
                        }}
                        required
                        className="flex-1 px-3 py-2 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="col-span-1 sm:col-span-1">
                    <label className="block text-sm mb-1">
                      Child&nbsp;Price&nbsp;/&nbsp;person
                    </label>
                    <div className="flex rounded border overflow-hidden">
                      <span className="px-3 py-2 bg-gray-50 border-r select-none">
                        {currencySymbol(formValues.currency)}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        name="customDetails.childPricePerPerson"
                        value={formValues.customDetails.childPricePerPerson ?? 0}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setFormValues(prev => ({
                            ...prev,
                            customDetails: {
                              ...prev.customDetails,
                              childPricePerPerson: v
                            }
                          }));
                        }}
                        className="flex-1 px-3 py-2 focus:outline-none"
                      />
                    </div>
                  </div>
                  
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-sm mb-1">Discount Type</label>
                    <select
                      name="customDetails.discountType"
                      value={formValues.customDetails.discountType}
                      onChange={e => {
                        const v = e.target.value as 'percentage' | 'fixed';
                        setFormValues(prev => ({
                          ...prev,
                          customDetails: { ...prev.customDetails, discountType: v }
                        }));
                      }}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount</option>
                    </select>
                  </div>
          
                  {/* Discount Value */}
                  <div className="col-span-1 sm:col-span-1">
                    <label className="block text-sm mb-1">
                      {formValues.customDetails.discountType === 'percentage'
                        ? 'Discount %'
                        : 'Discount Amount'}
                    </label>
                    <div className="flex rounded border overflow-hidden">
                      {formValues.customDetails.discountType === 'fixed' && (
                        <span className="px-3 py-2 bg-gray-50 border-r select-none">
                          {currencySymbol(formValues.currency)}
                        </span>
                      )}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        name="customDetails.discountValue"
                        value={formValues.customDetails.discountValue ?? 0}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setFormValues(prev => ({
                            ...prev,
                            customDetails: { ...prev.customDetails, discountValue: v }
                          }));
                        }}
                        className="flex-1 px-3 py-2 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <h3 className="text-lg font-medium mb-2">Custom Itinerary</h3>
                    {(formValues.customDetails.itinerary ?? []).map((row, idx) => (
                      <div
                        key={idx}
                      className="grid grid-cols-1 sm:grid-cols-6 gap-2 mb-2"
                      >
                        <input
                          type="date"
                          name={`itinerary.${idx}.date`}
                          value={row.date}
                          onChange={e => handleItineraryChange(idx, 'date', e.target.value)}
                          className="px-2 py-1 border rounded"
                        />
                        <input
                          type="text"
                          placeholder="Time"
                          value={row.time}
                          onChange={e => handleItineraryChange(idx, 'time', e.target.value)}
                          className="px-2 py-1 border rounded"
                        />
                        <input
                          type="text"
                          placeholder="Activity"
                          value={row.activity}
                          onChange={e => handleItineraryChange(idx, 'activity', e.target.value)}
                          className="px-2 py-1 border rounded"
                        />
                        <input
                          type="text"
                          placeholder="Location"
                          value={row.location}
                          onChange={e => handleItineraryChange(idx, 'location', e.target.value)}
                          className="px-2 py-1 border rounded"
                        />
                        <input
                          type="text"
                          placeholder="Remarks"
                          value={row.remarks}
                          onChange={e => handleItineraryChange(idx, 'remarks', e.target.value)}
                          className="px-2 py-1 border rounded"
                        />
                        <button
                          type="button"
                          onClick={() => removeItineraryRow(idx)}
                          className="text-sm text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addItineraryRow}
                      className="mt-2 px-3 py-1 bg-gray-100 rounded text-sm"
                    >
                      + Add Row
                    </button>
                  </div>
                  <div className="col-span-1 sm:col-span-1">
                    <label className="block text-sm mb-1">Currency *</label>
                    <select
                      name="currency"
                      value={formValues.currency}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border rounded"
                    >
                      {['INR','USD','EUR','GBP','AUD','CAD','JPY','SGD','AED','CNY'].map(code => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )
            : (
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <Package className="h-5 w-5 mr-2 text-[var(--brand-primary)]" />
                Product & Package Details
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Product Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product *
                  </label>
                  <select
                    name="productId"
                    value={formValues.productId}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)] ${
                      errors.productId ? 'border-red-300' : 'border-gray-300'
                    }`}
                    required
                  >
                    <option value="">Select a product</option>
                    {products.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.title} ({product.productCode})
                      </option>
                    ))}
                  </select>
                  {errors.productId && <p className="text-red-500 text-xs mt-1">{errors.productId}</p>}
                </div>

                {/* Package Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Package *
                  </label>
                  <select
                    name="packageId"
                    value={formValues.packageId}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)] ${
                      errors.packageId ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={!formValues.productId}
                    required
                  >
                    <option value="">Select a package</option>
                    {filteredPackages.map(pkg => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </option>
                    ))}
                  </select>
                  {errors.packageId && <p className="text-red-500 text-xs mt-1">{errors.packageId}</p>}
                  {filteredPackages.length === 0 && formValues.productId && (
                    <p className="text-amber-500 text-xs mt-1">No packages available for this product</p>
                  )}
                </div>

                {/* Booking Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Booking Date *
                  </label>
                  <input
                    type="date"
                    name="bookingDate"
                    value={formValues.bookingDate}
                    onChange={handleInputChange}
                    min={new Date().toISOString().split('T')[0]}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)] ${
                      errors.bookingDate ? 'border-red-300' : 'border-gray-300'
                    }`}
                    required
                  />
                  {errors.bookingDate && <p className="text-red-500 text-xs mt-1">{errors.bookingDate}</p>}
                </div>

                {/* Time Slot */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time Slot *
                  </label>
                  <select
                    name="slotTime"
                    value={
                      formValues.slotId && formValues.selectedTimeSlot
                        ? JSON.stringify({ slotId: formValues.slotId, time: formValues.selectedTimeSlot })
                        : ''
                    }
                    onChange={e=>{
                      const { slotId, time } = JSON.parse(e.target.value);
                      setFormValues(prev=>({
                        ...prev,
                        slotId, selectedTimeSlot: time
                      }));
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)] ${
                      errors.slotId ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={!formValues.packageId || !formValues.bookingDate}
                    required
                  >
                    <option value="">Select a time slot</option>
                    {filteredTimeSlots.flatMap(slot =>
                      slot.Time.map((time: string) => (
                        <option
                          key={`${slot.id}_${time}`}
                          value={JSON.stringify({ slotId: slot.id, time })}
                        >
                          {time}
                        </option>
                      ))
                    )}
                  </select>
                  {errors.slotId && <p className="text-red-500 text-xs mt-1">{errors.slotId}</p>}
                  {filteredTimeSlots.length === 0 && formValues.packageId && formValues.bookingDate && (
                    <p className="text-amber-500 text-xs mt-1">No time slots available for this date</p>
                  )}
                </div>

                {/* 5. Pricing Tiers */}
                {selectedSlot && (selectedSlot.adultTiers?.length > 0 || selectedSlot.childTiers?.length > 0) && (
                  <div className="mt-4 p-4 col-span-2 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="font-medium text-gray-900 mb-2">Pricing</h3>
                    <div className="text-sm text-gray-700">
                      {(() => {
                        const tierCur = selectedPackage?.currency || formValues.currency;
                        return (
                          <>
                            {selectedSlot.adultTiers?.length > 0 && (
                              <>
                                <div className="mb-1"><strong>Adult:</strong></div>
                                {selectedSlot.adultTiers.map((tier: PricingTier, idx: number) => (
                                  <div key={`adult-tier-${idx}`} className="ml-2">
                                    {tier.min}–{tier.max} {tier.max === 1 ? 'person' : 'people'}: {currencySymbol(tierCur)}{tier.price.toLocaleString()}
                                  </div>
                                ))}
                              </>
                            )}

                            {selectedSlot.childTiers?.length > 0 && (
                              <>
                                <div className="mt-3 mb-1"><strong>Child:</strong></div>
                                {selectedSlot.childTiers.map((tier: PricingTier, idx: number) => (
                                  <div key={`child-tier-${idx}`} className="ml-2">
                                    {tier.min}-{tier.max} {tier.max === 1 ? 'child' : 'children'}: {currencySymbol(tierCur)}{tier.price.toLocaleString()}
                                  </div>
                                ))}
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Number of Adults */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Adults *
                  </label>
                  <input
                    type="number"
                    name="adults"
                    min="1"
                    value={formValues.adults}
                    onChange={handleNumberChange}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)] ${
                      errors.adults ? 'border-red-300' : 'border-gray-300'
                    }`}
                    required
                  />
                  {errors.adults && <p className="text-red-500 text-xs mt-1">{errors.adults}</p>}
                </div>

                {/* Number of Children */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Children
                    {!childrenEnabled && (
                      <span className="text-xs text-gray-400 ml-2">(not available)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    name="children"
                    min="0"
                    max={childrenEnabled ? undefined : 0}
                    value={formValues.children}
                    disabled={!childrenEnabled}
                    onChange={handleNumberChange}
                    className={
                      `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ` +
                      (childrenEnabled
                        ? 'border-gray-300'
                        : 'border-gray-200 bg-gray-100 cursor-not-allowed')
                    }
                  />
                </div>
              </div>
              
              {/* Product Info Display */}
              {formValues.productId && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-2">Product Information</h3>
                  {(() => {
                    const selectedProduct = products.find(p => p.id === formValues.productId);
                    return selectedProduct ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 text-gray-500 mr-2" />
                          <span>{selectedProduct.location}</span>
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-gray-500 mr-2" />
                          <span>{selectedProduct.duration}</span>
                        </div>
                        <div className="flex items-center">
                          <Package className="h-4 w-4 text-gray-500 mr-2" />
                          <span>{selectedProduct.productCode}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
            )
          }
          
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
              <Users className="h-5 w-5 mr-2 text-[var(--brand-primary)]" />
              Customer Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name *
                </label>
                <input
                  type="text"
                  name="customerName"
                  value={formValues.customerName}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)] ${
                    errors.customerName ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                />
                {errors.customerName && <p className="text-red-500 text-xs mt-1">{errors.customerName}</p>}
              </div>

              {/* Customer Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Email *
                </label>
                <input
                  type="email"
                  name="customerEmail"
                  value={formValues.customerEmail}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)] ${
                    errors.customerEmail ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                />
                {errors.customerEmail && <p className="text-red-500 text-xs mt-1">{errors.customerEmail}</p>}
              </div>

              {/* Customer Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Phone *
                </label>
                <input
                  type="tel"
                  name="customerPhone"
                  value={formValues.customerPhone}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)] ${
                    errors.customerPhone ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                />
                {errors.customerPhone && <p className="text-red-500 text-xs mt-1">{errors.customerPhone}</p>}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  name="notes"
                  value={formValues.notes}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  rows={2}
                />
              </div>
            </div>
          </div>
        </fieldset>
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
            <CreditCard className="h-5 w-5 mr-2 text-[var(--brand-primary)]" />
            Booking Status & Payment
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Booking Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Booking Status
              </label>
              <select
                name="status"
                value={formValues.status}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                disabled={!!selectedProposal}
              >
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            {/* Payment Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Status
              </label>
              <select
                name="paymentStatus"
                value={formValues.paymentStatus}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              >
                <option value="PENDING">Payment Pending</option>
                <option value="PARTIAL">Partial</option>
                <option value="PAID">Paid</option>
                <option value="FAILED">Failed</option>
                <option value="REFUNDED">Refunded</option>
              </select>
              {formValues.paymentStatus === 'PARTIAL' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount Paid *
                  </label>
                  <input
                    type="number"
                    name="partialPaymentAmount"
                    min="0"
                    value={formValues.partialPaymentAmount || 0}
                    onChange={handleNumberChange}
                    required
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              )}
            </div>

            {/* Send Voucher */}
            <div className="md:col-span-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="sendVoucher"
                  checked={formValues.sendVoucher}
                  onChange={handleCheckboxChange}
                  disabled={isSaving}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Send booking voucher to customer via email</span>
              </label>
            </div>
          </div>

          {/* Total Amount Display */}
          {totalAmount !== null && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-medium text-gray-900 mb-2">Booking Total</h3>
              <div className="text-2xl font-bold text-[var(--brand-primary)]">
                {currencySymbol(formValues.currency)}{totalAmount.toLocaleString()}
              </div>
              <p className="text-sm text-gray-600">
                {formValues.adults} Adults {formValues.children > 0 ? `, ${formValues.children} Children` : ''}
              </p>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-4 mt-6">
          <button
            type="button"
            onClick={() => navigate('/bookings')}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors disabled:opacity-50 flex items-center"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Processing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Create Booking
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};