export const BookingProcessTab = ({ formData, updateFormData }: 
  {formData: any;
  updateFormData: (updates: any) => void;}
) => {
  const currencySymbol = (() => {
    switch (formData.currency) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default:   return '₹';
    }
  })();

  return (
    <div className="space-y-8">
      {/* Booking Process */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Booking Process</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirmation Type
            </label>
            <select
              value={formData.confirmationType || 'instant'}
              onChange={(e) => updateFormData({ confirmationType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            >
              <option value="instant">Instant Confirmation</option>
              <option value="delayed">Manual Confirmation</option>
              <option value="pending">Pending Review</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cut-off Time (hours before start)
            </label>
            <input
              type="number"
              min="0"
              value={formData.cutoffTime || 24}
              onChange={(e) => updateFormData({ cutoffTime: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              placeholder="24"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Participants
            </label>
            <input
              type="number"
              min="1"
              value={formData.minparticipants || 1}
              onChange={(e) => updateFormData({ minparticipants: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              placeholder="1"
            />
          </div>
        </div>
      </div>

      {/* Payment Options */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Options</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Type
            </label>
            <select
              value={formData.paymentType || 'FULL'}
              onChange={(e) => updateFormData({ paymentType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            >
              <option value="FULL">Full Payment Required</option>
              <option value="PARTIAL">Partial Payment Allowed</option>
              <option value="DEPOSIT">Deposit Required</option>
            </select>
          </div>

          {formData.paymentType === 'PARTIAL' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Payment (%)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.minimumPaymentPercent || 50}
                onChange={(e) => updateFormData({ minimumPaymentPercent: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                placeholder="20"
              />
            </div>
          )}

          {formData.paymentType === 'DEPOSIT' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deposit Amount ({currencySymbol})
              </label>
              <input
                type="number"
                min="0"
                value={formData.depositAmount || 1000}
                onChange={(e) => updateFormData({ depositAmount: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                placeholder="1000"
              />
            </div>
          )}
        </div>

        {/* Reserve Now Pay Later */}
        <div className="md:col-span-2 mt-2">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="reserveNowPayLater"
              checked={formData.reserveNowPayLater !== false} // Default to true
              onChange={(e) => updateFormData({ reserveNowPayLater: e.target.checked })}
              className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
            />
            <label htmlFor="reserveNowPayLater" className="text-sm font-medium text-gray-700">
              Enable "Reserve Now Pay Later"
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            When enabled, customers can reserve this product and pay later. A "Pay Later" button will appear while booking.
          </p>
        </div>
      </div>
    </div>
  );
};