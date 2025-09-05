import React, { useState, useEffect } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { toast } from 'react-hot-toast';
import { X, Edit2, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Product, BlockedDate, AvailabilitySubrange } from '../../types';
import { SubrangeEditor } from './SubrangeEditor';

export interface EnhancedBlockDatesModalProps {
  product: Product;
  blockedDates: BlockedDate[];
  subranges: AvailabilitySubrange[];
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const EnhancedBlockDatesModal: React.FC<EnhancedBlockDatesModalProps> = ({
  product,
  blockedDates,
  subranges,
  isOpen,
  onClose,
  onRefresh
}) => {
  const { token } = useAuth();
  const [blockingMode, setBlockingMode] = useState<'single' | 'range'>('single');
  const [selectedRange, setSelectedRange] = useState<DateRange>();
  const [pendingRange, setPendingRange] = useState<DateRange>();
  const [showRangePrompt, setShowRangePrompt] = useState(false);
  const [editingSubrange, setEditingSubrange] = useState<AvailabilitySubrange | undefined>(undefined);

  // Helper function to format date properly to local date string (YYYY-MM-DD)
  const formatDateToLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to create date from date string without timezone issues
  const createLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Filter blocked dates for this product
  const productBlockedDates = blockedDates.filter(
    bd => bd.productId === product.id && bd.isActive === false
  );

  const baseStart = new Date(product.availabilityStartDate);
  const baseEnd = product.availabilityEndDate ? new Date(product.availabilityEndDate) : undefined;

  const modifiers = {
    base: {
      from: baseStart,
      to: baseEnd || new Date(2099, 11, 31)
    },
    soldOut: subranges.filter(r => r.status === 'SOLD_OUT').map(r => ({ 
      from: createLocalDate(r.startDate.split('T')[0]), 
      to: createLocalDate(r.endDate.split('T')[0]) 
    })),
    notOperating: subranges.filter(r => r.status === 'NOT_OPERATING').map(r => ({ 
      from: createLocalDate(r.startDate.split('T')[0]), 
      to: createLocalDate(r.endDate.split('T')[0]) 
    })),
    blocked: productBlockedDates.map(bd => {
      const dateOnly = bd.date.includes('T') ? bd.date.split('T')[0] : bd.date;
      const d = createLocalDate(dateOnly);
      return { from: d, to: d };
    }),
    ...(selectedRange && { selected: selectedRange }),
  };

  // Handle single date click (block/unblock)
  const handleSingleDateSelect = async (date: Date) => {
    const dateStr = formatDateToLocal(date);
    const isBlocked = productBlockedDates.find(bd => bd.date.split('T')[0] === dateStr);
    
    try {
      if (isBlocked) {
        // Unblock the date
        await fetch(`${import.meta.env.VITE_API_URL}/availability/unblock/${isBlocked.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success(`Date ${date.toLocaleDateString('en-IN')} unblocked successfully`);
      } else {
        // Block the date
        const res = await fetch(`${import.meta.env.VITE_API_URL}/availability/block`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            productId: product.id,
            dates: [dateStr],
            reason: 'Blocked via calendar'
          })
        });
        if (!res.ok) throw await res.json();
        toast.success(`Date ${date.toLocaleDateString('en-IN')} blocked successfully`);
      }
      
      
      onRefresh();
    } catch (err: any) {
      toast.error(err.error || 'Failed to update date');
      
    }
  };

  // Handle range selection for blocking multiple dates
  const handleRangeSelect = (range: DateRange | undefined) => {
    setSelectedRange(range);

    if (!range?.from || !range.to) {
      setPendingRange(undefined);
      setShowRangePrompt(false);
      return;
    }

    const from = range.from!;
    const to   = range.to!;
    if (from.getTime() === to.getTime()) {
      setSelectedRange(undefined);
      setPendingRange(undefined);
      setShowRangePrompt(false);
      return;
    }

    const overlap = subranges.find(r => {
      const rStart = createLocalDate(r.startDate.split('T')[0]);
      const rEnd   = createLocalDate(r.endDate.split('T')[0]);
      return !(to < rStart || from > rEnd);

    });
    if (overlap) {
      toast.error(
        `Cannot overlap existing ${
          overlap.status === 'SOLD_OUT' ? 'Sold Out' : 'Not Operating'
        } dates.`
      );
      setSelectedRange(undefined);
      setPendingRange(undefined);
      setShowRangePrompt(false);
      return;
    }

    setPendingRange(range);
    setShowRangePrompt(true);
  };

  const markRange = async (
    range: DateRange,
    status: 'SOLD_OUT' | 'NOT_OPERATING'
    ) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/availability/subrange`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            productId: product.id,
            startDate: formatDateToLocal(range.from!),
            endDate: formatDateToLocal(range.to!),
            status,
          }),
        }
      );
      if (!res.ok) throw await res.json();
      toast.success(
        `Date range marked as ${
          status === 'SOLD_OUT' ? 'Sold Out' : 'Not Operating'
        }`
      );
      
      setShowRangePrompt(false);
      setPendingRange(undefined);
      setSelectedRange(undefined);
      onRefresh();
    } catch (err: any) {
      toast.error(err.error || 'Failed to create range');
      
    }
  };


  // Handle deleting a subrange
  const handleDeleteSubrange = async (subrangeId: string) => {
    if (!window.confirm('Are you sure you want to do this?')) return;
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/availability/subrange/${subrangeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) throw await res.json();
      toast.success('Availability changed deleted successfully');
      
      onRefresh();
    } catch (err: any) {
      toast.error(err.error || 'Failed to change availability');
      
    }
  };

  // Handle editing a subrange
  const handleEditSubrange = (subrange: AvailabilitySubrange) => {
    setEditingSubrange(subrange);
  };

  useEffect(() => {
    if (!isOpen) {
      
      
      setSelectedRange(undefined);
      setEditingSubrange(undefined);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Block Dates</h3>
            <p className="text-sm text-gray-600 mt-1">
              {product.title} ({product.productCode})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {/* Blocking Options */}
          <div className="border border-gray-200 rounded-lg p-3">
            {/* 1. Radio group */}
            <div className="flex flex-col sm:flex-row sm:space-x-6 space-y-2 sm:space-y-0 mb-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="blockingMode"
                  value="single"
                  checked={blockingMode === 'single'}
                  onChange={e => setBlockingMode(e.target.value as 'single' | 'range')}
                  className="w-4 h-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] focus:ring-2"
                />
                <span className="text-base font-medium text-gray-900">Block / Unblock a Date</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="blockingMode"
                  value="range"
                  checked={blockingMode === 'range'}
                  onChange={e => setBlockingMode(e.target.value as 'single' | 'range')}
                  className="w-4 h-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] focus:ring-2"
                />
                <span className="text-base font-medium text-gray-900">Block Multiple Dates</span>
              </label>
            </div>

            {/* 2. Conditionally render one calendar */}
            {blockingMode === 'single' ? (
              <div>
                <p className="text-sm text-gray-600 mb-4 pl-1">
                  Click on a date to block or unblock it.
                </p>
                <div className="bg-gray-50 rounded-lg overflow-x-auto">
                  <DayPicker
                    mode="single"
                    defaultMonth={baseStart}
                    fromDate={baseStart}
                    toDate={baseEnd}
                    modifiers={modifiers}
                    modifiersStyles={{
                        base: { backgroundColor: '#22c55e', color: 'white' },
                        soldOut: { backgroundColor: '#fca5a5', color: '#7f1d1d' },
                        notOperating: { backgroundColor: '#fbbf24', color: '#92400e' },
                        blocked: { backgroundColor: '#7f1d1d', color: 'white' },
                    }}
                    onSelect={(date: Date | undefined) => date && handleSingleDateSelect(date)}
                    classNames={{
                        month: "w-full",
                        nav: "w-full flex items-center justify-between",
                        caption: "text-center font-semibold mb-4",
                        table: "w-full border-collapse",
                        head_row: "items-center text-gray-400",
                        day: "w-10 h-10 items-center justify-center ml-1 mt-1 rounded-full hover:ring-2 hover:ring-[var(--brand-secondary)] hover:ring-opacity-50 cursor-pointer transition-all duration-200",
                        day_today: "border border-[var(--brand-secondary)]",
                    }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-4 pl-1">
                  Select a date range by clicking start and end dates.
                </p>
                <div className="bg-gray-50 rounded-lg overflow-x-auto">
                  <DayPicker
                    mode="range"
                    selected={selectedRange}
                    defaultMonth={baseStart}
                    fromDate={baseStart}
                    toDate={baseEnd}
                    modifiers={modifiers}
                    modifiersStyles={{
                      base: { backgroundColor: '#22c55e', color: 'white' },
                      soldOut: { backgroundColor: '#fca5a5', color: '#7f1d1d' },
                      notOperating: { backgroundColor: '#fbbf24', color: '#92400e' },
                      blocked: { backgroundColor: '#7f1d1d', color: 'white' },
                      selected: { 
                        backgroundColor: '#1d4ed8 !important', 
                        color: 'white !important', 
                        fontWeight: 'bold !important',
                        borderRadius: '50% !important',
                        width: '40px !important',
                        height: '40px !important',
                        display: 'flex !important',
                        alignItems: 'center !important',
                        justifyContent: 'center !important'
                      },
                    }}
                    modifiersClassNames={{
                      selected: 'selected-range-day'
                    }}
                    onSelect={handleRangeSelect}
                    classNames={{
                      month: "w-full",
                      nav: "w-full flex items-center justify-between",
                      caption: "text-center font-semibold mb-4",
                      table: "w-full border-collapse",
                      head_row: "items-center text-gray-400",
                      day: "w-10 h-10 items-center justify-center ml-1 mt-1 rounded-full hover:ring-2 hover:ring-[var(--brand-secondary)] hover:ring-opacity-50",
                      day_today: "border border-[var(--brand-secondary)]",
                      day_selected: "!bg-blue-700 !text-white",
                      day_range_start: "!bg-blue-700 !text-white",
                      day_range_end: "!bg-blue-700 !text-white",
                      day_range_middle: "!bg-blue-700 !text-white",
                    }}
                  />
                  {showRangePrompt && pendingRange && (
                    <div className="mt-4 flex items-center gap-4">
                      <span className="text-sm">Mark selected range as:</span>
                      <button
                        className="px-3 py-1 bg-yellow-400 text-white rounded"
                        onClick={() => markRange(pendingRange, 'NOT_OPERATING')}
                      >
                        Not Operating
                      </button>
                      <button
                        className="px-3 py-1 bg-red-400 text-white rounded"
                        onClick={() => markRange(pendingRange, 'SOLD_OUT')}
                      >
                        Sold Out
                      </button>
                      <button
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded"
                        onClick={() => {
                          setShowRangePrompt(false);
                          setPendingRange(undefined);
                          setSelectedRange(undefined);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 rounded-full bg-green-500"></div>
                <span className="text-gray-700">Available</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 rounded-full bg-red-300"></div>
                <span className="text-gray-700">Sold Out</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 rounded-full bg-yellow-400"></div>
                <span className="text-gray-700">Not Operating</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 rounded-full bg-red-800"></div>
                <span className="text-gray-700">Blocked</span>
              </div>
              {blockingMode === 'range' && (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                  <span className="text-gray-700">Selected Range</span>
                </div>
              )}
            </div>
          </div>

          {subranges.length > 0 && (
            <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
              {productBlockedDates.length > 0 && (
                <>
                  <h5 className="text-sm font-medium text-red-800 mb-3">
                    Currently Blocked Dates ({productBlockedDates.length})
                  </h5>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {productBlockedDates.slice(0, 10).map(bd => (
                      <span
                        key={bd.id}
                        className="inline-flex items-center px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full border border-red-200"
                      >
                        {new Date(bd.date).toLocaleDateString('en-IN')}
                      </span>
                    ))}
                    {productBlockedDates.length > 10 && (
                      <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                        +{productBlockedDates.length - 10} more
                      </span>
                    )}
                  </div>
                </>
              )}
              <h5 className="text-sm font-semibold text-red-800 mb-3">
                Unavailable Date Ranges
              </h5>
              <div className="space-y-2">
                {subranges.map(subrange => (
                  <div key={subrange.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        subrange.status === 'SOLD_OUT' ? 'bg-red-500' : 'bg-yellow-500'
                      }`}></div>
                      <span className="text-sm font-medium text-gray-800">
                        {createLocalDate(subrange.startDate.split('T')[0]).toLocaleDateString('en-IN')} – {createLocalDate(subrange.endDate.split('T')[0]).toLocaleDateString('en-IN')}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        subrange.status === 'SOLD_OUT' 
                          ? 'bg-red-100 text-red-800 border border-red-200' 
                          : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                      }`}>
                        {subrange.status === 'SOLD_OUT' ? 'Sold Out' : 'Not Operating'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditSubrange(subrange)}
                        className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                        title="Edit range"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteSubrange(subrange.id)} 
                        className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                        title="Delete range"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Subrange Editor Modal */}
      {editingSubrange && (
        <SubrangeEditor
          productId={product.id}
          subrange={editingSubrange}
          onSave={() => {
            setEditingSubrange(undefined);
            onRefresh();
          }}
          onClose={() => setEditingSubrange(undefined)}
        />
      )}
    </div>
  );
};
