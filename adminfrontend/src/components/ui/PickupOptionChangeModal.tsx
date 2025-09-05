import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface PickupOptionChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentOption: string;
  newOption: string;
}

export const PickupOptionChangeModal: React.FC<PickupOptionChangeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentOption,
  newOption
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Confirm Pickup Option Change
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 space-y-3">
          <p className="text-gray-700">
            You are changing the pickup option from:
          </p>
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-sm font-medium text-gray-800">Current: {currentOption}</p>
            <p className="text-sm font-medium text-orange-600">New: {newOption}</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
            <p className="text-sm text-orange-800">
              <strong>Warning:</strong> This will permanently delete all existing pickup locations, 
              meeting points, and endpoint data associated with this product. This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 transition-colors"
          >
            Yes, Delete Data
          </button>
        </div>
      </div>
    </div>
  );
};
