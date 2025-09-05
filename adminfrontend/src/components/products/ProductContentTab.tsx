import { useState, useEffect } from 'react';
import { Info, Image, Route, MapPin, Star, Settings, Users, CheckCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { DestinationModal } from './DestinationModal';
import { ExperienceCategoryModal } from './ExperienceCategoryModal';
import { useToast } from '../ui/toaster';
import { BasicInfo } from '../productcontenttabs/Basicinfo';
import { ProductImagesTab } from '../productcontenttabs/images';
import type { ItineraryActivity, ItineraryDay, newItem, ProductContentTabProps } from '../../types/index.ts';
import { ItineraryTab } from '../productcontenttabs/itinerary';
import { PickupOptionsTab } from '../productcontenttabs/PickupOptions';
import { getDescription } from '../productcontenttabs/predefinedcategories';
import { ContentElements } from '../productcontenttabs/ContentElements';
import { AdditionalDetailsTab } from '../productcontenttabs/AdditionalDetails';
import { GuidesAndLang } from '../productcontenttabs/GuidesAndLang.tsx';
import { validateTab, validateTabWithToast } from './Validation';
import { EditItineraryModel } from '../productcontenttabs/edititinerarymodel';
import { nanoid } from 'nanoid';

const contentTabs = [
  { id: 'basic', name: 'Basic Info', shortName: 'Basic', icon: Info },
  { id: 'images', name: 'Images', shortName: 'Images', icon: Image },
  { id: 'itinerary', name: 'Itinerary', shortName: 'Routes', icon: Route },
  { id: 'pickup', name: 'Pickup Options', shortName: 'Pickup', icon: MapPin },
  { id: 'content', name: 'Inclusions', shortName: 'Content', icon: Star },
  { id: 'details', name: 'Additional Details', shortName: 'Details', icon: Settings },
  { id: 'guides', name: 'Guides & Languages', shortName: 'Guides', icon: Users },
];

interface ProductContentTabPropsExt {
  initialTab?: string;
  hideSidebar?: boolean;
  destinations: any[];
  experienceCategories: any[];
  isLoadingDestinations: boolean;
  isLoadingCategories: boolean;
  onDestinationsCreated: () => void;
  onCategoriesCreated: () => void;
  isEdit: boolean;
}
export const ProductContentTab = ({
  formData, updateFormData,
  initialTab, hideSidebar,
  destinations, experienceCategories,
  isLoadingDestinations, isLoadingCategories,
  onDestinationsCreated,
  onCategoriesCreated,
  isEdit,
}: ProductContentTabProps & ProductContentTabPropsExt) => {
  const [activeContentTab, setActiveContentTab] = useState(initialTab ?? 'basic');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [newItem, setNewItem] = useState<newItem>({
    highlight: '',
    inclusion: '',
    inclusionText: '',
    exclusion: '',
    exclusionText: '',
    tag: '',
    pickupLocation: '',
    guide: '',
    language: '',
    accessibilityFeature: '',
  });
  const toast = useToast();
  const [showItineraryBuilder, setShowItineraryBuilder] = useState(false);
  const [editingDay, setEditingDay] = useState<ItineraryDay | null>(null);
  const [newActivity, setNewActivity] = useState<ItineraryActivity>({
    location: '',
    isStop: false,
    stopDuration: undefined,
    durationUnit: 'minutes',
    isAdmissionIncluded: false,
    inclusions: [],
    exclusions: [],
    order: 0,
    description: '',
    images: [],
  });
  const [isDestinationModalOpen, setIsDestinationModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [pickupOption, setPickupOption] = useState(formData.pickupOption || '');
  useEffect(() => {
    setPickupOption(formData.pickupOption || '');
  }, [formData.pickupOption]);
  
  const isDraft = formData.isDraft;

  const getAllowedDays = () => {
    const durationLower = formData.duration?.toLowerCase() || '';
    if (durationLower.includes('hour')) return 1;
    if (formData.duration === 'Full Day' || formData.duration === 'Half Day') return 1;
    const n = parseInt(formData.duration?.split(' ')[0] || '0', 10);
    return isNaN(n) || n < 1 ? 0 : n;
  };

  const [activityInclusionCategory, setActivityInclusionCategory] = useState('');
  const [activityInclusionSubcategory, setActivityInclusionSubcategory] = useState('');
  const [activityInclusionCustomTitle, setActivityInclusionCustomTitle] = useState('');
  const [activityInclusionCustomDescription, setActivityInclusionCustomDescription] = useState('');
  const [showActivityInclusionCustomForm, setShowActivityInclusionCustomForm] = useState(false);

  const [activityExclusionCategory, setActivityExclusionCategory] = useState('');
  const [activityExclusionSubcategory, setActivityExclusionSubcategory] = useState('');
  const [activityExclusionCustomTitle, setActivityExclusionCustomTitle] = useState('');
  const [activityExclusionCustomDescription, setActivityExclusionCustomDescription] = useState('');
  const [showActivityExclusionCustomForm, setShowActivityExclusionCustomForm] = useState(false);

  const handleTabChange = (newTabId: string) => {
    const currentTabIndex = contentTabs.findIndex(tab => tab.id === activeContentTab);
    const newTabIndex = contentTabs.findIndex(tab => tab.id === newTabId);

    if (newTabIndex > currentTabIndex && !isDraft) {
      for (let i = 0; i <= currentTabIndex; i++) {
        const tabToValidate = contentTabs[i].id;
        if (!validateTabWithToast(tabToValidate, formData, toast)) {
          return;
        }
      }
    }
    setActiveContentTab(newTabId);
    setIsMobileMenuOpen(false); // Close mobile menu after selection
  };

  const getCurrentTabIndex = () => {
    return contentTabs.findIndex(tab => tab.id === activeContentTab);
  };

  const canGoNext = () => {
    return getCurrentTabIndex() < contentTabs.length - 1;
  };

  const canGoPrevious = () => {
    return getCurrentTabIndex() > 0;
  };

  const handleNext = () => {
    const currentIndex = getCurrentTabIndex();
    if (canGoNext()) {
      handleTabChange(contentTabs[currentIndex + 1].id);
    }
  };

  const handlePrevious = () => {
    const currentIndex = getCurrentTabIndex();
    if (canGoPrevious()) {
      handleTabChange(contentTabs[currentIndex - 1].id);
    }
  };

  const addActivity = () => {
    if (newActivity.location.trim() && editingDay) {
      const activityToAdd = {
        ...newActivity,
        order: editingDay.activities.length,
      };

      setEditingDay({
        ...editingDay,
        activities: [...editingDay.activities, activityToAdd]
      });

      setNewActivity({
        location: '',
        isStop: false,
        stopDuration: undefined,
        durationUnit: 'minutes',
        isAdmissionIncluded: false,
        inclusions: [],
        exclusions: [],
        order: 0,
        description: '',
        images: []
      });
    }
  };

  const removeActivity = (index: number) => {
    if (!editingDay) return;
    setEditingDay({
      ...editingDay,
      activities: editingDay.activities.filter((_, i) => i !== index)
    });
  };

  const saveItineraryDay = () => {
    if (!editingDay) return;

    const activitiesWithOrder = editingDay.activities.map((activity, index) => ({
      ...activity,
      order: activity.order ?? index
    }));

    const dayToSave = {
      ...editingDay,
      activities: activitiesWithOrder
    };

    const currentItinerary = formData.itineraries || [];
    const existingIndex = currentItinerary.findIndex((day: ItineraryDay) => day.day === dayToSave.day);

    const next = existingIndex >= 0
      ? currentItinerary.map((d: ItineraryDay, i: number) => i === existingIndex ? dayToSave : d)
      : [...currentItinerary, dayToSave];
    const updatedItinerary = next
      .sort((a: ItineraryDay, b: ItineraryDay) => a.day - b.day)
      .map((d: ItineraryDay, idx: number) => ({ ...d, day: idx + 1 }));

    updateFormData({ itineraries: updatedItinerary });
    setEditingDay(null);
    setShowItineraryBuilder(false);
  };

  const createNewDay = () => {
    const currentItinerary = formData.itineraries || [];
    const maxDays = getAllowedDays();
    if (currentItinerary.length >= maxDays) {
      toast({ message: `Itinerary already has the maximum of ${maxDays} day${maxDays > 1 ? 's' : ''}.`, type: 'error' });
      return;
    }
    const nextDay = currentItinerary.length + 1;

    setEditingDay({
      id: nanoid(),
      day: nextDay,
      title: '',
      description: '',
      activities: [],
      images: []
    });
    setShowItineraryBuilder(true);
  };

  const editDay = (day: ItineraryDay) => {
    setEditingDay({ ...day });
    setShowItineraryBuilder(true);
  };

  const removeDay = (dayNumber: number) => {
    const currentItinerary = formData.itineraries || [];
    const filtered = currentItinerary.filter((day: ItineraryDay) => day.day !== dayNumber);
    const renumbered = filtered.map((d: ItineraryDay, idx: number) => ({ ...d, day: idx + 1 }));
    updateFormData({ itineraries: renumbered });
  };

  const addItem = (field: string, value: string) => {
    if (!value.trim()) return;

    updateFormData({
      [field]: [...(formData[field] || []), value.trim()]
    });

    setNewItem(prev => ({ ...prev, [field]: '' }));
  };

  const removeItem = (field: string, index: number) => {
    updateFormData({
      [field]: formData[field].filter((_: any, i: number) => i !== index)
    });
  };

  const handleDestinationSelect = (destination: any) => {
    updateFormData({
      location: destination.name,
      destinationId: destination.id
    });
    setIsDestinationModalOpen(false);
  };

  const handleCategorySelect = (category: any) => {
    updateFormData({
      category: category.name,
      experienceCategoryId: category.id
    });
    setIsCategoryModalOpen(false);
  };

  const addActivityInclusion = () => {
    let itemToAdd = '';
    if (showActivityInclusionCustomForm && activityInclusionCustomTitle) {
      itemToAdd = activityInclusionCustomDescription ?
        `${activityInclusionCustomTitle} - ${activityInclusionCustomDescription}` :
        activityInclusionCustomTitle;
    } else if (activityInclusionSubcategory) {
      const description = getDescription(activityInclusionCategory, activityInclusionSubcategory);
      itemToAdd = description ?
        `${activityInclusionSubcategory} - ${description}` :
        activityInclusionSubcategory;
    }

    if (itemToAdd) {
      setNewActivity({
        ...newActivity,
        inclusions: [...(newActivity.inclusions || []), itemToAdd]
      });
      setActivityInclusionCategory('');
      setActivityInclusionSubcategory('');
      setActivityInclusionCustomTitle('');
      setActivityInclusionCustomDescription('');
      setShowActivityInclusionCustomForm(false);
    }
  };

  const addActivityExclusion = () => {
    let itemToAdd = '';
    if (showActivityExclusionCustomForm && activityExclusionCustomTitle) {
      itemToAdd = activityExclusionCustomDescription ?
        `${activityExclusionCustomTitle} - ${activityExclusionCustomDescription}` :
        activityExclusionCustomTitle;
    } else if (activityExclusionSubcategory) {
      const description = getDescription(activityExclusionCategory, activityExclusionSubcategory);
      itemToAdd = description ?
        `${activityExclusionSubcategory} - ${description}` :
        activityExclusionSubcategory;
    }

    if (itemToAdd) {
      setNewActivity({
        ...newActivity,
        exclusions: [...(newActivity.exclusions || []), itemToAdd]
      });
      setActivityExclusionCategory('');
      setActivityExclusionSubcategory('');
      setActivityExclusionCustomTitle('');
      setActivityExclusionCustomDescription('');
      setShowActivityExclusionCustomForm(false);
    }
  };

  const renderTabContent = () => {
    switch (activeContentTab) {
      case 'basic':
        return (
          <BasicInfo
            formData={formData}
            updateFormData={updateFormData}
            destinations={destinations}
            experienceCategories={experienceCategories}
            setIsCategoryModalOpen={setIsCategoryModalOpen}
            setIsDestinationModalOpen={setIsDestinationModalOpen}
            isLoadingCategories={isLoadingCategories}
            isLoadingDestinations={isLoadingDestinations}
            isEdit={isEdit}
          />
        );
      case 'images':
        return (
          <ProductImagesTab
            formData={formData}
            updateFormData={updateFormData}
          />
        );

      case 'itinerary':
        return (
          <ItineraryTab
            updateFormData={updateFormData}
            formData={formData}
            createNewDay={createNewDay}
            editDay={editDay}
            removeDay={removeDay}
            getAllowedDays={getAllowedDays}
          />
        );
      case 'pickup':
        return (
          <PickupOptionsTab
            formData={formData}
            updateFormData={updateFormData}
            setPickupOption={setPickupOption}
            pickupOption={pickupOption}
          />
        );

      case 'content':
        return (
          <ContentElements
            formData={formData}
            newItem={newItem}
            setNewItem={setNewItem}
            addItem={addItem}
            removeItem={removeItem}
            getDescription={getDescription}
          />
        );

      case 'details':
        return (
          <AdditionalDetailsTab
            formData={formData}
            updateFormData={updateFormData}
            newItem={newItem}
            setNewItem={setNewItem}
            removeItem={removeItem}
            addItem={addItem}
          />
        );

      case 'guides':
        return (
          <GuidesAndLang
            formData={formData}
            updateFormData={updateFormData}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="md:flex space-y-4 md:space-y-0">
      {/* Sidebar tabs */}
      {!hideSidebar && (
        <aside className="hidden md:block w-64 bg-white rounded-lg shadow-sm border border-gray-200 mr-6 overflow-y-auto">
          <nav className="p-4 space-y-1">
            {contentTabs.map((tab) => {
              const Icon = tab.icon;
              const isValid = validateTab(tab.id, formData);
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeContentTab === tab.id
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  <span className="flex-1 text-left">{tab.name}</span>
                  {isValid ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>
      )}

      {/* Main content */}
      <main className="flex-1 space-y-4 md:space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Mobile Tab Navigation */}
          {!hideSidebar && (
            <div className="md:hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <button
                  onClick={handlePrevious}
                  disabled={!canGoPrevious()}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                
                <div className="flex-1 text-center">
                  <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="text-sm font-medium text-gray-900"
                  >
                    {contentTabs.find(tab => tab.id === activeContentTab)?.name}
                  </button>
                </div>
                
                <button
                  onClick={handleNext}
                  disabled={!canGoNext()}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              
              {/* Mobile Menu Dropdown */}
              {isMobileMenuOpen && (
                <div className="absolute z-20 left-0 right-0 bg-white border-b border-gray-200 shadow-lg">
                  <div className="py-2">
                    {contentTabs.map((tab) => {
                      const Icon = tab.icon;
                      const isValid = validateTab(tab.id, formData);
                      return (
                        <button
                          key={tab.id}
                          onClick={() => handleTabChange(tab.id)}
                          className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 ${
                            activeContentTab === tab.id ? 'bg-orange-50 text-[var(--brand-primary)]' : 'text-gray-700'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <Icon className="h-5 w-5" />
                            <span className="font-medium">{tab.name}</span>
                          </div>
                          {isValid ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-gray-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Desktop Tab Navigation */}
          <div className="hidden">
            <nav className="-mb-px flex space-x-1 overflow-x-auto px-4 scrollbar-hide">
              {contentTabs.map((tab) => {
                const Icon = tab.icon;
                const isValid = validateTab(tab.id, formData);
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`py-4 px-3 border-b-2 font-medium text-sm transition-colors flex items-center space-x-2 whitespace-nowrap flex-shrink-0 min-w-max ${
                      activeContentTab === tab.id
                        ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden lg:inline">{tab.name}</span>
                    <span className="lg:hidden">{tab.shortName}</span>
                    {isValid ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-3 sm:p-4 md:p-6">
            {renderTabContent()}
          </div>
        </div>
      </main>

      <EditItineraryModel
        showItineraryBuilder={showItineraryBuilder}
        setShowItineraryBuilder={setShowItineraryBuilder}
        editingDay={editingDay}
        setEditingDay={setEditingDay}
        newActivity={newActivity}
        setNewActivity={setNewActivity}
        activityInclusionCategory={activityInclusionCategory}
        setActivityInclusionCategory={setActivityInclusionCategory}
        activityInclusionSubcategory={activityInclusionSubcategory}
        setActivityInclusionSubcategory={setActivityInclusionSubcategory}
        activityInclusionCustomTitle={activityInclusionCustomTitle}
        setActivityInclusionCustomTitle={setActivityInclusionCustomTitle}
        activityInclusionCustomDescription={activityInclusionCustomDescription}
        setActivityInclusionCustomDescription={setActivityInclusionCustomDescription}
        showActivityInclusionCustomForm={showActivityInclusionCustomForm}
        setShowActivityInclusionCustomForm={setShowActivityInclusionCustomForm}
        activityExclusionCategory={activityExclusionCategory}
        setActivityExclusionCategory={setActivityExclusionCategory}
        activityExclusionSubcategory={activityExclusionSubcategory}
        setActivityExclusionSubcategory={setActivityExclusionSubcategory}
        activityExclusionCustomTitle={activityExclusionCustomTitle}
        setActivityExclusionCustomTitle={setActivityExclusionCustomTitle}
        activityExclusionCustomDescription={activityExclusionCustomDescription}
        setActivityExclusionCustomDescription={setActivityExclusionCustomDescription}
        showActivityExclusionCustomForm={showActivityExclusionCustomForm}
        setShowActivityExclusionCustomForm={setShowActivityExclusionCustomForm}
        addActivityInclusion={addActivityInclusion}
        addActivityExclusion={addActivityExclusion}
        addActivity={addActivity}
        removeActivity={removeActivity}
        saveItineraryDay={saveItineraryDay}
      />

      {isDestinationModalOpen && (
        <DestinationModal
          isOpen={isDestinationModalOpen}
          onClose={() => setIsDestinationModalOpen(false)}
          onSelect={handleDestinationSelect}
          onCreated={onDestinationsCreated}
        />
      )}

      {isCategoryModalOpen && (
        <ExperienceCategoryModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          onSelect={handleCategorySelect}
          onCreated={onCategoriesCreated}
        />
      )}
    </div>
  );
};