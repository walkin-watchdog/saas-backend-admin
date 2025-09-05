import React, { useState } from 'react';
import { Calendar, Clock, Users, MapPin } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Product, BlockedDate, AvailabilitySubrange } from '../../types';
import { getBlockedDatesCount } from '../../utils/availabilityHelpers';
import { EnhancedBlockDatesModal } from './BlockDates';

export interface ProductCardProps {
  product: Product;
  blockedDates: BlockedDate[];
  subranges: AvailabilitySubrange[];
  onRefresh: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  blockedDates,
  subranges,
  onRefresh
}) => {
  const { token, user } = useAuth();
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const blockedCount = getBlockedDatesCount(blockedDates, product.id);
  
  // Get current effective status
  const getEffectiveStatus = () => {
    if (product.permanentAvailabilityStatus) {
      return product.permanentAvailabilityStatus;
    }
    return product.availabilityStatus;
  };

  const effectiveStatus = getEffectiveStatus();

  // Handle status updates
  const handleStatusUpdate = async (newStatus: 'AVAILABLE' | 'SOLD_OUT' | 'NOT_OPERATING') => {
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/availability/product/${product.id}/override`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          status: newStatus === 'AVAILABLE' ? 'AVAILABLE' : newStatus 
        })
      });
      onRefresh();
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Show confirmation, then call handleStatusUpdate
  const handleStatusChange = (newStatus: 'AVAILABLE' | 'SOLD_OUT' | 'NOT_OPERATING') => {
    let label = '';
    switch (newStatus) {
      case 'AVAILABLE':     label = 'AVAILABLE';     break;
      case 'SOLD_OUT':      label = 'SOLD OUT';      break;
      case 'NOT_OPERATING': label = 'NOT OPERATING'; break;
    }
    if (window.confirm(`Are you sure you want to mark this product as "${label}"?`)) {
      handleStatusUpdate(newStatus);
    }
  };

  // Get status styling
  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'SOLD_OUT':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'NOT_OPERATING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return 'AVAILABLE';
      case 'SOLD_OUT':
        return 'SOLD OUT';
      case 'NOT_OPERATING':
        return 'NOT OPERATING';
      default:
        return status;
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
        {/* Card Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {product.title}
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                ({product.productCode})
              </p>
              
              {/* Product Details */}
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{product.location}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>{product.duration}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>Max {product.capacity}</span>
                </div>
                {blockedCount > 0 && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-red-500" />
                    <span className="text-red-600 font-medium">{blockedCount} blocked dates</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Status Badge */}
            <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusStyles(effectiveStatus)}`}>
              {getStatusText(effectiveStatus)}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
          <div className="p-6">
            <div className="flex flex-wrap gap-3">
              <h4 className="text-sm font-medium text-gray-700 w-full mb-2">Mark as:</h4>
              
              {/* Available Button */}
              {effectiveStatus !== 'AVAILABLE' && (
                <button
                  onClick={() => handleStatusChange('AVAILABLE')}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {isUpdating ? 'Updating...' : 'Available'}
                </button>
              )}
              
              {/* Not Operating Button */}
              {effectiveStatus !== 'NOT_OPERATING' && (
                <button
                  onClick={() => handleStatusChange('NOT_OPERATING')}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-orange-400 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {isUpdating ? 'Updating...' : 'Not operating'}
                </button>
              )}
              
              {/* Sold Out Button */}
              {effectiveStatus !== 'SOLD_OUT' && (
                <button
                  onClick={() => handleStatusChange('SOLD_OUT')}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {isUpdating ? 'Updating...' : 'Sold out'}
                </button>
              )}
              
              {/* Block Dates Button */}
              <button
                onClick={() => setIsBlockModalOpen(true)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                More
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Block Dates Modal */}
      <EnhancedBlockDatesModal
        product={product}
        blockedDates={blockedDates}
        subranges={subranges.filter(sr => sr.productId === product.id)}
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        onRefresh={onRefresh}
      />
    </>
  );
};
