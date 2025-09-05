import { MapPin, Clock, Users, Navigation, CheckCircle, XCircle } from "lucide-react";
import type { Product } from "../../types/index";

export const PickupMeetingInfo = ({ product }: { product: Product | null }) => {
    const currentProduct = product;
    if (!currentProduct) {
        return null;
    }
    return (
        <div>

            {(
                (Array.isArray(currentProduct.pickupLocationDetails) && currentProduct.pickupLocationDetails.length > 0) ||
                (Array.isArray(currentProduct.pickupLocations) && currentProduct.pickupLocations.length > 0) ||
                currentProduct.pickupOption ||
                currentProduct.allowTravelersPickupPoint ||
                currentProduct.meetingPoint ||
                (Array.isArray(currentProduct.meetingPoints) && currentProduct.meetingPoints.length > 0)
            ) && (
                    <div className="p-6">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                                <MapPin className="h-5 w-5 text-white" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Pickup & Meeting Information</h3>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-2xl p-6 space-y-6 border border-blue-100">

                            {/* Pickup Option */}
                            {currentProduct.pickupOption && (
                                <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-blue-100">
                                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                        <Navigation className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <span className="font-semibold text-gray-800 block">Pickup Option</span>
                                        <span className="text-gray-600">{currentProduct.pickupOption}</span>
                                    </div>
                                </div>
                            )}

                            {/* Allow Travelers to Choose Pickup Point */}
                            {typeof currentProduct.allowTravelersPickupPoint === 'boolean' && (
                                <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-blue-100">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentProduct.allowTravelersPickupPoint ? 'bg-green-100' : 'bg-red-100'}`}>
                                        {currentProduct.allowTravelersPickupPoint ? (
                                            <CheckCircle className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <XCircle className="h-4 w-4 text-red-600" />
                                        )}
                                    </div>
                                    <div>
                                        <span className="font-semibold text-gray-800 block">Traveler Choice</span>
                                        <span className={`font-medium ${currentProduct.allowTravelersPickupPoint ? 'text-green-600' : 'text-red-600'}`}>
                                            {currentProduct.allowTravelersPickupPoint ? 'Can choose pickup point' : 'Fixed pickup points only'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Pickup Start Time */}
                            {currentProduct.pickupStartTime && (
                                <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-blue-100">
                                    <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                                        <Clock className="h-4 w-4 text-orange-600" />
                                    </div>
                                    <div>
                                        <span className="font-semibold text-gray-800 block">Pickup Start Time</span>
                                        <span className="text-gray-600">{currentProduct.pickupStartTime}</span>
                                    </div>
                                </div>
                            )}

                            {/* Pickup Locations (Detailed) */}
                            {Array.isArray(currentProduct.pickupLocationDetails) && currentProduct.pickupLocationDetails.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center space-x-2">
                                        <MapPin className="h-5 w-5 text-blue-600" />
                                        <h4 className="text-lg font-semibold text-gray-800">Pickup Locations</h4>
                                    </div>
                                    <div className="grid gap-3">
                                        {currentProduct.pickupLocationDetails.map((loc: any, idx: number) => (
                                            <div key={idx} className="group bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-200 transition-all duration-200">
                                                <div className="flex items-start space-x-3">
                                                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mt-1 group-hover:bg-blue-200 transition-colors duration-200">
                                                        <span className="text-blue-600 font-medium text-sm">{idx + 1}</span>
                                                    </div>
                                                    <div className="font-medium text-gray-800 group-hover:text-blue-600 transition-colors duration-200">{loc.address}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Pickup Locations (String) fallback */}
                            {(!currentProduct.pickupLocationDetails || currentProduct.pickupLocationDetails.length === 0) &&
                                Array.isArray(currentProduct.pickupLocations) && currentProduct.pickupLocations.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center space-x-2">
                                            <MapPin className="h-5 w-5 text-blue-600" />
                                            <h4 className="text-lg font-semibold text-gray-800">Pickup Locations</h4>
                                        </div>
                                        <div className="grid gap-3">
                                            {currentProduct.pickupLocations.map((location: string, idx: number) => (
                                                <div key={idx} className="group flex items-center space-x-3 p-3 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-200 transition-all duration-200">
                                                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors duration-200">
                                                        <span className="text-blue-600 font-medium text-sm">{idx + 1}</span>
                                                    </div>
                                                    <span className="text-gray-700 group-hover:text-blue-600 transition-colors duration-200">{location}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                            {/* Meeting Point (old string) */}
                            {currentProduct.meetingPoint && typeof currentProduct.meetingPoint === 'string' && !Array.isArray(currentProduct.meetingPoints) && (
                                <div className="space-y-3">
                                    <div className="flex items-center space-x-2">
                                        <Users className="h-5 w-5 text-green-600" />
                                        <h4 className="text-lg font-semibold text-gray-800">Meeting Point</h4>
                                    </div>
                                    <div className="p-4 bg-white rounded-xl shadow-sm border border-green-200">
                                        <p className="text-gray-700 leading-relaxed">{currentProduct.meetingPoint}</p>
                                    </div>
                                </div>
                            )}

                            {/* Meeting Points (array) */}
                            {Array.isArray(currentProduct.meetingPoints) && currentProduct.meetingPoints.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center space-x-2">
                                        <Users className="h-5 w-5 text-green-600" />
                                        <h4 className="text-lg font-semibold text-gray-800">Meeting Points</h4>
                                    </div>
                                    <div className="grid gap-3">
                                        {currentProduct.meetingPoints.map((point: any, idx: number) => (
                                            <div key={idx} className="group bg-white rounded-xl p-4 shadow-sm border border-green-200 hover:shadow-md hover:border-green-300 transition-all duration-200">
                                                <div className="flex items-start space-x-3">
                                                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-1 group-hover:bg-green-200 transition-colors duration-200">
                                                        <span className="text-green-600 font-medium text-sm">{idx + 1}</span>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="font-medium text-gray-800 group-hover:text-green-600 transition-colors duration-200">{point.address}</div>
                                                        {point.description && (
                                                            <div className="text-sm text-gray-600 leading-relaxed">{point.description}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Tour End at Meeting Point */}
                            {currentProduct.doesTourEndAtMeetingPoint !== undefined && (
                                <div className="p-4 bg-white rounded-xl border border-blue-100 shadow-sm flex items-center space-x-4 mt-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentProduct.doesTourEndAtMeetingPoint ? 'bg-green-100' : 'bg-orange-100'} transition-colors`}>
                                        <span className={`w-3 h-3 rounded-full ${currentProduct.doesTourEndAtMeetingPoint ? 'bg-green-500' : 'bg-orange-500'} animate-pulse`}></span>
                                    </div>
                                    <div>
                                        <span className="text-base font-semibold text-gray-800">
                                            {currentProduct.doesTourEndAtMeetingPoint
                                                ? 'Tour ends back at meeting point(s)'
                                                : 'Tour does not end at meeting point(s)'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* End Point Locations */}
                            {Array.isArray(currentProduct.endPoints) && currentProduct.endPoints.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center space-x-2">
                                        <Navigation className="h-5 w-5 text-purple-600" />
                                        <h4 className="text-lg font-semibold text-gray-800">End Point Locations</h4>
                                    </div>
                                    <div className="grid gap-3">
                                        {currentProduct.endPoints.map((loc: any, idx: number) => (
                                            <div key={idx} className="group bg-white rounded-xl p-4 shadow-sm border border-purple-200 hover:shadow-md hover:border-purple-300 transition-all duration-200">
                                                <div className="flex items-start space-x-3">
                                                    <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center mt-1 group-hover:bg-purple-200 transition-colors duration-200">
                                                        <span className="text-purple-600 font-medium text-sm">{idx + 1}</span>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="font-medium text-gray-800 group-hover:text-purple-600 transition-colors duration-200">{loc.address}</div>
                                                        {loc.description && loc.description.trim() !== '' && (
                                                            <div className="text-sm text-gray-600 leading-relaxed">{loc.description}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                )}
        </div>
    )
}