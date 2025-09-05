import type { ItineraryDay, ItineraryTabProps } from "../../types/index.ts";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Route } from "lucide-react";

 const SortableDay = ({
  day,
  editDay,
  removeDay,
}: {
  day: ItineraryDay;
  editDay: (d: ItineraryDay) => void;
  removeDay: (n: number) => void;
}) => {
  const idStr = day.id;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: idStr });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex items-center justify-between"
    >
      {/* Drag Handle */}
      <button
        {...listeners}
        className="mr-4 cursor-grab active:cursor-grabbing p-1"
        title="Drag to reorder day"
        style={{ touchAction: 'none' }}
        type="button"
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 20 20">
          <circle cx="5" cy="6" r="1.5" fill="#888" />
          <circle cx="5" cy="10" r="1.5" fill="#888" />
          <circle cx="5" cy="14" r="1.5" fill="#888" />
          <circle cx="15" cy="6" r="1.5" fill="#888" />
          <circle cx="15" cy="10" r="1.5" fill="#888" />
          <circle cx="15" cy="14" r="1.5" fill="#888" />
        </svg>
      </button>
      <div className="flex-1">
        <h4 className="font-medium text-gray-900">
          Day {day.day}: {day.title}
        </h4>
        <p className="text-sm text-gray-600">{day.description}</p>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={() => editDay(day)}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          Edit
        </button>
        <button
          onClick={() => removeDay(day.day)}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          Remove
        </button>
      </div>
    </div>
  );
};

export const ItineraryTab = ({
    formData,
    updateFormData,
    createNewDay,
    editDay,
    removeDay,
    getAllowedDays,

}: ItineraryTabProps) => {
    const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      const itineraries = formData.itineraries;
      if (!over || !itineraries) return;

      const activeId = active.id as string;
      const overId   = over.id   as string;
      if (activeId !== overId) {
        const oldIndex = itineraries.findIndex(d => d.id === activeId);
        const newIndex = itineraries.findIndex(d => d.id === overId);
        const reordered = arrayMove(itineraries, oldIndex, newIndex);
        const numbered = reordered.map((day, idx) => ({
          ...day,
          day: idx + 1,
        }));
        updateFormData({ itineraries: numbered });
      }
    };

    return (
        <div className="space-y-6">
            {formData.type === 'TOUR' ? (
                <>
                    <div className="mb-4 text-red-600 text-sm">
                      {(() => {
                        let requiredDays = getAllowedDays();
                        if (formData.duration.toLowerCase().includes('hour')) {
                          requiredDays = 1;
                        }
                        const label = formData.duration
                          .toLowerCase()
                          .replace(/s$/, '');
        
                        return (formData.itineraries?.length || 0) < requiredDays
                          ? `You must add at least ${requiredDays} day${requiredDays > 1 ? 's' : ''} to the itinerary for a ${label} tour.`
                          : null;
                      })()}
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-lg font-medium text-gray-900">Tour Itinerary</h4>
                            <p className="text-sm text-gray-600">Plan your tour day by day</p>
                        </div>
                        <button
                            type="button"
                            onClick={createNewDay}
                            className={`flex items-center px-4 py-2 rounded-md transition-colors text-white ${(formData.itineraries?.length || 0) >= getAllowedDays()
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-[var(--brand-primary)] hover:bg-[var(--brand-tertiary)]'
                                }`}
                            disabled={(formData.itineraries?.length || 0) >= getAllowedDays()}
                        >
                            <Calendar className="h-4 w-4 mr-2" />
                            Add Day
                        </button>
                    </div>

                    {formData.itineraries && formData.itineraries.length > 0 ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={formData.itineraries.map(d => d.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-4">
                                    {formData.itineraries.map((day: ItineraryDay) => (
                                        <SortableDay key={day.id} day={day} editDay={editDay} removeDay={removeDay} />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>       
                    ) : (
                        <div className="text-center py-8 bg-gray-50 rounded-lg">
                            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600">No itinerary days added yet</p>
                            <p className="text-sm text-gray-500">Click "Add Day" to start planning your tour</p>
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Route className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Itinerary is only available for Tours</p>
                    <p className="text-sm text-gray-500">Switch to Tour type to add itinerary</p>
                </div>
            )}
        </div>
    );
}