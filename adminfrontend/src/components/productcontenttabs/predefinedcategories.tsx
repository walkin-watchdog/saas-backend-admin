export const predefinedCategories = {
  'Food and Drink': {
    items: ['Meals', 'Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages', 'Bottled water', 'Alcoholic drinks'],
    descriptions: {
      'Meals': 'General meal provision',
      'Breakfast': 'Morning meal',
      'Lunch': 'Midday meal',
      'Dinner': 'Evening meal',
      'Snacks': 'Light refreshments',
      'Beverages': 'Drinks and refreshments',
      'Bottled water': 'Complimentary water',
      'Alcoholic drinks': 'Alcoholic beverages'
    }
  },
  'Excess Charges': {
    items: ['Excess baggage', 'Overweight limit', 'Extra luggage fees', 'Oversized items'],
    descriptions: {
      'Excess baggage': 'Additional baggage beyond limits',
      'Overweight limit': 'Charges for overweight luggage',
      'Extra luggage fees': 'Additional luggage costs',
      'Oversized items': 'Charges for large items'
    }
  },
  'Transportation Amenities': {
    items: ['Private transportation', 'WiFi on board', 'Public transportation', 'Air conditioned vehicle', 'Pick-up and drop-off', 'Fuel surcharge'],
    descriptions: {
      'Private transportation': 'Dedicated vehicle service',
      'WiFi on board': 'Internet connectivity during travel',
      'Public transportation': 'Use of public transport systems',
      'Air conditioned vehicle': 'Climate controlled transport',
      'Pick-up and drop-off': 'Hotel/location transfers',
      'Fuel surcharge': 'Additional fuel costs'
    }
  },
  'Fees': {
    items: ['Landing and facility fees', 'Gratuities', 'Government fees', 'Entrance fees', 'Parking', 'Fuel surcharge', 'Airport/departure tax'],
    descriptions: {
      'Landing and facility fees': 'Airport and facility charges',
      'Gratuities': 'Tips and service charges',
      'Government fees': 'Official government charges',
      'Entrance fees': 'Admission to attractions',
      'Parking': 'Vehicle parking costs',
      'Fuel surcharge': 'Additional fuel costs',
      'Airport/departure tax': 'Airport taxes and fees'
    }
  },
  'Use of Equipment': {
    items: ['Use of SCUBA equipment', 'Use of Segway', 'Use of trikke', 'Use of snorkelling equipment', 'Use of bicycle', 'Booster seat', 'Locker', 'Safety equipment', 'Audio guides'],
    descriptions: {
      'Use of SCUBA equipment': 'Diving gear and equipment',
      'Use of Segway': 'Personal transportation device',
      'Use of trikke': 'Three-wheeled vehicle',
      'Use of snorkelling equipment': 'Swimming and diving gear',
      'Use of bicycle': 'Bicycle rental and use',
      'Booster seat': 'Child safety seat',
      'Locker': 'Storage facility',
      'Safety equipment': 'Safety gear and equipment',
      'Audio guides': 'Audio tour equipment'
    }
  }
} as const;

export const getDescription = (category: string, item: string): string => {
    const categoryData = predefinedCategories[category as keyof typeof predefinedCategories];
    return categoryData?.descriptions[item as keyof typeof categoryData.descriptions] || '';
  };

 export const predefinedPolicies = {
      standard: {
        label: 'Standard (Recommended)',
        description: 'Full refund 24+ hours before, no refund after',
        freeCancellationHours: 24,
        partialRefundPercent: 0,
        noRefundAfterHours: 24,
        terms: [
          { timeframe: '24+ hours before start', refundPercent: 100, description: 'Full refund available' },
          { timeframe: 'Less than 24 hours', refundPercent: 0, description: 'No refund available' }
        ]
      },
      moderate: {
        label: 'Moderate',
        description: 'Full refund 4+ days before, 50% refund 3-6 days before',
        freeCancellationHours: 96, // 4 days
        partialRefundPercent: 50,
        noRefundAfterHours: 72, // 3 days
        terms: [
          { timeframe: '4+ days before start', refundPercent: 100, description: 'Full refund available' },
          { timeframe: '3-6 days before start', refundPercent: 50, description: '50% refund available' },
          { timeframe: 'Less than 3 days', refundPercent: 0, description: 'No refund available' }
        ]
      },
      strict: {
        label: 'Strict',
        description: 'Full refund 7+ days before, 50% refund 3-6 days before',
        freeCancellationHours: 168, // 7 days
        partialRefundPercent: 50,
        noRefundAfterHours: 72, // 3 days
        terms: [
          { timeframe: '7+ days before start', refundPercent: 100, description: 'Full refund available' },
          { timeframe: '3-6 days before start', refundPercent: 50, description: '50% refund available' },
          { timeframe: 'Less than 3 days', refundPercent: 0, description: 'No refund available' }
        ]
      },
      no_refund: {
        label: 'All Sales Final',
        description: 'No refunds regardless of cancellation timing',
        freeCancellationHours: 0,
        partialRefundPercent: 0,
        noRefundAfterHours: 0,
        terms: [
          { timeframe: 'Any time before start', refundPercent: 0, description: 'No refunds available' }
        ]
      }
    };
  
  