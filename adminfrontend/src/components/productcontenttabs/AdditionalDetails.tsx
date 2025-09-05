import type { AdditionalDetailsTabProps } from "../../types/index.ts";
import { Plus, X } from "lucide-react";
import { useState, useEffect } from "react";

export const AdditionalDetailsTab = ({
    formData,
    updateFormData,
    newItem,
    setNewItem,
    removeItem,
    addItem
}: AdditionalDetailsTabProps) => {

    const healthRestrictionOptions = [
        "Not recommended for travelers with back problems",
        "Not recommended for pregnant travelers",
        "Not recommended for travelers with heart problems or other serious medical conditions"
    ];
    const [customHealthRestrictions, setCustomHealthRestrictions] = useState<string[]>([]);
    const [newCustomHealthRestriction, setNewCustomHealthRestriction] = useState('');

    useEffect(() => {
        if (!formData.difficulty)            updateFormData({ difficulty: 'Easy' });
        if (!formData.wheelchairAccessible)   updateFormData({ wheelchairAccessible: 'no' });
        if (!formData.strollerAccessible)     updateFormData({ strollerAccessible: 'no' });
        if (!formData.serviceAnimalsAllowed)  updateFormData({ serviceAnimalsAllowed: 'no' });
        if (!formData.publicTransportAccess)  updateFormData({ publicTransportAccess: 'no' });
        if (!formData.infantSeatsRequired)    updateFormData({ infantSeatsRequired: 'no' });
        if (!formData.infantSeatsAvailable)   updateFormData({ infantSeatsAvailable: 'no' });
    }, [updateFormData]);

    return (
        <div className="space-y-8">
            <div className="bg-white rounded-lg p-4 md:p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Physical Difficulty Level</h3>
                <p className="text-sm text-gray-600 mb-4">Select the physical difficulty level for this tour/experience</p>

                <div className="space-y-4">
                    <label className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                            type="radio"
                            name="difficulty"
                            value="Easy"
                            checked={formData.difficulty === 'Easy'}
                            onChange={(e) => updateFormData({ difficulty: e.target.value })}
                            className="mt-1 h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                        />
                        <div>
                            <div className="font-medium text-gray-900">Easy</div>
                            <div className="text-sm text-gray-600">Most travelers can participate</div>
                            <div className="text-xs text-gray-500 mt-1">
                                • Minimal physical activity required
                                • Suitable for all fitness levels
                                • Mostly walking on flat surfaces
                            </div>
                        </div>
                    </label>

                    <label className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                            type="radio"
                            name="difficulty"
                            value="Moderate"
                            checked={formData.difficulty === 'Moderate'}
                            onChange={(e) => updateFormData({ difficulty: e.target.value })}
                            className="mt-1 h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                        />
                        <div>
                            <div className="font-medium text-gray-900">Moderate</div>
                            <div className="text-sm text-gray-600">Travelers should have a moderate physical fitness level</div>
                            <div className="text-xs text-gray-500 mt-1">
                                • Some walking and standing involved
                                • May include stairs or uneven surfaces
                                • Basic fitness level recommended
                            </div>
                        </div>
                    </label>

                    <label className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                            type="radio"
                            name="difficulty"
                            value="Challenging"
                            checked={formData.difficulty === 'Challenging'}
                            onChange={(e) => updateFormData({ difficulty: e.target.value })}
                            className="mt-1 h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                        />
                        <div>
                            <div className="font-medium text-gray-900">Challenging</div>
                            <div className="text-sm text-gray-600">Travelers should have a strong physical fitness level</div>
                            <div className="text-xs text-gray-500 mt-1">
                                • Significant physical activity required
                                • May involve hiking, climbing, or extended walking
                                • Good fitness level essential
                            </div>
                        </div>
                    </label>
                </div>
            </div>

            <div className="bg-white rounded-lg p-4 md:p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">General Accessibility</h3>
                <p className="text-sm text-gray-600 mb-6">Check all accessibility features that apply to your tour/experience</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Wheelchair Accessibility</h4>
                        <div className="space-y-3">
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="wheelchairAccessible"
                                    value="yes"
                                    checked={formData.wheelchairAccessible === 'yes'}
                                    onChange={(e) => updateFormData({ wheelchairAccessible: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">Yes - Fully wheelchair accessible</span>
                            </label>
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="wheelchairAccessible"
                                    value="no"
                                    checked={formData.wheelchairAccessible === 'no'}
                                    onChange={(e) => updateFormData({ wheelchairAccessible: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">No - Not wheelchair accessible</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Stroller Accessibility</h4>
                        <div className="space-y-3">
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="strollerAccessible"
                                    value="yes"
                                    checked={formData.strollerAccessible === 'yes'}
                                    onChange={(e) => updateFormData({ strollerAccessible: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">Yes - Stroller friendly</span>
                            </label>
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="strollerAccessible"
                                    value="no"
                                    checked={formData.strollerAccessible === 'no'}
                                    onChange={(e) => updateFormData({ strollerAccessible: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">No - Not suitable for strollers</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Service Animals</h4>
                        <div className="space-y-3">
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="serviceAnimalsAllowed"
                                    value="yes"
                                    checked={formData.serviceAnimalsAllowed === 'yes'}
                                    onChange={(e) => updateFormData({ serviceAnimalsAllowed: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">Yes - Service animals allowed</span>
                            </label>
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="serviceAnimalsAllowed"
                                    value="no"
                                    checked={formData.serviceAnimalsAllowed === 'no'}
                                    onChange={(e) => updateFormData({ serviceAnimalsAllowed: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">No - Service animals not permitted</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Public Transportation Access</h4>
                        <div className="space-y-3">
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="publicTransportAccess"
                                    value="yes"
                                    checked={formData.publicTransportAccess === 'yes'}
                                    onChange={(e) => updateFormData({ publicTransportAccess: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">Yes - Easy access via public transport</span>
                            </label>
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="publicTransportAccess"
                                    value="no"
                                    checked={formData.publicTransportAccess === 'no'}
                                    onChange={(e) => updateFormData({ publicTransportAccess: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">No - Limited public transport access</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Infant Seating</h4>
                        <div className="space-y-3">
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="infantSeatsRequired"
                                    value="yes"
                                    checked={formData.infantSeatsRequired === 'yes'}
                                    onChange={(e) => updateFormData({ infantSeatsRequired: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">Yes - Infants must sit on laps</span>
                            </label>
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="infantSeatsRequired"
                                    value="no"
                                    checked={formData.infantSeatsRequired === 'no'}
                                    onChange={(e) => updateFormData({ infantSeatsRequired: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">No - Separate seating available</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Infant Seats</h4>
                        <div className="space-y-3">
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="infantSeatsAvailable"
                                    value="yes"
                                    checked={formData.infantSeatsAvailable === 'yes'}
                                    onChange={(e) => updateFormData({ infantSeatsAvailable: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">Yes - Infant seats available</span>
                            </label>
                            <label className="flex items-center space-x-3">
                                <input
                                    type="radio"
                                    name="infantSeatsAvailable"
                                    value="no"
                                    checked={formData.infantSeatsAvailable === 'no'}
                                    onChange={(e) => updateFormData({ infantSeatsAvailable: e.target.value })}
                                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300"
                                />
                                <span className="text-sm text-gray-700">No - No infant seats provided</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg p-4 md:p-6 border border-gray-200 p-4 mt-6">
                    <p className="text-sm text-gray-600 mb-6">Add specific accessibility features available for this tour/experience</p>

                    <div className="space-y-4">
                        <div className="flex flex-col md:flex-row">
                            <input
                                type="text"
                                value={newItem.accessibilityFeature || ''}
                                onChange={(e) => setNewItem({ ...newItem, accessibilityFeature: e.target.value })}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent w-full"
                                placeholder="e.g., Wheelchair accessible entrance, Audio descriptions available"
                            />
                            <button
                                type="button"
                                onClick={() => addItem('accessibilityFeatures', newItem.accessibilityFeature || '')}
                                className="px-3 py-2 bg-[var(--brand-primary)] text-white rounded-md md:rounded-r-md hover:bg-[var(--brand-tertiary)] transition-colors mt-2 md:mt-0"
                            >
                                <Plus className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                            <ul className="divide-y divide-gray-200">
                                {(formData.accessibilityFeatures || []).map((feature: string, index: number) => (
                                    <li key={index} className="flex justify-between items-center p-3 hover:bg-gray-50">
                                        <span className="text-gray-700">{feature}</span>
                                        <button
                                            onClick={() => removeItem('accessibilityFeatures', index)}
                                            className="text-red-500 hover:text-red-700 transition-colors"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </li>
                                ))}
                                {(!formData.accessibilityFeatures || formData.accessibilityFeatures.length === 0) && (
                                    <li className="p-3 text-gray-500 text-center">No accessibility features added</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg p-4 md:p-6 border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                    Health Restrictions
                </label>
                <span className="block text-sm text-gray-500 mb-4">Check all that apply</span>
                <div className="space-y-3 mb-4">
                    {healthRestrictionOptions.map(option => (
                        <label key={option} className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                checked={Array.isArray(formData.healthRestrictions) && formData.healthRestrictions.includes(option)}
                                onChange={e => {
                                    let updated: string[] = Array.isArray(formData.healthRestrictions) ? [...formData.healthRestrictions] : [];
                                    if (e.target.checked) {
                                        updated.push(option);
                                    } else {
                                        updated = updated.filter(item => item !== option);
                                    }
                                    updateFormData({ healthRestrictions: updated });
                                }}
                                className="h-4 w-4 border-gray-300 rounded accent-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700 text-sm">{option}</span>
                        </label>
                    ))}
                    {customHealthRestrictions.map((custom, idx) => (
                        <label key={custom} className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                checked={Array.isArray(formData.healthRestrictions) && formData.healthRestrictions.includes(custom)}
                                onChange={e => {
                                    let updated: string[] = Array.isArray(formData.healthRestrictions) ? [...formData.healthRestrictions] : [];
                                    if (e.target.checked) {
                                        updated.push(custom);
                                    } else {
                                        updated = updated.filter(item => item !== custom);
                                    }
                                    updateFormData({ healthRestrictions: updated });
                                }}
                                className="h-4 w-4 border-gray-300 rounded accent-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700 text-sm">{custom}</span>
                            <button
                                type="button"
                                className="ml-2 text-red-500 hover:text-red-700"
                                onClick={() => {
                                    setCustomHealthRestrictions(customHealthRestrictions.filter((_, i) => i !== idx));
                                    if (Array.isArray(formData.healthRestrictions) && formData.healthRestrictions.includes(custom)) {
                                        updateFormData({
                                            healthRestrictions: formData.healthRestrictions.filter((item: string) => item !== custom)
                                        });
                                    }
                                }}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </label>
                    ))}
                </div>
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        value={newCustomHealthRestriction}
                        onChange={e => setNewCustomHealthRestriction(e.target.value)}
                        placeholder="Custom restriction"
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent text-sm w-full md:w-96"
                        onKeyDown={e => {
                            if (e.key === 'Enter' && newCustomHealthRestriction.trim()) {
                                setCustomHealthRestrictions([...customHealthRestrictions, newCustomHealthRestriction.trim()]);
                                setNewCustomHealthRestriction('');
                            }
                        }}
                    />
                    <button
                        type="button"
                        className="p-3 bg-orange-400 hover:bg-orange-500 text-white rounded-md"
                        onClick={() => {
                            if (newCustomHealthRestriction.trim()) {
                                setCustomHealthRestrictions([...customHealthRestrictions, newCustomHealthRestriction.trim()]);
                                setNewCustomHealthRestriction('');
                            }
                        }}
                        title="Add custom restriction"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}