// src/components/availability/SubrangeEditor.tsx
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { AvailabilitySubrange } from '../../types';

export interface SubrangeEditorProps {
  productId: string;
  subrange?: AvailabilitySubrange;
  onSave: (updatedSubrange?: AvailabilitySubrange) => void;
  onClose: () => void;
}

export const SubrangeEditor: React.FC<SubrangeEditorProps> = ({
  productId,
  subrange,
  onSave,
  onClose
}) => {
  const { token } = useAuth();
  const [startDate, setStartDate] = useState(
    subrange ? subrange.startDate.slice(0, 10) : ''
  );
  const [endDate, setEndDate] = useState(
    subrange ? subrange.endDate.slice(0, 10) : ''
  );
  const [status, setStatus] = useState<'SOLD_OUT'|'NOT_OPERATING'>(
    subrange?.status || 'SOLD_OUT'
  );
  const [error, setError] = useState<string|null>(null);

  const handleSave = async () => {
    if (!startDate || !endDate) {
      setError('Both start and end dates are required');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date must be before end date');
      return;
    }

    const url = subrange
      ? `${import.meta.env.VITE_API_URL}/availability/subrange/${subrange.id}`
      : `${import.meta.env.VITE_API_URL}/availability/subrange`;
    const method = subrange ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ productId, startDate, endDate, status })
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>null);
      setError(err?.error || 'Failed to save');
      return;
    }
    
    const result = await res.json();
    
    // Return the updated subrange data if editing
    if (subrange) {
      const updatedSubrange = {
        ...subrange,
        startDate,
        endDate,
        status
      };
      onSave(updatedSubrange);
    } else {
      // For new subranges, return the created subrange if available
      if (result && result.id) {
        const newSubrange = {
          id: result.id,
          productId,
          startDate,
          endDate,
          status,
          createdAt: result.createdAt || new Date().toISOString(),
          updatedAt: result.updatedAt || new Date().toISOString()
        };
        onSave(newSubrange);
      } else {
        onSave();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-sm">
        <h3 className="text-lg font-bold mb-4">
          {subrange ? 'Edit Range' : 'New Range'}
        </h3>
        {error && (
          <div className="mb-3 px-3 py-2 bg-red-100 text-red-800 rounded">
            {error}
          </div>
        )}
        <label className="block mb-3">
          <span className="block text-sm font-medium">Start Date</span>
          <input
            type="date"
            value={startDate}
            onChange={e=>setStartDate(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </label>
        <label className="block mb-3">
          <span className="block text-sm font-medium">End Date</span>
          <input
            type="date"
            value={endDate}
            onChange={e=>setEndDate(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </label>
        <label className="block mb-4">
          <span className="block text-sm font-medium">Status</span>
          <select
            value={status}
            onChange={e=>setStatus(e.target.value as any)}
            className="mt-1 block w-full border rounded px-2 py-1"
          >
            <option value="SOLD_OUT">Sold Out</option>
            <option value="NOT_OPERATING">Not Operating</option>
          </select>
        </label>
        <div className="flex justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-2">Cancel</button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};