import type { CustomRequirementField, TravelerRequirementsTabProps } from '@/types';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';



export const TravelerRequirementsTab = ({ formData, updateFormData }: TravelerRequirementsTabProps) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const addCustomRequirement = () => {
    const newField: CustomRequirementField = {
      id: `custom_${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
    };
    const updated = [...(formData.customRequirementFields || []), newField];
    updateFormData({ customRequirementFields: updated });
    setEditingIndex(updated.length - 1);
  };

  const updateCustomRequirement = (index: number, updates: Partial<CustomRequirementField>) => {
    const updatedFields = [...(formData.customRequirementFields || [])];
    updatedFields[index] = { ...updatedFields[index], ...updates };
    updateFormData({ customRequirementFields: updatedFields });
  };

  const removeCustomRequirement = (index: number) => {
    const updatedFields = formData.customRequirementFields.filter((_: any, i: number) => i !== index);
    updateFormData({ customRequirementFields: updatedFields });
  };

  return (
    <div className="space-y-8">
      {/* Information Required from Travelers */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Information Required from Travelers</h3>
        <div className="space-y-6">

          {/* Standard Requirements */}
          <div>
            <h4 className="font-medium text-gray-800 mb-3">Standard Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requirePhone"
                  checked={formData.requirePhone || false}
                  onChange={(e) => updateFormData({ requirePhone: e.target.checked })}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                />
                <label htmlFor="requirePhone" className="ml-2 block text-sm text-gray-700">
                  Phone Number Required
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requireId"
                  checked={formData.requireId || false}
                  onChange={(e) => updateFormData({ requireId: e.target.checked })}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                />
                <label htmlFor="requireId" className="ml-2 block text-sm text-gray-700">
                  Photo ID Required
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requireAge"
                  checked={formData.requireAge || false}
                  onChange={(e) => updateFormData({ requireAge: e.target.checked })}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                />
                <label htmlFor="requireAge" className="ml-2 block text-sm text-gray-700">
                  Age Verification Required
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requireMedical"
                  checked={formData.requireMedical || false}
                  onChange={(e) => updateFormData({ requireMedical: e.target.checked })}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                />
                <label htmlFor="requireMedical" className="ml-2 block text-sm text-gray-700">
                  Medical Information Required
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requireDietary"
                  checked={formData.requireDietary || false}
                  onChange={(e) => updateFormData({ requireDietary: e.target.checked })}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                />
                <label htmlFor="requireDietary" className="ml-2 block text-sm text-gray-700">
                  Dietary Restrictions
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requireEmergencyContact"
                  checked={formData.requireEmergencyContact || false}
                  onChange={(e) => updateFormData({ requireEmergencyContact: e.target.checked })}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                />
                <label htmlFor="requireEmergencyContact" className="ml-2 block text-sm text-gray-700">
                  Emergency Contact Required
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requirePassportDetails"
                  checked={formData.requirePassportDetails || false}
                  onChange={(e) => updateFormData({ requirePassportDetails: e.target.checked })}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                />
                <label htmlFor="requirePassportDetails" className="ml-2 block text-sm text-gray-700">
                  Passport Details (for international travelers)
                </label>
              </div>
              {formData.requirePassportDetails && (
                <div className="ml-7 mt-2 space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Passport Details
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="passportDetailsOption"
                        value="advance"
                        checked={formData.passportDetailsOption === 'advance'}
                        onChange={() => updateFormData({ passportDetailsOption: 'advance' })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="ml-2 text-gray-700 text-sm">
                        We need passport details before the day of travel
                      </span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="passportDetailsOption"
                        value="day"
                        checked={formData.passportDetailsOption === 'day'}
                        onChange={() => updateFormData({ passportDetailsOption: 'day' })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="ml-2 text-gray-700 text-sm">
                        We just need to see passports on the day of travel
                      </span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="passportDetailsOption"
                        value="both"
                        checked={formData.passportDetailsOption === 'both'}
                        onChange={() => updateFormData({ passportDetailsOption: 'both' })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="ml-2 text-gray-700 text-sm">
                        We need passport details in advance and we need to see passports on the day of travel
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Additional Requirements Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional Information Requirements
            </label>
            <textarea
              rows={3}
              value={formData.additionalRequirements || ''}
              onChange={(e) => updateFormData({ additionalRequirements: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              placeholder="Any other information needed from travelers..."
            />
          </div>

          {/* Custom Requirement Fields */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-800">Custom Requirement Fields</h4>
              <button
                type="button"
                onClick={addCustomRequirement}
                className="flex items-center px-3 py-2 text-sm bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)]"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Custom Field
              </button>
            </div>

            {formData.customRequirementFields?.map((field: CustomRequirementField, index: number) => (
              <div key={field.id} className="flex items-center mb-3 space-x-2">
                {editingIndex === index ? (
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateCustomRequirement(index, { label: e.target.value })}
                    placeholder="Enter field label"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                  />
              ) : (
                  <span className="flex-1 text-sm text-gray-800">{field.label || 'Unnamed field'}</span>
                )}
          
                {editingIndex === index ? (
                  <button
                    type="button"
                    onClick={() => setEditingIndex(null)}
                    className="px-2 py-1 text-sm bg-[var(--brand-primary)] text-white rounded hover:bg-green-700"
                  >
                    Save
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingIndex(index)}
                    className="px-2 py-1 text-sm bg-[var(--brand-secondary)] text-white rounded hover:bg-blue-700"
                  >
                    Edit
                  </button>
                )}
          
                <button
                  type="button"
                  onClick={() => removeCustomRequirement(index)}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            {(!formData.customRequirementFields || formData.customRequirementFields.length === 0) && (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                <p>No custom requirement fields added yet.</p>
                <p className="text-sm">Click "Add Custom Field" to create additional information requirements.</p>
              </div>
            )}
          </div>
        </div>

        {/* Package Person Phone Number */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Package Contact Information</h3>
          <input
            type="text"
            value={formData.phonenumber || ''}
            onChange={(e) => updateFormData({ phonenumber: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            placeholder="Enter phone number for package contact"
          />
          <p className="text-xs text-gray-500 mt-1">
            This number will be used for package-related queries and communication.
          </p>
        </div>
      </div>
    </div>
  );
};