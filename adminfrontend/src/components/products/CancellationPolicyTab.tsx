import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { CancellationPolicyTabProps, CancellationTerm } from '@/types';
import { predefinedPolicies } from '../productcontenttabs/predefinedcategories';

export const CancellationPolicyTab = ({ formData, updateFormData }: CancellationPolicyTabProps) => {
  const [, setActivePolicyTab] = useState<'standard' | 'custom'>('standard');

  // Set default standard policy
  useEffect(() => {
    if (formData.cancellationPolicyType === 'standard' && !formData.cancellationPolicy) {
      const defaultPolicyKey = 'standard';
      const defaultPolicy = predefinedPolicies[defaultPolicyKey];
      const policyText = `${defaultPolicy.label}: ${defaultPolicy.description}\n\n` +
        defaultPolicy.terms.map(term =>
          `• ${term.timeframe}: ${term.refundPercent}% refund - ${term.description}`
        ).join('\n');

      updateFormData({
        cancellationPolicyType: defaultPolicyKey,
        freeCancellationHours: defaultPolicy.freeCancellationHours,
        partialRefundPercent: defaultPolicy.partialRefundPercent,
        noRefundAfterHours: defaultPolicy.noRefundAfterHours,
        cancellationTerms: defaultPolicy.terms,
        cancellationPolicy: policyText
      });
    }
  }, [
    formData.cancellationPolicyType,
    formData.cancellationPolicy,
    updateFormData
  ]);


  const handlePolicyTypeChange = (policyType: string) => {
    if (policyType === 'custom') {
      updateFormData({ 
        cancellationPolicyType: 'custom',
        cancellationTerms: formData.cancellationTerms || []
      });
      setActivePolicyTab('custom');
    } else {
      const policy = predefinedPolicies[policyType as keyof typeof predefinedPolicies];
      updateFormData({
        cancellationPolicyType: policyType,
        freeCancellationHours: policy.freeCancellationHours,
        partialRefundPercent: policy.partialRefundPercent,
        noRefundAfterHours: policy.noRefundAfterHours,
        cancellationTerms: policy.terms,
        cancellationPolicy: `${policy.label}: ${policy.description}\n\n${policy.terms.map(term => 
          `• ${term.timeframe}: ${term.refundPercent}% refund - ${term.description}`
        ).join('\n')}`
      });
      setActivePolicyTab('standard');
    }
  };

  const addCustomTerm = () => {
    const newTerm: CancellationTerm = {
      timeframe: '',
      refundPercent: 100,
      description: ''
    };
    updateFormData({
      cancellationTerms: [...(formData.cancellationTerms || []), newTerm]
    });
  };

  const updateCustomTerm = (index: number, updates: Partial<CancellationTerm>) => {
    const updatedTerms = [...(formData.cancellationTerms || [])];
    updatedTerms[index] = { ...updatedTerms[index], ...updates };
    updateFormData({ cancellationTerms: updatedTerms });
    
    // Auto-generate policy text from terms
    const policyText = updatedTerms.map(term => 
      `• ${term.timeframe}: ${term.refundPercent}% refund - ${term.description}`
    ).join('\n');
    updateFormData({ cancellationPolicy: policyText });
  };

  const removeCustomTerm = (index: number) => {
    const updatedTerms = (formData.cancellationTerms || []).filter((_: any, i: number) => i !== index);
    updateFormData({ cancellationTerms: updatedTerms });
    
    // Auto-generate policy text from updated terms
    const policyText = updatedTerms.map((term: CancellationTerm) => 
      `• ${term.timeframe}: ${term.refundPercent}% refund - ${term.description}`
    ).join('\n');
    updateFormData({ cancellationPolicy: policyText });
  };

  return (
    <div className="space-y-8">
      {/* Enhanced Cancellation Policy */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cancellation Policy</h3>
        
        {/* Policy Type Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Policy Type *
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(predefinedPolicies).map(([key, policy]) => (
                <div key={key} className="relative">
                  <input
                    type="radio"
                    id={`policy_${key}`}
                    name="cancellationPolicyType"
                    value={key}
                    checked={formData.cancellationPolicyType === key}
                    onChange={(e) => handlePolicyTypeChange(e.target.value)}
                    className="sr-only"
                  />
                  <label
                    htmlFor={`policy_${key}`}
                    className={`block p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      formData.cancellationPolicyType === key
                        ? 'border-[var(--brand-primary)] bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-sm">{policy.label}</div>
                    <div className="text-xs text-gray-600 mt-1">{policy.description}</div>
                  </label>
                </div>
              ))}
              
              <div className="relative">
                <input
                  type="radio"
                  id="policy_custom"
                  name="cancellationPolicyType"
                  value="custom"
                  checked={formData.cancellationPolicyType === 'custom'}
                  onChange={(e) => handlePolicyTypeChange(e.target.value)}
                  className="sr-only"
                />
                <label
                  htmlFor="policy_custom"
                  className={`block p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    formData.cancellationPolicyType === 'custom'
                      ? 'border-[var(--brand-primary)] bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">Custom Policy</div>
                  <div className="text-xs text-gray-600 mt-1">Create your own cancellation terms</div>
                </label>
              </div>
            </div>
          </div>

          {/* Custom Policy Builder */}
          {formData.cancellationPolicyType === 'custom' && (
            <div className="bg-gray-50 p-6 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Custom Cancellation Terms</h4>
                <button
                  type="button"
                  onClick={addCustomTerm}
                  className="flex items-center px-3 py-2 text-sm bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)]"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Term
                </button>
              </div>

              {formData.cancellationTerms?.map((term: CancellationTerm, index: number) => (
                <div key={index} className="bg-white p-4 rounded-lg border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <GripVertical className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm font-medium">Term {index + 1}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCustomTerm(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Timeframe
                      </label>
                      <input
                        type="text"
                        value={term.timeframe}
                        onChange={(e) => updateCustomTerm(index, { timeframe: e.target.value })}
                        placeholder="e.g., 7+ days before"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Refund Percentage
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={term.refundPercent}
                        onChange={(e) => updateCustomTerm(index, { refundPercent: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={term.description}
                        onChange={(e) => updateCustomTerm(index, { description: e.target.value })}
                        placeholder="e.g., Full refund available"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              {(!formData.cancellationTerms || formData.cancellationTerms.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <p>No cancellation terms added yet.</p>
                  <p className="text-sm">Click "Add Term" to create custom cancellation rules.</p>
                </div>
              )}
            </div>
          )}

          {/* Final Policy Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Final Policy Text *
            </label>
            <textarea
              rows={6}
              value={formData.cancellationPolicy || ''}
              onChange={(e) => updateFormData({ cancellationPolicy: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              placeholder="This will be auto-generated for standard policies, or enter custom policy text..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              This text will appear on booking confirmations and vouchers
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};