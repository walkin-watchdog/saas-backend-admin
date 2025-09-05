import type { Toast } from "@/types";

export const validateTab = (tabId: string, formData: any) => {
  if (formData.isDraft) return true;
  switch (tabId) {
    case 'basic':
      return formData.title && formData.description &&
        formData.type && formData.location && formData.duration && formData.capacity;
    case 'images':
      return Array.isArray(formData.images) && formData.images.length >= 1;
    case 'itinerary':
      return formData.type !== 'TOUR' || (formData.itineraries && formData.itineraries.length > 0);
    case 'pickup':
      if (!formData.pickupOption) return false;

      if (formData.pickupOption.startsWith('We pick up all travelers')) {
        const hasPreset = Array.isArray(formData.pickupLocationDetails) &&
                          formData.pickupLocationDetails.length > 0;
        const travellersChoose = !!formData.allowTravelersPickupPoint;
        return hasPreset || travellersChoose;
      }

      if (formData.pickupOption.includes('meeting point')) {
        const hasMeetingArr = Array.isArray(formData.meetingPoints) &&
                              formData.meetingPoints.length > 0;
        const hasSingle    = typeof formData.meetingPoint === 'string' &&
                             formData.meetingPoint.trim() !== '';
        const hasMeeting   = hasMeetingArr || hasSingle;
    
        if (formData.doesTourEndAtMeetingPoint === false) {
          const hasEnd = Array.isArray(formData.endPoints) &&
                         formData.endPoints.length > 0;
          return hasMeeting && hasEnd;
        }
        return hasMeeting;
      }

      return true;
    case 'content':
      return (
        (formData.inclusions && formData.inclusions.length > 0) ||
        (formData.tags && formData.tags.length > 0)
      );
    case 'details':
      return (
        !!formData.difficulty ||
        (formData.accessibilityFeatures && formData.accessibilityFeatures.length > 0) ||
        !!formData.wheelchairAccessible ||
        !!formData.strollerAccessible ||
        !!formData.serviceAnimalsAllowed ||
        !!formData.publicTransportAccess ||
        !!formData.infantSeatsRequired ||
        !!formData.infantSeatsAvailable ||
        (formData.healthRestrictions && formData.healthRestrictions.length > 0)
      );
    case 'guides':
      return (
        (Array.isArray(formData.guides)    && formData.guides.length    > 0) ||
        (Array.isArray(formData.languages) && formData.languages.length > 0)
      );
    case 'requirements':
      return Boolean(
        formData.requirePhone ||
        formData.requireId ||
        formData.requireAge ||
        formData.requireMedical ||
        formData.requireDietary ||
        formData.requireEmergencyContact ||
        formData.requirePassportDetails ||
        (formData.customRequirementFields && formData.customRequirementFields.length > 0)
      );
    case 'schedule':
      return(
        Array.isArray(formData.packages) &&
        formData.packages.length > 0 &&
        formData.packages.every(
          (p: any) =>
            (Array.isArray(p.slotConfigs) && p.slotConfigs.length > 0) ||
            (Array.isArray(p.slots)       && p.slots.length       > 0)
        )
      );
    default:
      return true;
  }
};

export const validateTabWithToast = (tabId: string, formData: any, toast: (t: Omit<Toast, 'id'>) => void): boolean => {
  if (formData.isDraft) return true;
  switch (tabId) {
    case 'basic':
      const missingBasicFields = [];
      if (!formData.title) missingBasicFields.push('Title');
      if (!formData.description) missingBasicFields.push('Description');
      if (!formData.type) missingBasicFields.push('Product Type');
      if (!formData.location) missingBasicFields.push('Location');
      if (!formData.duration) missingBasicFields.push('Duration');
      if (!formData.capacity) missingBasicFields.push('Max Capacity');
      if (formData.type === 'EXPERIENCE' && !formData.category) missingBasicFields.push('Category');
      if (missingBasicFields.length > 0) {
        toast({
          message: `Please fill the following required fields: ${missingBasicFields.join(', ')}`,
          type: 'error'
        });
        return false;
      }
      return true;
    case 'images':
      if (!formData.images || formData.images.length < 1) {
        toast({
          message: 'Please upload at least one product image',
          type: 'error'
        });
        return false;
      }
      return true;
    case 'itinerary':
      if (formData.type === 'TOUR' && (!formData.itineraries || formData.itineraries.length === 0)) {
        toast({
          message: 'Please add at least one day to the itinerary for tours',
          type: 'error'
        });
        return false;
      }
      return true;
    case 'pickup':
      if (!formData.pickupOption) {
        toast({
          message: 'Please select a pickup option',
          type: 'error'
        });
        return false;
      }
      if (formData.pickupOption.startsWith('We pick up all travelers')) {
        const hasPreset = Array.isArray(formData.pickupLocationDetails) &&
                          formData.pickupLocationDetails.length > 0;
        const travellersChoose = !!formData.allowTravelersPickupPoint;
        if (!hasPreset && !travellersChoose) {
          toast({
            message: 'Add at least one pickup location or allow travellers to set one',
            type: 'error',
          });
          return false;
        }
      }
      if ((formData.pickupOption === 'We can pick up travelers or meet them at a meeting point' ||
        formData.pickupOption === 'No, we meet all travelers at a meeting point') &&
        !formData.meetingPoint && (!formData.meetingPoints || formData.meetingPoints.length === 0)) {
        toast({
          message: 'Please provide at least one meeting point',
          type: 'error'
        });
        return false;
      }
      if (formData.pickupOption.includes('meeting point') &&
          formData.doesTourEndAtMeetingPoint === false &&
          (!formData.endPoints || formData.endPoints.length === 0)) {
        toast({
          message: 'Please provide at least one end location',
          type: 'error',
        });
        return false;
      }
      return true;
    case 'content':
    case 'details':
      return true;
    case 'guides':
      if (
        (!Array.isArray(formData.guides)    || formData.guides.length    === 0) &&
        (!Array.isArray(formData.languages) || formData.languages.length === 0)
      ) {
        toast({
          message: 'Please add at least one guide or language',
          type: 'error'
        });
        return false;
      }
      return true;
    case 'requirements':
      if (
        !formData.requirePhone &&
        !formData.requireId &&
        !formData.requireAge &&
        !formData.requireMedical &&
        !formData.requireDietary &&
        !formData.requireEmergencyContact &&
        !formData.requirePassportDetails &&
        (!formData.customRequirementFields ||
          formData.customRequirementFields.length === 0)
      ) {
        toast({
          message: 'Please select at least one traveller requirement',
          type: 'error',
        });
        return false;
      }
      return true;

    case 'schedule':
      if (
        !Array.isArray(formData.packages) ||
        formData.packages.length === 0 ||
        !formData.packages.every(
          (p: any) =>
            (Array.isArray(p.slotConfigs) && p.slotConfigs.length > 0) ||
            (Array.isArray(p.slots)       && p.slots.length       > 0)
        )
      ) {
        toast({
          message: 'Configure at least one slot per package.',
          type: 'error',
        });
        return false;
      }
      return true;
    default:
      return true;
  }
};