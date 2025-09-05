import { Trash2 } from "lucide-react";
import { getAvailableTimes } from "./schedulepricefunc";
import type { SlotPickerState, SlotFormData, SlotPickerProps } from "../../types/index.ts";



export const SlotPicker: React.FC<SlotPickerProps> = ({
    slotFormData,
    setSlotFormData,
    slotMode,
    setSlotMode,
    slotPicker,
    setSlotPicker,
}) => {

  const handleRemoveTimeSlot = (index: number) => {
    setSlotFormData(prev => ({
      ...prev,
      times: prev.times.filter((_, i) => i !== index)
    }));
  };

    return (
        <div>
            <div className="flex items-center gap-6 mb-4">
                <label className="flex items-center text-sm font-medium">
                    <input
                        type="radio"
                        checked={slotMode === 'auto'}
                        onChange={() => setSlotMode('auto')}
                        className="h-4 w-4 text-[var(--brand-primary)]"
                    />
                    <span className="ml-2">Generate Slots</span>
                </label>
                <label className="flex items-center text-sm font-medium">
                    <input
                        type="radio"
                        checked={slotMode === 'manual'}
                        onChange={() => setSlotMode('manual')}
                        className="h-4 w-4 text-[var(--brand-primary)]"
                    />
                    <span className="ml-2">Custom</span>
                </label>
            </div>
            <div className="mb-4 p-3 bg-blue-50 rounded">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Start Time</label>
                        <input
                            type="time"
                            value={slotPicker.start}
                            onChange={e => {
                                const start = e.target.value;
                                const availableTimes = getAvailableTimes(start, slotPicker.end, slotPicker.duration, slotPicker.durationUnit);
                                setSlotPicker((prev: SlotPickerState) => ({
                                    ...prev,
                                    start,
                                    availableTimes,
                                    selectedTime: '',
                                }));
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">End Time</label>
                        <input
                            type="time"
                            value={slotPicker.end}
                            onChange={e => {
                                const end = e.target.value;
                                const availableTimes = getAvailableTimes(slotPicker.start, end, slotPicker.duration, slotPicker.durationUnit);
                                setSlotPicker((prev: SlotPickerState) => ({
                                    ...prev,
                                    end,
                                    availableTimes,
                                    selectedTime: '',
                                }));
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Duration</label>
                        <input
                            type="number"
                            min={1}
                            value={slotPicker.duration}
                            onChange={e => {
                                const duration = Number(e.target.value);
                                const availableTimes = getAvailableTimes(slotPicker.start, slotPicker.end, duration, slotPicker.durationUnit);
                                setSlotPicker((prev: SlotPickerState) => ({
                                    ...prev,
                                    duration,
                                    availableTimes,
                                    selectedTime: '',
                                }));
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                        <select
                            value={slotPicker.durationUnit}
                            onChange={e => {
                                const durationUnit = e.target.value;
                                const availableTimes = getAvailableTimes(slotPicker.start, slotPicker.end, slotPicker.duration, durationUnit);
                                setSlotPicker((prev: SlotPickerState) => ({
                                    ...prev,
                                    durationUnit,
                                    availableTimes,
                                    selectedTime: '',
                                }));
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md"
                        >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                        </select>
                    </div>
                </div>
                {slotMode === 'auto' && (
                    <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-gray-600">
                            {slotPicker.availableTimes.length} slot(s) will be created
                        </span>
                        <button
                            type="button"
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                            onClick={() =>
                                setSlotFormData((prev: SlotFormData) => ({ ...prev, times: slotPicker.availableTimes }))
                            }
                            disabled={slotPicker.availableTimes.length === 0}
                        >
                            Generate all
                        </button>
                    </div>
                )}

                {slotMode === 'manual' && (
                    <div className="mt-3 flex items-center gap-2">
                        <select
                            value={slotPicker.selectedTime}
                            onChange={e => setSlotPicker((prev: SlotPickerState) => ({ ...prev, selectedTime: e.target.value }))}
                            className="px-3 py-2 border border-gray-300 rounded-md"
                        >
                            <option value="">Select time to add</option>
                            {slotPicker.availableTimes.map((time: string) => (
                                <option key={time} value={time}>{time}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded hover:bg-[var(--brand-tertiary)] text-sm"
                            onClick={() => {
                                if (slotPicker.selectedTime && !slotFormData.times.includes(slotPicker.selectedTime)) {
                                    setSlotFormData((prev: SlotFormData) => ({
                                        ...prev,
                                        times: [...prev.times, slotPicker.selectedTime]
                                    }));
                                }
                            }}
                            disabled={!slotPicker.selectedTime}
                        >
                            Add Slot
                        </button>
                    </div>
                )}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time Slots *
                </label>
                <div className="space-y-3">
                    {slotFormData.times.map((time: string, index: number) => (
                        <div key={index} className="flex items-center gap-2">
                            <span className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50">{time}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveTimeSlot(index)}
                                className="p-2 text-red-600 hover:text-red-800"
                            >
                                <Trash2 className="h-5 w-5" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
