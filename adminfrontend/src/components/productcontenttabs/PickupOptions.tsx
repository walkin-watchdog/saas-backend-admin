import { useState } from 'react';
import type { PickupOptionsTabProps } from "@/types";
import { EndPointMap } from "../ui/EndPointMap";
import { MeetingPointMap } from "../ui/MeetingPointMap";
import { PickupLocationMap } from "../ui/PickupLocationMap";
import { PickupOptionChangeModal } from "../ui/PickupOptionChangeModal";
import { useToast } from "../ui/toaster";
import { useAuth } from '@/contexts/AuthContext';


export const PickupOptionsTab = ({
    formData,
    updateFormData,
    pickupOption,
    setPickupOption,
}: PickupOptionsTabProps) => {
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingOption, setPendingOption] = useState('');
    const toast = useToast();
      const { token } = useAuth();

    // Check if this is an update to an existing product (has an id and is not a draft)
    const isEditingExistingProduct = formData.id && !formData.isDraft;

    // Check if there's existing pickup/meeting data
    const hasExistingData = () => {
        return (
            (formData.meetingPoints && formData.meetingPoints.length > 0) ||
            (formData.pickupLocationDetails && formData.pickupLocationDetails.length > 0) ||
            (formData.endPoints && formData.endPoints.length > 0) ||
            formData.meetingPoint ||
            formData.additionalPickupDetails
        );
    };

    const clearPickupMeetingData = async (productId: string) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/products/${productId}/pickup-meeting-data`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to clear pickup and meeting data');
            }

            toast({ message: 'Previous pickup and meeting data cleared successfully', type: 'success' });
            return true;
        } catch (error) {
            console.error('Error clearing pickup and meeting data:', error);
            toast({ message: 'Failed to clear previous data', type: 'error' });
            return false;
        }
    };

    const handlePickupOptionChange = async (newOption: string) => {
        // If it's a new product or draft, just update without confirmation
        if (!isEditingExistingProduct || !hasExistingData()) {
            applyPickupOptionChange(newOption);
            return;
        }

        // For existing products with data, show confirmation modal
        setPendingOption(newOption);
        setShowConfirmModal(true);
    };

    const applyPickupOptionChange = (newOption: string) => {
        setPickupOption(newOption);

        // Reset all related fields when changing pickup option
        updateFormData({
            pickupOption: newOption,
            meetingPoint: '',
            meetingPoints: [],
            pickupLocationDetails: [],
            allowTravelersPickupPoint: false,
            pickupStartTimeValue: 0,
            pickupStartTimeUnit: 'minutes',
            additionalPickupDetails: '',
            doesTourEndAtMeetingPoint: undefined,
            endPoints: [],
        });
    };

    const handleConfirmChange = async () => {
        setShowConfirmModal(false);
        
        // Clear data in backend if this is an existing product
        if (isEditingExistingProduct && formData.id) {
            const success = await clearPickupMeetingData(formData.id);
            if (!success) {
                return; // Don't proceed if backend deletion failed
            }
        }

        // Apply the change
        applyPickupOptionChange(pendingOption);
        setPendingOption('');
    };

    const handleCancelChange = () => {
        setShowConfirmModal(false);
        setPendingOption('');
    };
    return (
        <div className="space-y-6">
            <div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">Pickup Configuration</h4>
                <p className="text-sm text-gray-600 mb-6">Configure how travelers will meet or be picked up</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pickup Option *
                </label>
                <select
                    value={pickupOption}
                    onChange={e => handlePickupOptionChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                    required
                >
                    <option value="">Select pickup option</option>
                    <option value="We pick up all travelers">We pick up all travelers</option>
                    <option value="We can pick up travelers or meet them at a meeting point">
                        We can pick up travelers or meet them at a meeting point
                    </option>
                    <option value="No, we meet all travelers at a meeting point">
                        No, we meet all travelers at a meeting point
                    </option>
                </select>
            </div>

            {(pickupOption === 'We pick up all travelers' ||
                pickupOption === 'We can pick up travelers or meet them at a meeting point') && (
                    <>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Allow travelers to choose their pickup point?
                            </label>
                            <select
                                value={formData.allowTravelersPickupPoint ? 'yes' : 'no'}
                                onChange={e => updateFormData({ allowTravelersPickupPoint: e.target.value === 'yes' })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            >
                                <option value="no">No</option>
                                <option value="yes">Yes</option>
                            </select>
                        </div>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                How long before departure should travelers be at the pickup point?
                            </label>
                            <div className="flex space-x-2">
                                <input
                                    type="number"
                                    min={1}
                                    value={formData.pickupStartTimeValue || ''}
                                    onChange={e => updateFormData({ pickupStartTimeValue: Number(e.target.value) })}
                                    className="w-32 px-3 py-2 border border-gray-300 rounded-md"
                                    placeholder="e.g., 15"
                                />
                                <select
                                    value={formData.pickupStartTimeUnit || 'minutes'}
                                    onChange={e => updateFormData({ pickupStartTimeUnit: e.target.value })}
                                    className="px-3 py-2 border border-gray-300 rounded-md"
                                >
                                    <option value="minutes">minutes</option>
                                    <option value="hours">hours</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Additional Pickup Details
                            </label>
                            <textarea
                                value={formData.additionalPickupDetails || ''}
                                onChange={e => updateFormData({ additionalPickupDetails: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                placeholder="Any extra info for travelers"
                            />
                        </div>
                        <div className="mt-4">
                            <PickupLocationMap
                                locations={formData.pickupLocationDetails || []}
                                onLocationsChange={locs => updateFormData({ pickupLocationDetails: locs })}
                            />
                        </div>
                    </>
                )}

            {(pickupOption === 'We can pick up travelers or meet them at a meeting point' ||
                pickupOption === 'No, we meet all travelers at a meeting point') && (
                    <>
                        <div className="mt-4">
                            <MeetingPointMap
                                meetingPoints={formData.meetingPoints || []}
                                onMeetingPointsChange={points => updateFormData({ meetingPoints: points })}
                            />
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Does this tour end back at the meeting point(s)?
                            </label>
                            <div className="space-y-2">
                                <label className="flex items-center space-x-3">
                                    <input
                                        type="radio"
                                        name="doesTourEndAtMeetingPoint"
                                        value="true"
                                        checked={formData.doesTourEndAtMeetingPoint === true}
                                        onChange={() => {
                                            updateFormData({ doesTourEndAtMeetingPoint: true });
                                            updateFormData({ endPoints: [] });
                                        }}
                                        className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                    />
                                    <span className="text-sm text-gray-700">Yes - Tour ends back at meeting point(s)</span>
                                </label>
                                <label className="flex items-center space-x-3">
                                    <input
                                        type="radio"
                                        name="doesTourEndAtMeetingPoint"
                                        value="false"
                                        checked={formData.doesTourEndAtMeetingPoint === false}
                                        onChange={() => updateFormData({ doesTourEndAtMeetingPoint: false })}
                                        className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                    />
                                    <span className="text-sm text-gray-700">No - Tour ends at a different location</span>
                                </label>
                            </div>
                        </div>

                        {/* End Points Section - Show when tour doesn't end at meeting point */}
                        {formData.doesTourEndAtMeetingPoint === false && (
                            <div className="mt-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                                <EndPointMap
                                    endPoints={formData.endPoints || []}
                                    onEndPointsChange={endPoints => updateFormData({ endPoints })}
                                />
                            </div>
                        )}
                    </>
                )}

            {/* Confirmation Modal */}
            <PickupOptionChangeModal
                isOpen={showConfirmModal}
                onClose={handleCancelChange}
                onConfirm={handleConfirmChange}
                currentOption={pickupOption}
                newOption={pendingOption}
            />
        </div>
    );
}