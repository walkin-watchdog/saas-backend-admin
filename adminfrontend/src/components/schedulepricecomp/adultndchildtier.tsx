import { Plus, Trash2 } from "lucide-react";
import React from "react";
import type { AdultAndChildTiersProps } from "../../types/index.ts";


export const AdultAndChildTiers: React.FC<AdultAndChildTiersProps> = ({
  slotFormData,
  packageFormData,
  handleTierChange,
  handleRemoveTier,
  handleAddTier,
  currency,
}) => (
  <div>
    {/* Adult Pricing Tiers */}
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-gray-700">
          Adult Pricing Tiers *
        </label>
      </div>
      <div className="space-y-3">
        {slotFormData.adultTiers.map((tier, index) => (
          <div key={index} className="flex items-center gap-2 p-3 rounded-md bg-blue-50">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Min</label>
              <input
                type="number"
                min={1}
                value={tier.min}
                onChange={(e) => handleTierChange(e, "adultTiers", index, "min")}
                className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max</label>
              <input
                type="number"
                min={tier.min}
                value={tier.max}
                onChange={(e) => handleTierChange(e, "adultTiers", index, "max")}
                className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
              />
            </div>
            <div className="flex mt-5">
              <span className="px-2 py-1 border border-gray-300 rounded-l-md bg-gray-100 text-sm flex items-center">
                {currency}
              </span>
              <input
                type="number"
                min={0}
                value={tier.price}
                onChange={(e) => handleTierChange(e, "adultTiers", index, "price")}
                className="w-full px-2 py-1 border-y border-r border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => handleRemoveTier("adultTiers", index)}
              disabled={slotFormData.adultTiers.length <= 1}
              className="p-2 text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed self-end"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => handleAddTier("adultTiers")}
          className="flex items-center text-blue-600 hover:text-blue-800 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Tier
        </button>
      </div>
    </div>

    {/* Child Pricing Tiers */}
    {packageFormData.ageGroups?.child?.enabled && (
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700">
            Child Pricing Tiers *
          </label>
          <span className="text-xs text-gray-500">
            Consider accessibility needs for children
          </span>
        </div>
        <div className="space-y-3">
          {slotFormData.childTiers.map((tier, index) => (
            <div key={index} className="flex items-center gap-2 p-3 rounded-md bg-green-50">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Min </label>
                <input
                  type="number"
                  min={0}
                  value={tier.min}
                  onChange={(e) => handleTierChange(e, "childTiers", index, "min")}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max </label>
                <input
                  type="number"
                  min={tier.min}
                  max={17}
                  value={tier.max}
                  onChange={(e) => handleTierChange(e, "childTiers", index, "max")}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
                />
              </div>
              <div className="flex mt-5">
                <span className="px-2 py-1 border border-gray-300 rounded-l-md bg-gray-100 text-sm flex items-center">
                  {currency}
                </span>
                <input
                  type="number"
                  min={0}
                  value={tier.price}
                  onChange={(e) => handleTierChange(e, "childTiers", index, "price")}
                  className="w-full px-2 py-1 border-y border-r border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemoveTier("childTiers", index)}
                disabled={slotFormData.childTiers.length <= 1}
                className="p-2 text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed self-end"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => handleAddTier("childTiers")}
            className="flex items-center text-blue-600 hover:text-blue-800 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Tier
          </button>
          <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded-md">
            <strong>Note:</strong> Consider special pricing for children with accessibility needs or those requiring additional assistance
          </div>
        </div>
      </div>
    )}
  </div>
);