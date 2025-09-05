import { Plus, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LocationAutocomplete } from "../ui/LocationAutocomplete";
import { getDescription, predefinedCategories } from "./predefinedcategories";
import { ImageUploader } from "../gallery/ImageUploader";
import type { EditItineraryModelProps, ItineraryActivity, Attraction } from "@/types";
import useImageRule from "@/hooks/useImageRule";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


export const EditItineraryModel = ({
  showItineraryBuilder,
  setShowItineraryBuilder,
  editingDay,
  setEditingDay,
  newActivity,
  setNewActivity,
  activityInclusionCategory,
  setActivityInclusionCategory,
  activityInclusionSubcategory,
  setActivityInclusionSubcategory,
  activityInclusionCustomTitle,
  setActivityInclusionCustomTitle,
  activityInclusionCustomDescription,
  setActivityInclusionCustomDescription,
  showActivityInclusionCustomForm,
  setShowActivityInclusionCustomForm,
  activityExclusionCategory,
  setActivityExclusionCategory,
  activityExclusionSubcategory,
  setActivityExclusionSubcategory,
  activityExclusionCustomTitle,
  setActivityExclusionCustomTitle,
  activityExclusionCustomDescription,
  setActivityExclusionCustomDescription,
  showActivityExclusionCustomForm,
  setShowActivityExclusionCustomForm,
  addActivityInclusion,
  addActivityExclusion,
  removeActivity,
  saveItineraryDay
}: EditItineraryModelProps) => {
  const [editingActivityIndex, setEditingActivityIndex] = useState<number | null>(null);
const { user } = useAuth();
const { rule: activityRule } = useImageRule(user?.tenantId, 'itinerary-activity');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const [attractionOptions, setAttractionOptions] = useState<Attraction[]>([]);
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/attractions`)
      .then(r => r.json())
      .then(setAttractionOptions)
      .catch(console.error);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!editingDay || !over) return;

    const oldIndex = parseInt(active.id as string, 10);
    const newIndex = parseInt(over.id as string, 10);
    if (oldIndex === newIndex) return;

    const reordered = arrayMove<ItineraryActivity>(
      editingDay.activities,
      oldIndex,
      newIndex
    ).map((a, i) => ({ ...a, order: i }))
    setEditingDay({ ...editingDay, activities: reordered });
  };

  const SortableActivity = ({
    activity,
    index,
    onEdit,
    onRemove,
  }: {
    activity: any;
    index: number;
    onEdit: (i: number) => void;
    onRemove: (i: number) => void;
  }) => {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: index.toString() });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="flex items-start justify-between bg-white border border-gray-200 px-4 py-3 rounded-md"
      >
         <button
      {...listeners}
      className="mr-3 cursor-grab active:cursor-grabbing p-1"
      title="Drag to reorder"
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
          {activity.description && (
            <div className="text-xs text-gray-600 mt-1">{activity.description}</div>
          )}
          <div className="font-medium text-sm text-gray-900">
            {activity.location}
          </div>
          {activity.stopDuration && (
            <div className="text-xs text-purple-600 mt-1">
              Duration: {activity.stopDuration} {activity.durationUnit || "minutes"}
            </div>
          )}
          {activity.isStop && (
            <div className="text-xs text-blue-600 mt-1">
              Stop • {activity.stopDuration || 0} minutes
            </div>
          )}
          {activity.isAdmissionIncluded && (
            <div className="text-xs text-emerald-600 mt-1">✓ Admission included</div>
          )}
          {activity.inclusions?.length > 0 && (
            <div className="text-xs text-green-600 mt-1">
              Includes: {activity.inclusions.join(", ")}
            </div>
          )}
          {activity.exclusions?.length > 0 && (
            <div className="text-xs text-red-600 mt-1">
              Excludes: {activity.exclusions.join(", ")}
            </div>
          )}
          {activity.images?.length > 0 && (
            <div className="flex space-x-2 mt-2">
              {activity.images.slice(0, 3).map((img: string, i: number) => (
                <img key={i} src={img} alt="" className="w-10 h-10 object-cover rounded" />
              ))}
              {activity.images.length > 3 && (
                <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-600">
                  {activity.images.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2 ml-3">
          <button
            type="button"
            onClick={() => onEdit(index)}
            className="text-blue-500 hover:text-blue-700"
            title="Edit Activity"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path d="M15.232 5.232l3.536 3.536M9 13l6-6m2 2l-6 6m-2 2h6a2 2 0 002-2v-6a2 2 0 00-2-2h-6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-red-500 hover:text-red-700"
            title="Remove Activity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const handleAddActivity = () => {
    if (!newActivity.location || !editingDay) return;

    const finalInclusions = [
      ...(newActivity.inclusions || []),
      ...(activityInclusionSubcategory && !newActivity.inclusions?.includes(activityInclusionSubcategory)
        ? [activityInclusionSubcategory]
        : []),
      ...(activityInclusionCustomTitle ? [activityInclusionCustomTitle] : []),
    ];

    const finalExclusions = [
      ...(newActivity.exclusions || []),
      ...(activityExclusionSubcategory && !newActivity.exclusions?.includes(activityExclusionSubcategory)
        ? [activityExclusionSubcategory]
        : []),
      ...(activityExclusionCustomTitle ? [activityExclusionCustomTitle] : []),
    ];

    setEditingDay({
      ...editingDay,
      activities: [
        ...editingDay.activities,
        { ...newActivity, inclusions: finalInclusions, exclusions: finalExclusions, order: editingDay.activities.length },
      ],
    });

    setNewActivity({ location: '', isStop: false, stopDuration: undefined, durationUnit: 'minutes', isAdmissionIncluded: false, inclusions: [], exclusions: [], order: 0 });
    setActivityInclusionCategory('');
    setActivityInclusionSubcategory('');
    setShowActivityInclusionCustomForm(false);
    setActivityInclusionCustomTitle('');
    setActivityInclusionCustomDescription('');
    setActivityExclusionCategory('');
    setActivityExclusionSubcategory('');
    setShowActivityExclusionCustomForm(false);
    setActivityExclusionCustomTitle('');
    setActivityExclusionCustomDescription('');
  };

  return (
    <>
      {showItineraryBuilder && editingDay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Day {editingDay.day} Itinerary
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowItineraryBuilder(false);
                  setEditingDay(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Day Title *
                </label>
                <input
                  type="text"
                  value={editingDay.title}
                  onChange={(e) => setEditingDay({ ...editingDay, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="e.g., Explore Old Delhi"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  rows={3}
                  value={editingDay.description}
                  onChange={(e) => setEditingDay({ ...editingDay, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="Brief description of the day's activities"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Activities
                </label>
                <div className="space-y-4">
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Link to existing Attraction
                        </label>
                        <select
                          value={newActivity.attractionId || "CUSTOM"}
                          onChange={e => {
                            const val = e.target.value;
                            if (val !== "CUSTOM") {
                              const sel = attractionOptions.find(a => a.id === val)!;
                              setNewActivity((prev: any) => ({
                                ...prev,
                                attractionId: sel.id,
                                location: sel.name,
                                lat:    sel.lat,
                                lng:    sel.lng,
                                placeId: sel.placeId,
                                isStop: prev.isStop ?? true,
                                description: sel.description,
                                stopDuration: sel.duration,
                                durationUnit: sel.durationUnit,
                                images: [sel.image],
                                inclusions: [],
                                exclusions: [],
                                isAdmissionIncluded: false,
                                order: prev.order,
                              }));
                            } else {
                              setNewActivity({
                                attractionId: undefined,
                                location: "",
                                locationLat: undefined,
                                locationLng: undefined,
                                locationPlaceId: undefined,
                                isStop: false,
                                description: "",
                                stopDuration: undefined,
                                durationUnit: "minutes",
                                isAdmissionIncluded: false,
                                images: [],
                                inclusions: [],
                                exclusions: [],
                                order: newActivity.order,
                              });
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs"
                        >
                          <option value="CUSTOM">Custom</option>
                          {attractionOptions.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      {!newActivity.attractionId && (
                        <div className="mt-3 md:col-span-3">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Custom Location *
                          </label>
                          <LocationAutocomplete
                            value={newActivity.location}
                            onChange={(location, lat, lng, placeId) =>
                              setNewActivity(
                                (prev: ItineraryActivity): ItineraryActivity => ({
                                  ...prev,
                                  location,
                                  lat,
                                  lng,
                                  placeId,
                              }))
                            }
                            placeholder="Activity location"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
                            forceInit={showItineraryBuilder}
                          />
                        </div>
                      )}

                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={newActivity.isStop || false}
                            onChange={e => setNewActivity((prev: any) => ({
                              ...prev,
                              isStop: e.target.checked,
                              ...(e.target.checked ? {} : {
                                stopDuration: undefined,
                                durationUnit: "minutes",
                                isAdmissionIncluded: false,
                                images: [],
                              }),
                            }))}
                            className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                          />
                          <span className="text-xs text-gray-700">Is Stop?</span>
                        </label>
                      </div>
                    </div>
                    {newActivity.isStop && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Activity Description <span className="text-gray-400">(Optional)</span>
                        </label>
                        <textarea
                          value={newActivity.description || ""}
                          onChange={(e) =>
                            setNewActivity(
                              (prev: ItineraryActivity): ItineraryActivity => ({
                                ...prev,
                                description: e.target.value,
                              })
                            )
                          }
                          className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-xs"
                          placeholder="Describe this activity (optional)"
                          rows={2}
                        />
                      </div>
                    )}
                    {newActivity.isStop && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Activity Images (Optional)
                        </label>
                        <ImageUploader
                          images={newActivity.images || []}
                          onChange={(images) =>
                            setNewActivity(
                              (prev: ItineraryActivity): ItineraryActivity => ({
                                ...prev,
                                images,
                              })
                            )
                          }
                          maxImages={10}
                          folder="itinerary"
                          title="Activity Images"
                          allowReordering={false}
                          className="mb-4"
                          imageType="itinerary-activity"
                          tenantId={user?.tenantId}
                        />
                        {activityRule && (
                          <p className="text-xs text-gray-500 mb-6">
                            Recommended size: {activityRule.width} × {activityRule.height} px
                          </p>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                      {/* Duration Fields - Only show when isStop is true */}
                      {newActivity.isStop && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Activity Duration
                          </label>
                          <div className="flex space-x-2">
                            <input
                              type="number"
                              min="1"
                              value={newActivity.stopDuration || ''}
                              onChange={(e) => setNewActivity({
                                ...newActivity,
                                stopDuration: e.target.value ? parseInt(e.target.value) : undefined
                              })}
                              placeholder="2"
                              className="w-20 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
                            />
                            <select
                              value={newActivity.durationUnit || 'minutes'}
                              onChange={(e) => setNewActivity({
                                ...newActivity,
                                durationUnit: e.target.value as 'minutes' | 'hours'
                              })}
                              className="px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
                            >
                              <option value="minutes">Minutes</option>
                              <option value="hours">Hours</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Admission Inclusion Field */}
                      {newActivity.isStop && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Admission
                          </label>
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={newActivity.isAdmissionIncluded || false}
                              onChange={(e) => setNewActivity({
                                ...newActivity,
                                isAdmissionIncluded: e.target.checked
                              })}
                              className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                            />
                            <span className="text-xs text-gray-700">Is admission to this place included in the price of your tour?</span>
                          </label>
                        </div>
                      )}
                    </div>
                    {newActivity.isStop && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Inclusions
                          </label>
                          <div className="space-y-2">
                            <div className="space-y-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                <select
                                  value={activityInclusionCategory}
                                  onChange={(e) => {
                                    setActivityInclusionCategory(e.target.value);
                                    setActivityInclusionSubcategory('');
                                    setShowActivityInclusionCustomForm(e.target.value === 'Custom');
                                  }}
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-xs"
                                >
                                  <option value="">Select category...</option>
                                  {Object.keys(predefinedCategories).map(category => (
                                    <option key={category} value={category}>{category}</option>
                                  ))}
                                  <option value="Custom">Custom</option>
                                </select>
                              </div>

                              {activityInclusionCategory && activityInclusionCategory !== 'Custom' && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Item</label>
                                  <select
                                    value={activityInclusionSubcategory}
                                    onChange={(e) => setActivityInclusionSubcategory(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-xs"
                                  >
                                    <option value="">Select item...</option>
                                    {predefinedCategories[activityInclusionCategory as keyof typeof predefinedCategories].items.map(item => (
                                      <option key={item} value={item}>{item}</option>
                                    ))}
                                  </select>
                                  {activityInclusionSubcategory && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {getDescription(activityInclusionCategory, activityInclusionSubcategory)}
                                    </p>
                                  )}
                                </div>
                              )}

                              {showActivityInclusionCustomForm && (
                                <div className="space-y-2 p-2 border border-gray-200 rounded-md bg-white">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Custom Title</label>
                                    <input
                                      type="text"
                                      value={activityInclusionCustomTitle}
                                      onChange={(e) => setActivityInclusionCustomTitle(e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-xs"
                                      placeholder="Enter custom title"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Description (Optional)</label>
                                    <textarea
                                      value={activityInclusionCustomDescription}
                                      onChange={(e) => setActivityInclusionCustomDescription(e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-xs"
                                      placeholder="Enter description (optional)"
                                      rows={2}
                                    />
                                  </div>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={addActivityInclusion}
                                disabled={(!activityInclusionSubcategory && !activityInclusionCustomTitle)}
                                className="w-full px-2 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:bg-gray-300 text-xs"
                              >
                                Add Inclusion
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {(newActivity.inclusions || []).map((inclusion: string, idx: number) => (
                                <span key={idx} className="inline-flex items-center bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                                  {inclusion.length > 25 ? `${inclusion.substring(0, 25)}...` : inclusion}
                                  <button
                                    type="button"
                                    onClick={() => setNewActivity({
                                      ...newActivity,
                                      inclusions: (newActivity.inclusions || []).filter((_: string, i: number) => i !== idx)
                                    })}
                                    className="ml-1 text-green-600 hover:text-green-800"
                                    title={inclusion}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Exclusions
                          </label>
                          <div className="space-y-2">
                            <div className="space-y-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                <select
                                  value={activityExclusionCategory}
                                  onChange={(e) => {
                                    setActivityExclusionCategory(e.target.value);
                                    setActivityExclusionSubcategory('');
                                    setShowActivityExclusionCustomForm(e.target.value === 'Custom');
                                  }}
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-xs"
                                >
                                  <option value="">Select category...</option>
                                  {Object.keys(predefinedCategories).map(category => (
                                    <option key={category} value={category}>{category}</option>
                                  ))}
                                  <option value="Custom">Custom</option>
                                </select>
                              </div>

                              {activityExclusionCategory && activityExclusionCategory !== 'Custom' && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Item</label>
                                  <select
                                    value={activityExclusionSubcategory}
                                    onChange={(e) => setActivityExclusionSubcategory(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-xs"
                                  >
                                    <option value="">Select item...</option>
                                    {predefinedCategories[activityExclusionCategory as keyof typeof predefinedCategories].items.map(item => (
                                      <option key={item} value={item}>{item}</option>
                                    ))}
                                  </select>
                                  {activityExclusionSubcategory && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {getDescription(activityExclusionCategory, activityExclusionSubcategory)}
                                    </p>
                                  )}
                                </div>
                              )}

                              {showActivityExclusionCustomForm && (
                                <div className="space-y-2 p-2 border border-gray-200 rounded-md bg-white">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Custom Title</label>
                                    <input
                                      type="text"
                                      value={activityExclusionCustomTitle}
                                      onChange={(e) => setActivityExclusionCustomTitle(e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-xs"
                                      placeholder="Enter custom title"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Description (Optional)</label>
                                    <textarea
                                      value={activityExclusionCustomDescription}
                                      onChange={(e) => setActivityExclusionCustomDescription(e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-xs"
                                      placeholder="Enter description (optional)"
                                      rows={2}
                                    />
                                  </div>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={addActivityExclusion}
                                disabled={(!activityExclusionSubcategory && !activityExclusionCustomTitle)}
                                className="w-full px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:bg-gray-300 text-xs"
                              >
                                Add Exclusion
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {(newActivity.exclusions || []).map((exclusion: string, idx: number) => (
                                <span key={idx} className="inline-flex items-center bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                                  {exclusion.length > 25 ? `${exclusion.substring(0, 25)}...` : exclusion}
                                  <button
                                    type="button"
                                    onClick={() => setNewActivity({
                                      ...newActivity,
                                      exclusions: (newActivity.exclusions || []).filter((_: string, i: number) => i !== idx)
                                    })}
                                    className="ml-1 text-red-600 hover:text-red-800"
                                    title={exclusion}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end mt-3">
                      {editingActivityIndex === null ? (
                        <button
                          type="button"
                          onClick={handleAddActivity}
                          disabled={!newActivity.location}
                          className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] transition-colors disabled:bg-gray-300 text-sm"
                        >
                          <Plus className="h-4 w-4 inline mr-1" />
                          Add Activity
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setNewActivity({
                                location: '',
                                isStop: false,
                                stopDuration: undefined,
                                durationUnit: 'minutes', // New duration unit field
                                isAdmissionIncluded: false, // New admission field
                                inclusions: [],
                                exclusions: [],
                                order: 0,
                              });
                              setEditingActivityIndex(null);
                            }}
                            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors mr-2 text-sm"
                          >
                            Cancel Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (editingDay && editingActivityIndex !== null) {
                                const finalInclusions = [
                                  ...(newActivity.inclusions ?? []),
                                  ...(activityInclusionSubcategory
                                    ? newActivity.inclusions?.includes(activityInclusionSubcategory)
                                      ? []
                                      : [activityInclusionSubcategory]
                                    : []),
                                  ...(activityInclusionCustomTitle ? [activityInclusionCustomTitle] : []),
                                ];
                                const finalExclusions = [
                                  ...(newActivity.exclusions ?? []),
                                  ...(activityExclusionSubcategory
                                    ? newActivity.exclusions?.includes(activityExclusionSubcategory)
                                      ? []
                                      : [activityExclusionSubcategory]
                                    : []),
                                  ...(activityExclusionCustomTitle ? [activityExclusionCustomTitle] : []),
                                ];
                          
                                const activityToSave = {
                                  ...newActivity,
                                  inclusions: finalInclusions,
                                  exclusions: finalExclusions,
                                  order: editingActivityIndex,
                                };
                          
                                const updatedActivities = [...editingDay.activities];
                                updatedActivities[editingActivityIndex] = activityToSave;
                                setEditingDay({ ...editingDay, activities: updatedActivities });
                                setNewActivity({
                                  location: '',
                                  isStop: false,
                                  stopDuration: undefined,
                                  durationUnit: 'minutes',
                                  isAdmissionIncluded: false,
                                  inclusions: [],
                                  exclusions: [],
                                  order: 0,
                                });
                                setActivityInclusionCategory('');
                                setActivityInclusionSubcategory('');
                                setShowActivityInclusionCustomForm(false);
                                setActivityInclusionCustomTitle('');
                                setActivityInclusionCustomDescription('');
                                setActivityExclusionCategory('');
                                setActivityExclusionSubcategory('');
                                setShowActivityExclusionCustomForm(false);
                                setActivityExclusionCustomTitle('');
                                setActivityExclusionCustomDescription('');
                                setEditingActivityIndex(null);
                              }
                            }}
                            disabled={!newActivity.location}
                            className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] transition-colors disabled:bg-gray-300 text-sm"
                          >
                            Save Activity
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={editingDay.activities.map((_unused: unknown, i: number) => i.toString())}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {editingDay.activities.map((activity: any, index: number) => (
                          <SortableActivity
                            key={index}
                            activity={activity}
                            index={index}
                            onEdit={(i) => {
                              setNewActivity(editingDay.activities[i]);
                              setEditingActivityIndex(i);
                            }}
                            onRemove={removeActivity}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  {/* <div className="space-y-2">
                    {editingDay.activities.map((activity: any, index: number) => (
                      <div key={index} className="flex items-start justify-between bg-white border border-gray-200 px-4 py-3 rounded-md">
                        <div className="flex-1">
                          {activity.description && (
                            <div className="text-xs text-gray-600 mt-1">
                              {activity.description}
                            </div>
                          )}
                          <div className="font-medium text-sm text-gray-900">{activity.location}</div>
                          {activity.stopDuration && (
                            <div className="text-xs text-purple-600 mt-1">
                              Duration: {activity.stopDuration} {activity.durationUnit || 'minutes'}
                            </div>
                          )}
                          {activity.isStop && (
                            <div className="text-xs text-blue-600 mt-1">
                              Stop • {activity.stopDuration || 0} minutes
                            </div>
                          )}
                          {activity.isAdmissionIncluded && (
                            <div className="text-xs text-emerald-600 mt-1">
                              ✓ Admission included
                            </div>
                          )}
                          {(activity.inclusions && activity.inclusions.length > 0) && (
                            <div className="text-xs text-green-600 mt-1">
                              Includes: {activity.inclusions.join(', ')}
                            </div>
                          )}
                          {(activity.exclusions && activity.exclusions.length > 0) && (
                            <div className="text-xs text-red-600 mt-1">
                              Excludes: {activity.exclusions.join(', ')}
                            </div>
                          )}
                          {activity.images && activity.images.length > 0 && (
                            <div className="flex space-x-2 mt-2">
                              {activity.images.slice(0, 3).map((img: string, idx: number) => (
                                <img key={idx} src={img} alt="" className="w-10 h-10 object-cover rounded" />
                              ))}
                              {activity.images.length > 3 && (
                                <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-600">
                                  +{activity.images.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 ml-3">
                          <button
                            type="button"
                            onClick={() => {
                              setNewActivity(activity);
                              setEditingActivityIndex(index);
                            }}
                            className="text-blue-500 hover:text-blue-700"
                            title="Edit Activity"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M9 13l6-6m2 2l-6 6m-2 2h6a2 2 0 002-2v-6a2 2 0 00-2-2h-6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeActivity(index)}
                            className="text-red-500 hover:text-red-700"
                            title="Remove Activity"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div> */}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowItineraryBuilder(false);
                    setEditingDay(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveItineraryDay}
                  className="px-4 py-2 rounded-md text-white transition-colors bg-[var(--brand-primary)] hover:bg-[var(--brand-tertiary)]
                             disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={
                    !editingDay.title ||
                    !editingDay.description ||
                    !!newActivity.location ||
                    editingActivityIndex !== null
                  }
                >
                  Save Day
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};