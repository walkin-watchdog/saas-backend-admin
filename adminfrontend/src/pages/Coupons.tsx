import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Tag,
  Percent,
  DollarSign,
  Tag as TagIcon,
  Calendar,
  Users,
  BarChart,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { CouponData, Product } from '@/types';

export const Coupons = () => {
  const { token, user } = useAuth();
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [filteredCoupons, setFilteredCoupons] = useState<CouponData[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CouponData>({
    code: '',
    description: '',
    type: 'PERCENTAGE',
    value: 0,
    minAmount: null,
    maxDiscount: null,
    currency: 'INR',
    usageLimit: null,
    usedCount: 0,
    isActive: true,
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
    products: []
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  
  // States for coupon usage details
  const [, setSelectedCouponId] = useState<string | null>(null);
  const [usageDetails, setUsageDetails] = useState<any[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);

  const getSymbol = (currency: string) => {
    switch (currency.toUpperCase()) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'INR': return '₹';
      default: return currency.toUpperCase();
    }
  };

  useEffect(() => {
    fetchCoupons();
    fetchProducts();
  }, [token]);

  useEffect(() => {
    if (searchTerm || statusFilter || typeFilter) {
      const filtered = coupons.filter(coupon => {
        const matchesSearch = 
          coupon.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          coupon.description.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = !statusFilter || 
          (statusFilter === 'active' && coupon.isActive) ||
          (statusFilter === 'inactive' && !coupon.isActive);
        
        const matchesType = !typeFilter || coupon.type === typeFilter;
        
        return matchesSearch && matchesStatus && matchesType;
      });
      setFilteredCoupons(filtered);
    } else {
      setFilteredCoupons(coupons);
    }
  }, [searchTerm, statusFilter, typeFilter, coupons]);

  const fetchCoupons = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/coupons`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setCoupons(data);
        setFilteredCoupons(data);
      } else {
        toast.error('Failed to load coupons');
      }
    } catch (error) {
      console.error('Error fetching coupons:', error);
      toast.error('Error loading coupons');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/products`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchCouponUsage = async (couponId: string) => {
    setIsLoadingUsage(true);
    setSelectedCouponId(couponId);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/coupons/${couponId}/usage`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsageDetails(data);
        setShowUsageModal(true);
      } else {
        toast.error('Failed to load coupon usage details');
      }
    } catch (error) {
      console.error('Error fetching coupon usage:', error);
      toast.error('Error loading coupon usage details');
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const validateForm = () => {
    const errors: {[key: string]: string} = {};
    
    if (!formData.code.trim()) {
      errors.code = 'Coupon code is required';
    }
    
    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }
    
    if (formData.type === 'PERCENTAGE') {
      if (formData.value <= 0 || formData.value > 100) {
        errors.value = 'Percentage must be between 1 and 100';
      }
    } else {
      if (formData.value <= 0) {
        errors.value = 'Amount must be greater than 0';
      }
    }
    
    if (formData.minAmount !== undefined && formData.minAmount !== null && formData.minAmount < 0) {
      errors.minAmount = 'Minimum amount cannot be negative';
    }
    
    if (formData.maxDiscount !== undefined && formData.maxDiscount !== null && formData.maxDiscount < 0) {
      errors.maxDiscount = 'Maximum discount cannot be negative';
    }
    
    if (formData.usageLimit !== undefined && formData.usageLimit !== null && formData.usageLimit < 1) {
      errors.usageLimit = 'Usage limit must be at least 1';
    }
    
    if (!formData.validFrom) {
      errors.validFrom = 'Valid from date is required';
    }
    
    if (!formData.validUntil) {
      errors.validUntil = 'Valid until date is required';
    } else if (new Date(formData.validUntil) <= new Date(formData.validFrom)) {
      errors.validUntil = 'End date must be after start date';
    }
    
    setErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Prepare the data
      const couponData = {
        code: formData.code.toUpperCase(),
        description: formData.description,
        type: formData.type,
        value: Number(formData.value),
        currency: formData.currency,
        minAmount: formData.minAmount !== null ? Number(formData.minAmount) : null,
        maxDiscount: formData.maxDiscount !== null ? Number(formData.maxDiscount) : null,
        usageLimit: formData.usageLimit !== null ? Number(formData.usageLimit) : null,
        isActive: formData.isActive,
        validFrom: formData.validFrom,
        validUntil: formData.validUntil,
        products: formData.products
      };
      
      let response;
      
      if (isEditing && formData.id) {
        // Update existing coupon
        response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/coupons/${formData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(couponData),
        });
      } else {
        // Create new coupon
        response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/coupons`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(couponData),
        });
      }
      
      if (response.ok) {
        toast.success(isEditing ? 'Coupon updated successfully' : 'Coupon created successfully');
        setIsModalOpen(false);
        fetchCoupons();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to process request');
      }
    } catch (error) {
      console.error('Error processing request:', error);
      toast.error('An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditCoupon = (coupon: CouponData) => {
    setIsEditing(true);
    setFormData({
      ...coupon,
      validFrom: new Date(coupon.validFrom).toISOString().split('T')[0],
      validUntil: new Date(coupon.validUntil).toISOString().split('T')[0],
      currency: coupon.currency || 'INR',
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleAddCoupon = () => {
    setIsEditing(false);
    setFormData({
      code: '',
      description: '',
      type: 'PERCENTAGE',
      value: 0,
      minAmount: null,
      maxDiscount: null,
      usageLimit: null,
      currency: 'INR',
      usedCount: 0,
      isActive: true,
      validFrom: new Date().toISOString().split('T')[0],
      validUntil: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      products: []
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!confirm('Are you sure you want to delete this coupon?')) {
      return;
    }
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/coupons/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        toast.success('Coupon deleted successfully');
        fetchCoupons();
      } else {
        toast.error('Failed to delete coupon');
      }
    } catch (error) {
      console.error('Error deleting coupon:', error);
      toast.error('An error occurred');
    }
  };

  const toggleCouponStatus = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/coupons/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          isActive: !currentStatus
        }),
      });
      
      if (response.ok) {
        toast.success(`Coupon ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
        fetchCoupons();
      } else {
        toast.error('Failed to update coupon status');
      }
    } catch (error) {
      console.error('Error updating coupon status:', error);
      toast.error('An error occurred');
    }
  };

  const handleProductSelect = (productId: string) => {
    setFormData(prev => {
      const updatedProducts = prev.products ? [...prev.products] : [];
      
      if (updatedProducts.includes(productId)) {
        return {
          ...prev,
          products: updatedProducts.filter(id => id !== productId)
        };
      } else {
        return {
          ...prev,
          products: [...updatedProducts, productId]
        };
      }
    });
  };

  const isCouponExpired = (validUntil: string) => {
    return new Date(validUntil) < new Date();
  };

  const isCouponActive = (coupon: CouponData) => {
    if (!coupon.isActive) return false;
    if (isCouponExpired(coupon.validUntil)) return false;
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return false;
    return true;
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
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Coupon Management</h1>
          <p className="text-gray-600 mt-2">Create and manage discount coupons</p>
        </div>
        {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
          <button
            onClick={handleAddCoupon}
            className="flex items-center px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Coupon
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search coupons..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          >
            <option value="">All Types</option>
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED">Fixed Amount</option>
          </select>
        </div>
      </div>

      {/* Coupons List */}
      {filteredCoupons.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Tag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Coupons Found</h3>
          <p className="text-gray-600 mb-6">
            {searchTerm || statusFilter || typeFilter 
              ? "No coupons match your search criteria"
              : "You haven't created any coupons yet"}
          </p>
          {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
            <button
              onClick={handleAddCoupon}
              className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors inline-flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Coupon
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCoupons.map((coupon) => {
            const isActive = isCouponActive(coupon);
            const isExpired = isCouponExpired(coupon.validUntil);
            const isLimitReached = coupon.usageLimit && coupon.usedCount >= coupon.usageLimit;
            
            return (
              <div 
                key={coupon.id} 
                className={`bg-white rounded-lg shadow-sm p-6 border-l-4 ${
                  !coupon.isActive 
                    ? 'border-gray-300'
                    : isExpired
                    ? 'border-red-500'
                    : isLimitReached
                    ? 'border-orange-500'
                    : 'border-green-500'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center">
                      <span className="text-lg font-bold text-gray-900">{coupon.code}</span>
                      {isExpired && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">Expired</span>
                      )}
                      {isLimitReached && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">Limit Reached</span>
                      )}
                      {!coupon.isActive && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-800 rounded">Inactive</span>
                      )}
                      {isActive && !isExpired && !isLimitReached && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">Active</span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm mt-1">{coupon.description}</p>
                  </div>
                  <div className={`flex items-center justify-center rounded-full p-2 ${
                    coupon.type === 'PERCENTAGE' ? 'bg-blue-100' : 'bg-green-100'
                  }`}>
                    {coupon.type === 'PERCENTAGE' 
                      ? <Percent className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                      : <DollarSign className={`h-5 w-5 ${isActive ? 'text-green-600' : 'text-gray-400'}`} />
                    }
                  </div>
                </div>
                
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <div className="flex items-center text-3xl font-bold mb-1">
                    {coupon.type === 'PERCENTAGE' 
                      ? <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>{coupon.value}%</span>
                      : <span className={isActive ? 'text-green-600' : 'text-gray-400'}>{getSymbol(coupon.currency)}{coupon.value}</span>
                    }
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {coupon.minAmount && (
                      <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                        Min: {getSymbol(coupon.currency)}{coupon.minAmount}
                      </span>
                    )}
                    {coupon.maxDiscount && coupon.type === 'PERCENTAGE' && (
                      <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                        Max: {getSymbol(coupon.currency)}{coupon.maxDiscount}
                      </span>
                    )}
                    {coupon.usageLimit && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        coupon.usedCount >= coupon.usageLimit
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        Used: {coupon.usedCount}/{coupon.usageLimit}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="flex items-center text-gray-600 mb-2">
                      <Calendar className="h-4 w-4 mr-1" />
                      <span>
                        {new Date(coupon.validFrom).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center text-gray-600 mb-2">
                      <Calendar className="h-4 w-4 mr-1" />
                      <span>
                        {new Date(coupon.validUntil).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => handleEditCoupon(coupon)}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit Coupon"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCoupon(coupon.id!)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete Coupon"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => fetchCouponUsage(coupon.id!)}
                      className="p-2 text-gray-400 hover:text-[var(--brand-secondary)] transition-colors"
                      title="View Usage Details"
                    >
                      <BarChart className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={coupon.isActive}
                        onChange={() => toggleCouponStatus(coupon.id!, coupon.isActive)}
                      />
                      <div className={`w-11 h-6 ${
                        coupon.isActive ? 'bg-[var(--brand-primary)]' : 'bg-gray-200'
                      } peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all`}></div>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Coupon Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-h-90vh w-full max-w-3xl overflow-y-auto m-4">
            <div className="flex justify-between items-center px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                {isEditing ? 'Edit Coupon' : 'Create New Coupon'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Coupon Code *
                      </label>
                      <input
                        type="text"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
                          errors.code ? 'border-red-300' : 'border-gray-300'
                        }`}
                        placeholder="e.g., SUMMER2024"
                      />
                      {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description *
                      </label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
                          errors.description ? 'border-red-300' : 'border-gray-300'
                        }`}
                        placeholder="e.g., Summer Season Special Discount"
                      />
                      {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
                    </div>
                  </div>
                </div>
                
                {/* Discount Settings */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Discount Settings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Discount Type *
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, type: 'PERCENTAGE' })}
                          className={`flex items-center justify-center border rounded-md p-3 ${
                            formData.type === 'PERCENTAGE'
                              ? 'border-[var(--brand-primary)] bg-orange-50'
                              : 'border-gray-300 hover:border-[var(--brand-primary)]'
                          }`}
                        >
                          <Percent className="h-5 w-5 mr-2 text-blue-600" />
                          <span>Percentage</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, type: 'FIXED' })}
                          className={`flex items-center justify-center border rounded-md p-3 ${
                            formData.type === 'FIXED'
                              ? 'border-[var(--brand-primary)] bg-orange-50'
                              : 'border-gray-300 hover:border-[var(--brand-primary)]'
                          }`}
                        >
                          <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                          <span>Fixed Amount</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Currency *
                      </label>
                      <select
                        value={formData.currency}
                        onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] border-gray-300"
                      >
                        <option value="INR">INR - ₹</option>
                        <option value="USD">USD - $</option>
                        <option value="EUR">EUR - €</option>
                        <option value="GBP">GBP - £</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {formData.type === 'PERCENTAGE' ? 'Discount Percentage *' : 'Discount Amount *'} 
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={formData.value || ''}
                          min="0"
                          max={formData.type === 'PERCENTAGE' ? 100 : undefined}
                          onChange={(e) => setFormData({ ...formData, value: parseInt(e.target.value) || 0 })}
                          className={`w-full ${formData.type === 'PERCENTAGE' ? 'pr-8' : 'pl-8'} px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
                            errors.value ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder={formData.type === 'PERCENTAGE' ? "e.g., 10" : "e.g., ${getSymbol(formData.currency)}500"}
                        />
                        {formData.type === 'PERCENTAGE' ? (
                          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-gray-500">%</span>
                          </div>
                        ) : (
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500">{getSymbol(formData.currency)}</span>
                          </div>
                        )}
                      </div>
                      {errors.value && <p className="mt-1 text-xs text-red-600">{errors.value}</p>}
                    </div>
                  </div>
                </div>
                
                {/* Additional Constraints */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Additional Constraints</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimum Purchase Amount
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={formData.minAmount !== null ? formData.minAmount : ''}
                          min="0"
                          onChange={(e) => {
                            const value = e.target.value.trim() === '' ? null : parseInt(e.target.value);
                            setFormData({ ...formData, minAmount: value });
                          }}
                          className={`w-full pl-8 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
                            errors.minAmount ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="Optional"
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500">{getSymbol(formData.currency)}</span>
                        </div>
                      </div>
                      {errors.minAmount && <p className="mt-1 text-xs text-red-600">{errors.minAmount}</p>}
                    </div>
                    
                    {formData.type === 'PERCENTAGE' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Maximum Discount Amount
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={formData.maxDiscount !== null ? formData.maxDiscount : ''}
                            min="0"
                            onChange={(e) => {
                              const value = e.target.value.trim() === '' ? null : parseInt(e.target.value);
                              setFormData({ ...formData, maxDiscount: value });
                            }}
                            className={`w-full pl-8 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
                              errors.maxDiscount ? 'border-red-300' : 'border-gray-300'
                            }`}
                            placeholder="Optional"
                          />
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500">{getSymbol(formData.currency)}</span>
                          </div>
                        </div>
                        {errors.maxDiscount && <p className="mt-1 text-xs text-red-600">{errors.maxDiscount}</p>}
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Usage Limit
                      </label>
                      <input
                        type="number"
                        value={formData.usageLimit !== null ? formData.usageLimit : ''}
                        min="1"
                        onChange={(e) => {
                          const value = e.target.value.trim() === '' ? null : parseInt(e.target.value);
                          setFormData({ ...formData, usageLimit: value });
                        }}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
                          errors.usageLimit ? 'border-red-300' : 'border-gray-300'
                        }`}
                        placeholder="No limit if empty"
                      />
                      {errors.usageLimit && <p className="mt-1 text-xs text-red-600">{errors.usageLimit}</p>}
                    </div>
                  </div>
                </div>
                
                {/* Validity Period */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Validity Period</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Valid From *
                      </label>
                      <input
                        type="date"
                        value={formData.validFrom}
                        onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
                          errors.validFrom ? 'border-red-300' : 'border-gray-300'
                        }`}
                      />
                      {errors.validFrom && <p className="mt-1 text-xs text-red-600">{errors.validFrom}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Valid Until *
                      </label>
                      <input
                        type="date"
                        value={formData.validUntil}
                        min={formData.validFrom}
                        onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
                          errors.validUntil ? 'border-red-300' : 'border-gray-300'
                        }`}
                      />
                      {errors.validUntil && <p className="mt-1 text-xs text-red-600">{errors.validUntil}</p>}
                    </div>
                  </div>
                </div>
                
                {/* Product Selection */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-md font-semibold text-gray-900">Apply To</h4>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, products: [] })}
                        className={`px-3 py-1 text-xs rounded-md ${
                          !formData.products || formData.products.length === 0
                            ? 'bg-[var(--brand-primary)] text-white'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        All Products
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, products: products.map(p => p.id) })}
                        className={`px-3 py-1 text-xs rounded-md ${
                          formData.products && formData.products.length === products.length
                            ? 'bg-[var(--brand-primary)] text-white'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        Select All
                      </button>
                    </div>
                  </div>
                  
                  {(!formData.products || formData.products.length === 0) ? (
                    <div className="bg-blue-50 text-blue-800 p-4 rounded-md">
                      <div className="flex">
                        <TagIcon className="h-5 w-5 mr-2" />
                        <p>This coupon will be applicable to all products.</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="bg-gray-50 p-4 rounded-md max-h-60 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {products.map(product => (
                            <div key={product.id} className="flex items-center">
                              <input
                                type="checkbox"
                                id={`product-${product.id}`}
                                checked={formData.products?.includes(product.id) || false}
                                onChange={() => handleProductSelect(product.id)}
                                className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                              />
                              <label htmlFor={`product-${product.id}`} className="ml-2 block text-sm text-gray-700">
                                {product.title}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {formData.products.length} of {products.length} products selected
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Status Toggle */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      Coupon Status
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={formData.isActive}
                        onChange={() => setFormData({ ...formData, isActive: !formData.isActive })}
                      />
                      <div className={`w-11 h-6 ${
                        formData.isActive ? 'bg-[var(--brand-primary)]' : 'bg-gray-200'
                      } rounded-full peer peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--brand-primary)]/20 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all`}></div>
                      <span className="ml-3 text-sm font-medium text-gray-700">
                        {formData.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </label>
                  </div>
                </div>
                
                {/* Submit Button */}
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : isEditing ? 'Update Coupon' : 'Create Coupon'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Usage Details Modal */}
      {showUsageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Coupon Usage Details
              </h3>
              <button
                onClick={() => setShowUsageModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              {isLoadingUsage ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-primary)]"></div>
                </div>
              ) : usageDetails.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No usage data available for this coupon</p>
                </div>
              ) : (
                <>
                  <div className="mb-6 flex justify-between items-center">
                    <h4 className="font-semibold text-gray-900">Usage History</h4>
                    <div className="text-sm text-gray-600">
                      Total Uses: {usageDetails.length}
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Used</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Booking ID</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discount Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {usageDetails.map((usage, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">
                              {new Date(usage.createdAt).toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm">
                              <a href={`/bookings/${usage.bookingId}`} className="text-[var(--brand-primary)] hover:underline">
                                {usage.bookingCode}
                              </a>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                              {usage.customerName}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                              {getSymbol(usage.currency)}{usage.discountAmount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};