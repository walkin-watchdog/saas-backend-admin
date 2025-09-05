import React, { useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { type AvailabilitySubrange } from '../../types/index.ts';
import { Edit2, Trash2 } from 'lucide-react';

export interface CalendarRangesProps {
  productId: string;
  baseStart: Date;
  baseEnd?: Date;
  subranges: AvailabilitySubrange[];
  blockedDates?: { date: string; reason?: string }[];
  blockingMode: 'single' | 'range';
  onCreate: (r: Omit<AvailabilitySubrange, 'id'> & { status: 'SOLD_OUT' | 'NOT_OPERATING' }) => void;
  onEdit?: (sub: AvailabilitySubrange) => void;
  onDelete: (id: string) => void;
  onSingleDateSelect: (date: string) => void;
}

export const CalendarRanges: React.FC<CalendarRangesProps> = ({
  productId,
  baseStart,
  baseEnd,
  subranges,
  blockedDates = [],
  blockingMode,
  onCreate,
  onEdit,
  onDelete,
  onSingleDateSelect
}) => {
  const [selectedRange, setSelectedRange] = useState<DateRange>();
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>();
  const [showRangePrompt, setShowRangePrompt] = useState(false);

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
    blocked: blockedDates.map(bd => {
      const d = createLocalDate(bd.date);
      return { from: d, to: d };
    }),
    ...(selectedRange && { selected: selectedRange }),
  };

  // Handler for confirming the range status
  const markRange = async (range: DateRange, status: 'SOLD_OUT' | 'NOT_OPERATING') => {
    if (range.from && range.to && range.from.getTime() !== range.to.getTime()) {
      onCreate({
        productId,
        startDate: formatDateToLocal(range.from),
        endDate: formatDateToLocal(range.to),
        status
      });
    }
  };

  return (
    <div>
      {blockingMode === 'single' ? (
        <div className="overflow-x-auto">
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
              selected: { 
                backgroundColor: '#1d4ed8', 
                color: 'white', 
                fontWeight: 'bold',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
            }}
            classNames={{
              month: "w-full",
              nav: "w-full flex items-center justify-between",
              caption: "text-center font-semibold mb-4",
              table: "border-collapse w-full",
              head_row: "items-center text-gray-400",
              day: "w-10 h-10 items-center justify-center ml-1 mt-1 rounded-full hover:ring-2 hover:ring-[var(--brand-secondary)] hover:ring-opacity-50",
              day_today: "border border-[var(--brand-secondary)]",
            }}
            onSelect={(date: Date | undefined) => {
              if (!date) return;
              onSingleDateSelect(formatDateToLocal(date));
            }}
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <DayPicker
              selected={pendingRange || selectedRange}
              mode="range"
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
              classNames={{
                month: "w-full",
                nav: "w-full flex items-center justify-between",
                caption: "text-center font-semibold mb-4",
                table: "border-collapse w-full",
                head_row: "items-center text-gray-400",
                day: "w-10 h-10 items-center justify-center ml-1 mt-1 rounded-full hover:ring-2 hover:ring-[var(--brand-secondary)] hover:ring-opacity-50",
                day_today: "border border-[var(--brand-secondary)]",
                day_selected: "!bg-blue-700 !text-white",
                day_range_start: "!bg-blue-700 !text-white",
                day_range_end: "!bg-blue-700 !text-white",
                day_range_middle: "!bg-blue-700 !text-white",
              }}
              // Removed invalid 'styles' prop as these keys are not supported in react-day-picker v8+
              onSelect={(range: DateRange | undefined) => {
                setSelectedRange(range);
                if (range?.from && range.to && range.from.getTime() !== range.to.getTime()) {
                  setPendingRange(range);
                  setShowRangePrompt(true);
                } else if (range?.from && range.to && range.from.getTime() === range.to.getTime()) {
                  setSelectedRange(undefined);
                  setPendingRange(undefined);
                  setShowRangePrompt(false);
                }
              }}
            />
          </div>
          {showRangePrompt && pendingRange && (
            <div className="mt-4 flex items-center gap-4">
              <span className="text-sm">Mark selected range as:</span>
              <button
                className="px-3 py-1 bg-yellow-400 text-white rounded"
                onClick={async () => {
                  await markRange(pendingRange, 'NOT_OPERATING');
                  setShowRangePrompt(false);
                  setPendingRange(undefined);
                  setSelectedRange(undefined);
                }}
              >
                Not Operating
              </button>
              <button
                className="px-3 py-1 bg-red-400 text-white rounded"
                onClick={async () => {
                  await markRange(pendingRange, 'SOLD_OUT');
                  setShowRangePrompt(false);
                  setPendingRange(undefined);
                  setSelectedRange(undefined);
                }}
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
        </>
      )}

      {/* Legend */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
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
              <div className="w-4 h-4 rounded-full bg-blue-700"></div>
              <span className="text-gray-700">Selected Range</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
        {blockedDates.length > 0 && (
          <div className="bg-red-50 rounded-lg mb-3">
            <p className="text-sm font-medium text-red-800 mb-3">Currently Blocked Dates ({blockedDates.length})</p>
            <div className="flex flex-wrap gap-2">
              {blockedDates.map(b => (
                <span
                  key={b.date}
                  className="inline-flex items-center px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full border border-red-200"
                >
                  {new Date(b.date).toLocaleDateString('en-IN')}
                </span>
              ))}
            </div>
          </div>
        )}
        <h5 className="text-sm font-semibold text-red-800 mb-3">
          Unavailable Date Ranges
        </h5>
        {subranges.map(r => (
          <div key={r.id} className="mt-3 flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${r.status === 'SOLD_OUT' ? 'bg-red-500' : 'bg-orange-500'}`}></div>
              <span className="text-sm font-medium text-gray-800">
                {createLocalDate(r.startDate.split('T')[0]).toLocaleDateString('en-IN')} – {createLocalDate(r.endDate.split('T')[0]).toLocaleDateString('en-IN')}
              </span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                r.status === 'SOLD_OUT'
                  ? 'bg-red-100 text-red-800 border border-red-200'
                  : 'bg-orange-100 text-orange-800 border border-orange-200'
              }`}>
                {r.status === 'SOLD_OUT' ? 'Sold Out' : 'Not Operating'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {/* Show Edit button only if subrange has an id (i.e., exists in DB) */}
              {onEdit && !r.isNew && (
                <button
                  onClick={() => onEdit(r)}
                  className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => onDelete(r.id)}
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
  );
};