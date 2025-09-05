import type { AvailabilityTabProps, AvailabilitySubrange } from '@/types';
import React, { useState } from 'react';
import { SubrangeEditor } from '../availability/SubrangeEditor';
import { CalendarRanges } from '../availability/CalendarRanges';

export const AvailabilityTab: React.FC<AvailabilityTabProps> = ({
  formData,
  updateFormData,
}) => {
  const {
    availabilityStartDate,
    availabilityEndDate,
    blockedDates = [],
    availabilitySubranges = [],
  } = formData;

  const [blockingMode, setBlockingMode] = useState<'single' | 'range'>('single');

  const [editing, setEditing] = useState<AvailabilitySubrange | undefined>(undefined);

  const saveSubrange = (r: AvailabilitySubrange) => {
    const alreadyExists = availabilitySubranges.some(s => s.id === r.id);
    const toSave = alreadyExists
      ? r
      : {
          ...r,
          isNew: true,
        };

    const list = availabilitySubranges.filter(s => s.id !== r.id).concat(toSave);
    updateFormData({ availabilitySubranges: list });
    setEditing(undefined);
  };

  const deleteSubrange = (id: string) => {
    updateFormData({
      availabilitySubranges: availabilitySubranges.filter(s => s.id !== id)
    });
  };

  const handleCalendarSingleDateSelect = (date: string) => {
    const isBlocked = blockedDates.find(b => b.date === date);
    if (isBlocked) {
      // Unblock the date
      updateFormData({
        blockedDates: blockedDates.filter(b => b.date !== date)
      });
    } else {
      // Block the date
      const updated = [...blockedDates, { date: date, reason: 'Blocked via calendar' }];
      updateFormData({ blockedDates: updated });
    }
  };


  return (
    <div className="space-y-8 grid grid-cols-1">
      {/* 1. Availability window */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Availability</h4>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date *
          </label>
          <input
            type="date"
            value={availabilityStartDate}
            onChange={e => updateFormData({ availabilityStartDate: e.target.value })}
            className="w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)]"
            required
          />
        </div>
        <div className="mt-4">
          {availabilityEndDate === undefined ? (
            <>
              <label className="inline-flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked
                  onChange={(e) => {
                    if (!e.target.checked) {
                      updateFormData({
                        availabilityEndDate: availabilityStartDate,
                      });
                    }
                  }}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                />
                <span className="text-sm font-medium text-gray-700">
                  Available&nbsp;forever
                </span>
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End&nbsp;Date&nbsp;*
              </label>
              <input
                type="date"
                required
                min={availabilityStartDate || undefined}
                value={availabilityEndDate}
                onChange={(e) =>
                  updateFormData({
                    availabilityEndDate: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 border rounded-md focus:ring-[var(--brand-primary)]"
              />
            </>
          )}
        </div>
      </div>

      {/* 2. Date Blocking Options */}
      <div className="bg-white p-2 sm:p-6 rounded-lg border border-gray-200">
        <h4 className="text-lg font-semibold mb-6">Date Blocking Options</h4>

        {/* Radio Button Options */}
        <div className="flex flex-col md:flex-row md:space-x-6 space-y-6 md:space-y-0">
          {/* Option 1: Block/Unblock Single Date */}
          <div className="flex-1 border border-gray-200 rounded-lg p-4">
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
            {blockingMode === 'single' && (
              <div className="mt-4 pl-7">
                <p className="text-sm text-gray-600 mb-3">
                  Select a date from the calendar below to block or unblock it.
                </p>
              </div>
            )}
          </div>

          {/* Option 2: Block Multiple Dates */}
          <div className="flex-1 border border-gray-200 rounded-lg p-4">
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
            {blockingMode === 'range' && (
              <div className="mt-4 pl-7">
                <p className="text-sm text-gray-600 mb-4">
                  Select a date range and to change it's availability.
                </p>
              </div>
            )}
          </div>
        </div>

        

        {/* 3. Temporary sub-ranges & permanent override */}
        <CalendarRanges
          productId={formData.id!}
          baseStart={new Date(availabilityStartDate)}
          baseEnd={availabilityEndDate ? new Date(availabilityEndDate) : undefined}
          subranges={availabilitySubranges}
          blockedDates={blockedDates}
          blockingMode={blockingMode}
          onCreate={r => saveSubrange({ ...r, id: crypto.randomUUID() })}
          onEdit={setEditing}
          onDelete={deleteSubrange}
          onSingleDateSelect={handleCalendarSingleDateSelect}
        />
        
        {editing && (
          <SubrangeEditor
            productId={formData.id!}
            subrange={editing}
            onSave={(updatedSubrange) => {
              setEditing(undefined);
              if (updatedSubrange) {
                saveSubrange(updatedSubrange);
              }
            }}
            onClose={() => setEditing(undefined)}
          />
        )}
      </div>
    </div>
  );
};