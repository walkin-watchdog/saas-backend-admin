import { AlertCircle, Calendar, CheckCircle, Clock, MapPin, Share2, Star, Users, Zap, Target, Globe } from "lucide-react";
import { useState } from 'react';
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import type { Product } from "../../types/index";
import { getDynamicRatingData } from "../../utils/dynamicRating";

export const ProductOverview = ({
  overviewRef,
  dateStatus,
  product,
}: {
  overviewRef: React.RefObject<HTMLDivElement | null>;
  dateStatus?: 'AVAILABLE'|'SOLD_OUT'|'NOT_OPERATING'|null;
  product: Product | null;
}) => {
  const currentProduct = product;
  
  // Generate dynamic rating data
  const dynamicRating = currentProduct ? getDynamicRatingData(currentProduct.id) : { rating: 4.8, formattedCount: '200' };
     const getAvailabilityStatus = () => {
            if (!currentProduct) {
                return {
                    status: 'unavailable',
                    message: 'Currently Unavailable',
                    color: 'text-gray-600',
                    bgColor: 'bg-gray-50',
                    borderColor: 'border-gray-200',
                    icon: AlertCircle
                };
            }
    
            const { permanentAvailabilityStatus, availabilityStartDate, availabilityEndDate, availabilitySubranges } = currentProduct;

            const today = new Date();
            let status: 'AVAILABLE'|'SOLD_OUT'|'NOT_OPERATING' = 'AVAILABLE';
            let nextAvailableDate: Date | null = null;

            if (permanentAvailabilityStatus) {
              status = permanentAvailabilityStatus;
            } else {

              if (today < new Date(availabilityStartDate)
              || (availabilityEndDate && today > new Date(availabilityEndDate))) {
                status = 'NOT_OPERATING';
              } else {

                const inSold = availabilitySubranges.some(r=>
                  r.status==='SOLD_OUT'
                  && today>=new Date(r.startDate)
                  && today<=new Date(r.endDate)
                );
                const inNotOp = availabilitySubranges.some(r=>
                  r.status==='NOT_OPERATING'
                  && today>=new Date(r.startDate)
                  && today<=new Date(r.endDate)
                );
                status = inSold ? 'SOLD_OUT' : inNotOp ? 'NOT_OPERATING' : 'AVAILABLE';
              }
            }
    
            const statusMap = {
                SOLD_OUT: {
                    status: 'sold_out',
                    message: 'Currently Sold Out',
                    color: 'text-red-600',
                    bgColor: 'bg-red-50',
                    borderColor: 'border-red-200',
                    icon: AlertCircle
                },
                NOT_OPERATING: {
                    status: 'not_operating',
                    message: 'Not Currently Operating',
                    color: 'text-gray-600',
                    bgColor: 'bg-gray-50',
                    borderColor: 'border-gray-200',
                    icon: AlertCircle
                }
            } as const;
    
            if (status in statusMap) return statusMap[status as keyof typeof statusMap];
    
            if (nextAvailableDate) {
                const date = new Date(nextAvailableDate);
                if (date > new Date()) {
                    return {
                        status: 'upcoming',
                        message: `Next Available: ${date.toLocaleDateString()}`,
                        color: 'text-blue-600',
                        bgColor: 'bg-blue-50',
                        borderColor: 'border-blue-200',
                        icon: Calendar
                    };
                }
            }
    
            return {
                status: 'available',
                message: 'Available for Booking',
                color: 'text-green-600',
                bgColor: 'bg-green-50',
                borderColor: 'border-green-200',
                icon: CheckCircle
            };
        };
    
       if (!currentProduct) {
            return (
                <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h1>
                        <Link to="/destinations" className="text-[var(--brand-primary)] hover:underline">
                            Back to Destinations
                        </Link>
                    </div>
                </div>
            );
        }

  const [showFullDesc, setShowFullDesc] = useState(false);
  const DESC_LIMIT = 180;

  return (
    <div ref={overviewRef} className="bg-white rounded-lg shadow-sm p-6 mb-8 scroll-mt-20">
      {/* Tour Badge and Share */}
      <div className="flex items-center justify-between mb-4">
        <span className="bg-[var(--brand-secondary)] text-white px-3 py-1 rounded-full text-sm font-medium">
          {currentProduct.type}
        </span>
        <button
          onClick={() => {
            navigator.clipboard
              .writeText(window.location.href)
              .then(() => toast.success('Link copied!'));
          }}
          className="p-2 text-gray-400 hover:text-[var(--brand-primary)] transition-colors"
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        {currentProduct.highlights && currentProduct.highlights.length > 0 && (
          <div className="flex space-x-2">
            {currentProduct.highlights.map((highlight: string, index: number) => (
              <div key={index} className="bg-[var(--brand-primary)] text-white px-3 py-1 rounded-full text-sm font-medium">
                {highlight}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tour Title */}
      <h1 className="text-3xl font-bold text-gray-900 mb-6">{currentProduct.title}</h1>

      {/* Availability Status */}
      {(() => {
        const availability = dateStatus && dateStatus !== 'AVAILABLE'
          ? {
              status: dateStatus === 'SOLD_OUT' ? 'sold_out' : 'not_operating',
              message: dateStatus === 'SOLD_OUT'
                ? 'Currently Sold Out'
                : 'Not Currently Operating',
              color: dateStatus === 'SOLD_OUT' ? 'text-red-600' : 'text-gray-600',
              bgColor: dateStatus === 'SOLD_OUT' ? 'bg-red-50' : 'bg-gray-50',
              borderColor: dateStatus === 'SOLD_OUT' ? 'border-red-200' : 'border-gray-200',
              icon: AlertCircle
            }
          : getAvailabilityStatus();

        const IconComponent = availability.icon;

        return availability.status !== 'available' && (
          <div className={`${availability.bgColor} ${availability.borderColor} border rounded-lg p-4 mb-6`}>
            <div className="flex items-center">
              <IconComponent className={`h-5 w-5 ${availability.color} mr-3`} />
              <div>
                <p className={`font-medium ${availability.color}`}>
                  {availability.message}
                </p>
                {availability.status === 'sold_out' && (
                  <p className="text-sm text-gray-600 mt-1">
                    Join our newsletter to be notified when spots become available
                  </p>
                )}
                {availability.status === 'not_operating' && (
                  <p className="text-sm text-gray-600 mt-1">
                    This experience is temporarily unavailable. Check back later for updates.
                  </p>
                )}
                {availability.status === 'upcoming' && (
                  <p className="text-sm text-gray-600 mt-1">
                    Booking will open soon for the next available dates
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Description */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">About</h3>
        <p className="text-gray-600 leading-relaxed">
            {showFullDesc || currentProduct.description.length <= DESC_LIMIT
              ? currentProduct.description
              : currentProduct.description.slice(0, DESC_LIMIT) + "…"}
          </p>
          {currentProduct.description.length > DESC_LIMIT && (
            <button
              onClick={() => setShowFullDesc(!showFullDesc)}
              className="mt-2 text-sm font-medium text-[var(--brand-primary)] hover:underline"
            >
              {showFullDesc ? "Read less" : "Read more"}
            </button>
          )}
      </div>

      {/* Key Information Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="flex items-center text-gray-600">
          <MapPin className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
          <div>
            <p className="text-xs text-gray-500">Destination</p>
            <p className="font-medium">{currentProduct.location}</p>
          </div>
        </div>
        
        <div className="flex items-center text-gray-600">
          <Clock className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
          <div>
            <p className="text-xs text-gray-500">Duration</p>
            <p className="font-medium">{currentProduct.duration}</p>
          </div>
        </div>
        
        <div className="flex items-center text-gray-600">
          <Users className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
          <div>
            <p className="text-xs text-gray-500">Max People</p>
            <p className="font-medium">Up to {currentProduct.capacity}</p>
          </div>
        </div>

        {currentProduct.tourType && currentProduct.tourType !== 'public' && (
          <div className="flex items-center text-gray-600">
            <Zap className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
            <div>
              <p className="text-xs text-gray-500">Tour Type</p>
              <p className="font-medium capitalize">{currentProduct.tourType}</p>
            </div>
          </div>
        )}

        {currentProduct.difficulty && (
          <div className="flex items-center text-gray-600">
            <Target className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
            <div>
              <p className="text-xs text-gray-500">Difficulty</p>
              <span className={`inline-block px-2 py-1 text-xs font-medium ${
                currentProduct.difficulty === 'Easy' ? 'bg-green-100 text-green-800' :
                currentProduct.difficulty === 'Moderate' ? 'bg-yellow-100 text-yellow-800' :
                currentProduct.difficulty === 'Challenging' ? 'bg-orange-100 text-orange-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {currentProduct.difficulty}
              </span>
            </div>
          </div>
        )}

        {/* ­­­­­­­­­­­­­­Languages */}
        {currentProduct.guides &&
          Array.isArray(currentProduct.guides) &&
          currentProduct.guides.length > 0 && (
            <div className="flex items-center text-gray-600">
              <Globe className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
              <div>
                <p className="text-xs text-gray-500">Languages</p>
                <p className="font-medium">
                  {currentProduct.guides
                    .map((g: any) => g.language)
                    .filter((lang: string, idx: number, arr: string[]) => lang && arr.indexOf(lang) === idx)
                    .join(", ")}
                </p>
              </div>
            </div>
          )}

        <div className="flex items-center text-gray-600">
          <Star className="h-4 w-4 mr-2 text-yellow-400 fill-current" />
          <div>
            <p className="text-xs text-gray-500">Rating</p>
            <p className="font-medium">{dynamicRating.rating} ({dynamicRating.formattedCount})</p>
          </div>
        </div>
      </div>
    </div>
  );
};