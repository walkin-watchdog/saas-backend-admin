import { Link } from "react-router-dom";
import { Baby, Heart, Train, CheckCircle, XCircle, Users, Shield, Accessibility } from "lucide-react";
import type { Product } from "../../types/index";

export const AccessibilityInfo = ({ product }: { product: Product | null }) => {
    const currentProduct = product;
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

    const getAccessibilityIcon = (type: string) => {
        switch (type) {
            case 'wheelchair': return <Accessibility className="h-5 w-5" />;
            case 'stroller': return <Baby className="h-5 w-5" />;
            case 'service': return <Heart className="h-5 w-5" />;
            case 'transport': return <Train className="h-5 w-5" />;
            case 'infant': return <Users className="h-5 w-5" />;
            default: return <Accessibility className="h-5 w-5" />;
        }
    };

    return (
        <div className="p-6">
            <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                    <Accessibility className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Accessibility Information</h3>
            </div>
            <div className="bg-gradient-to-br from-purple-50/50 to-pink-50/50 rounded-2xl p-6 border border-purple-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Wheelchair Accessibility */}
                    {currentProduct.wheelchairAccessible && (
                        <div className="group bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-200 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentProduct.wheelchairAccessible === 'yes' ? 'bg-green-100' : 'bg-red-100'}`}>
                                        {getAccessibilityIcon('wheelchair')}
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">Wheelchair</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    {currentProduct.wheelchairAccessible === 'yes' ? (
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-red-600" />
                                    )}
                                    <span className={`text-sm font-semibold ${currentProduct.wheelchairAccessible === 'yes' ? 'text-green-600' : 'text-red-600'}`}>
                                        {currentProduct.wheelchairAccessible === 'yes' ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stroller Accessibility */}
                    {currentProduct.strollerAccessible && (
                        <div className="group bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-200 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentProduct.strollerAccessible === 'yes' ? 'bg-green-100' : 'bg-red-100'}`}>
                                        {getAccessibilityIcon('stroller')}
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">Stroller</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    {currentProduct.strollerAccessible === 'yes' ? (
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-red-600" />
                                    )}
                                    <span className={`text-sm font-semibold ${currentProduct.strollerAccessible === 'yes' ? 'text-green-600' : 'text-red-600'}`}>
                                        {currentProduct.strollerAccessible === 'yes' ? 'Friendly' : 'Limited'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Service Animals */}
                    {currentProduct.serviceAnimalsAllowed && (
                        <div className="group bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-200 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentProduct.serviceAnimalsAllowed === 'yes' ? 'bg-green-100' : 'bg-red-100'}`}>
                                        {getAccessibilityIcon('service')}
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">Service Animals</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    {currentProduct.serviceAnimalsAllowed === 'yes' ? (
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-red-600" />
                                    )}
                                    <span className={`text-sm font-semibold ${currentProduct.serviceAnimalsAllowed === 'yes' ? 'text-green-600' : 'text-red-600'}`}>
                                        {currentProduct.serviceAnimalsAllowed === 'yes' ? 'Allowed' : 'Not Allowed'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Public Transport Access */}
                    {currentProduct.publicTransportAccess && (
                        <div className="group bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-200 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentProduct.publicTransportAccess === 'yes' ? 'bg-green-100' : 'bg-orange-100'}`}>
                                        {getAccessibilityIcon('transport')}
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">Public Transport</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    {currentProduct.publicTransportAccess === 'yes' ? (
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-orange-600" />
                                    )}
                                    <span className={`text-sm font-semibold ${currentProduct.publicTransportAccess === 'yes' ? 'text-green-600' : 'text-orange-600'}`}>
                                        {currentProduct.publicTransportAccess === 'yes' ? 'Accessible' : 'Limited'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Infant Seating */}
                    {currentProduct.infantSeatsRequired && (
                        <div className="group bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-200 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                        {getAccessibilityIcon('infant')}
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">Infant Seating</span>
                                </div>
                                <span className="text-sm font-semibold text-blue-600">
                                    {currentProduct.infantSeatsRequired === 'yes' ? 'On Laps' : 'Separate Seats'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Infant Seats Available */}
                    {currentProduct.infantSeatsAvailable && (
                        <div className="group bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-200 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentProduct.infantSeatsAvailable === 'yes' ? 'bg-green-100' : 'bg-red-100'}`}>
                                        <Baby className="h-4 w-4" />
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">Infant Seats</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    {currentProduct.infantSeatsAvailable === 'yes' ? (
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-red-600" />
                                    )}
                                    <span className={`text-sm font-semibold ${currentProduct.infantSeatsAvailable === 'yes' ? 'text-green-600' : 'text-red-600'}`}>
                                        {currentProduct.infantSeatsAvailable === 'yes' ? 'Available' : 'Not Available'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Additional Accessibility Features */}
                {currentProduct.accessibilityFeatures &&
                    Array.isArray(currentProduct.accessibilityFeatures) &&
                    currentProduct.accessibilityFeatures.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-purple-200">
                            <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                                <Shield className="h-5 w-5 text-purple-600" />
                                <span>Additional Features</span>
                            </h4>
                            <div className="grid gap-3">
                                {currentProduct.accessibilityFeatures.map((feature: string, idx: number) => (
                                    <div key={idx} className="flex items-center space-x-3 p-3 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                                        <span className="text-gray-700">{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                                    {/* // Health Restrictions Section */}
                {currentProduct.healthRestrictions &&
                    Array.isArray(currentProduct.healthRestrictions) &&
                    currentProduct.healthRestrictions.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-red-200">
                            <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                                <Heart className="h-5 w-5 text-red-500" />
                                <span>Health Restrictions</span>
                            </h4>
                            <div className="grid gap-3">
                                {currentProduct.healthRestrictions.map((restriction: string, idx: number) => (
                                    <div key={idx} className="flex items-center space-x-3 p-3 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                        <span className="text-gray-700">{restriction}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
            </div>
        </div>
    )
}