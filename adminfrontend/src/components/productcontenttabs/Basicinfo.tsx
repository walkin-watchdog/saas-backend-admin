import { PlusCircle } from "lucide-react";
import type { Key } from "react";
import type { BasicInfoProps } from "@/types";
import Select from 'react-select';

export const BasicInfo = ({
  formData,
  updateFormData,
  destinations,
  experienceCategories,
  setIsCategoryModalOpen,
  isLoadingDestinations,
  isLoadingCategories,
  setIsDestinationModalOpen,
  isEdit
}: BasicInfoProps) => {

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Type *
          </label>
          <select
            value={formData.type}
            onChange={(e) => updateFormData({ type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            required
          >
            <option value="TOUR">Tour</option>
            <option value="EXPERIENCE">Experience</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => updateFormData({ title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            placeholder="Enter product title"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Location *
          </label>
          <div className="flex">
            <div>
              <Select
                options={destinations.map((d: any) => ({
                  value: d.id,
                  label: d.name,
                  lat: d.lat,
                  lng: d.lng,
                  placeId: d.placeId,
                }))}
                value={
                  destinations
                    .filter((d: any) => d.id === formData.destinationId)
                    .map((d: any) => ({
                      value: d.id,
                      label: d.name,
                      lat: d.lat,
                      lng: d.lng,
                      placeId: d.placeId,
                    }))[0] || null
                }
                onChange={(selected: any) => {
                  updateFormData({
                    location: selected.label,
                    destinationId: selected.value,
                    locationLat: selected.lat,
                    locationLng: selected.lng,
                    locationPlaceId: selected.placeId,
                  });
                }}
                placeholder="Select a destination..."
                className="react-select-container"
                classNamePrefix="react-select"
                isClearable
              />
            </div>
            <button
              type="button"
              onClick={() => setIsDestinationModalOpen(true)}
              className="px-3 py-2 bg-[var(--brand-primary)] text-white rounded-r-md hover:bg-[var(--brand-tertiary)] transition-colors flex-shrink-0"
            >
              <PlusCircle className="h-5 w-5" />
            </button>
          </div>
          {isLoadingDestinations && (
            <p className="text-sm text-gray-500 mt-1">Loading destinations...</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Duration *
          </label>
          <div className="flex flex-col sm:flex-row sm:space-x-2 sm:items-center space-y-2 sm:space-y-0">
            <input
              type="number"
              min={1}
              value={
                formData.duration === 'Full Day' || formData.duration === 'Half Day'
                  ? 1
                  : formData.duration.endsWith('Hours')
                    ? parseInt(formData.duration)
                    : formData.duration.endsWith('Days')
                      ? parseInt(formData.duration)
                      : ''
              }
              onChange={e => {
                const value = Number(e.target.value);
                const isHours = formData.duration.endsWith('Hours');
                if (isHours) {
                  updateFormData({ duration: `${value} Hours` });
                } else {
                  if (value === 1) {
                    updateFormData({ duration: 'Full Day' });
                  } else {
                    updateFormData({ duration: `${value} Days` });
                  }
                }
              }}
              className="w-full sm:w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              placeholder="e.g., 7"
              required
              disabled={formData.duration === 'Full Day' || formData.duration === 'Half Day'}
            />
            <select
              value={
                formData.duration === 'Full Day'
                  ? 'full'
                  : formData.duration === 'Half Day'
                    ? 'half'
                    : formData.duration.endsWith('Hours')
                      ? 'hours'
                      : 'days'
              }
              onChange={e => {
                const currentValue =
                  formData.duration.endsWith('Days')
                    ? parseInt(formData.duration) || 1
                    : formData.duration.endsWith('Hours')
                      ? parseInt(formData.duration) || 1
                      : 1;

                if (e.target.value === 'full') {
                  updateFormData({ duration: 'Full Day' });
                } else if (e.target.value === 'half') {
                  updateFormData({ duration: 'Half Day' });
                } else if (e.target.value === 'hours') {
                  updateFormData({ duration: `${currentValue > 1 ? currentValue : 1} Hours` });
                } else {
                  updateFormData({ duration: `${currentValue > 1 ? currentValue : 2} Days` });
                }
              }}
              className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              required
            >
              <option value="full">Full Day</option>
              <option value="half">Half Day</option>
              <option value="days">Days</option>
              <option value="hours">Hours</option>
            </select>
            {(formData.duration === 'Full Day' || formData.duration === 'Half Day') && (
              <span className="text-gray-500 text-sm">
                {formData.duration}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formData.duration === 'Full Day' && 'A single full day experience.'}
            {formData.duration === 'Half Day' && 'A single half day experience.'}
            {formData.duration && formData.duration.includes('Days') && 'Enter the number of days for this tour.'}
            {formData.duration && formData.duration.includes('Hours') && 'Enter the number of hours for this experience.'}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tour Type *
          </label>
          <select
            value={formData.tourType || ''}
            onChange={e => updateFormData({ tourType: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            required
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Capacity *
          </label>
          <input
            type="number"
            min="1"
            value={formData.capacity}
            onChange={(e) => updateFormData({ capacity: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            placeholder="Max number of people"
            required
          />
        </div>

        <div>
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Code
              </label>
              <input
                type="text"
                value={formData.productCode}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
              />
            </div>
          )}
        </div>
      </div>

      {formData.type === 'EXPERIENCE' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Category *
          </label>
          <div className="flex">
            <select
              value={formData.category}
              onChange={(e) => updateFormData({
                category: e.target.value,
                experienceCategoryId: experienceCategories.find((c: { name: string; }) => c.name === e.target.value)?.id || null
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              required={formData.type === 'EXPERIENCE'}
            >
              <option value="">Select a category</option>
              {experienceCategories.map((category: { id: Key | null | undefined; name: any }) => (
                <option
                  key={category.id ?? ''}
                  value={category.name != null ? String(category.name) : ''}
                >
                  {category.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="px-3 py-2 bg-[var(--brand-primary)] text-white rounded-r-md hover:bg-[var(--brand-tertiary)] transition-colors flex-shrink-0"
            >
              <PlusCircle className="h-5 w-5" />
            </button>
          </div>
          {isLoadingCategories && (
            <p className="text-sm text-gray-500 mt-1">Loading categories...</p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description *
        </label>
        <textarea
          rows={5}
          value={formData.description}
          onChange={(e) => updateFormData({ description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          placeholder="Enter detailed description"
          required
        />
      </div>
    </div>
  );
}