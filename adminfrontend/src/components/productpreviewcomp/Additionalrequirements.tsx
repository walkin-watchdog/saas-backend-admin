import { Link } from "react-router-dom";
import { Phone, CreditCard, Calendar, Heart, Utensils, Shield, FileText, AlertCircle, CheckCircle } from "lucide-react";
import type { Product } from "../../types/index";

export const AdditionalRequirements = ({ product }: { product: Product | null }) => {
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

    const getRequirementIcon = (type: string) => {
        switch (type) {
            case 'phone': return <Phone className="h-4 w-4" />;
            case 'id': return <CreditCard className="h-4 w-4" />;
            case 'age': return <Calendar className="h-4 w-4" />;
            case 'medical': return <Heart className="h-4 w-4" />;
            case 'dietary': return <Utensils className="h-4 w-4" />;
            case 'emergency': return <Shield className="h-4 w-4" />;
            case 'passport': return <FileText className="h-4 w-4" />;
            default: return <CheckCircle className="h-4 w-4" />;
        }
    };

    return (<div>
  {(currentProduct.requirePhone || currentProduct.requireId || currentProduct.requireAge ||
                currentProduct.requireMedical || currentProduct.requireDietary ||
                currentProduct.requireEmergencyContact || currentProduct.requirePassportDetails ||
                (Array.isArray(currentProduct.customRequirementFields) && currentProduct.customRequirementFields.length > 0) ||
                currentProduct.additionalRequirements) && (
                    <div className="p-6">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl flex items-center justify-center">
                                <AlertCircle className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-xl font-bold text-gray-800">Required Information from Travelers</h4>
                        </div>
                        <div className="bg-gradient-to-br from-red-50/50 to-pink-50/50 rounded-2xl p-6 border border-red-100">
                            <div className="grid gap-4">
                                {currentProduct.requirePhone && (
                                    <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                            {getRequirementIcon('phone')}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-800 block">Phone Number</span>
                                            <span className="text-sm text-gray-600">Valid phone number required</span>
                                        </div>
                                    </div>
                                )}
                                {currentProduct.requireId && (
                                    <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                            {getRequirementIcon('id')}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-800 block">Photo ID</span>
                                            <span className="text-sm text-gray-600">Government-issued photo ID</span>
                                        </div>
                                    </div>
                                )}
                                {currentProduct.requireAge && (
                                    <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                                            {getRequirementIcon('age')}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-800 block">Age Verification</span>
                                            <span className="text-sm text-gray-600">Age verification for all travelers</span>
                                        </div>
                                    </div>
                                )}
                                {currentProduct.requireMedical && (
                                    <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                                            {getRequirementIcon('medical')}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-800 block">Medical Information</span>
                                            <span className="text-sm text-gray-600">Medical information and restrictions</span>
                                        </div>
                                    </div>
                                )}
                                {currentProduct.requireDietary && (
                                    <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                                            {getRequirementIcon('dietary')}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-800 block">Dietary Requirements</span>
                                            <span className="text-sm text-gray-600">Dietary restrictions and preferences</span>
                                        </div>
                                    </div>
                                )}
                                {currentProduct.requireEmergencyContact && (
                                    <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                                            {getRequirementIcon('emergency')}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-800 block">Emergency Contact</span>
                                            <span className="text-sm text-gray-600">Emergency contact information</span>
                                        </div>
                                    </div>
                                )}
                                {currentProduct.requirePassportDetails && (
                                    <div className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                            {getRequirementIcon('passport')}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-800 block">Passport Details</span>
                                            <span className="text-sm text-gray-600">Passport details for international travelers</span>
                                        </div>
                                    </div>
                                )}

                                {Array.isArray(currentProduct.customRequirementFields) && currentProduct.customRequirementFields.map((field: any, index: number) => (
                                    <div key={index} className="flex items-center space-x-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                            {getRequirementIcon('default')}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-800 block">{field.label} {field.required && <span className="text-red-500">*</span>}</span>
                                            <span className="text-sm text-gray-600">Custom requirement field</span>
                                        </div>
                                    </div>
                                ))}

                                {currentProduct.additionalRequirements && (
                                    <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mt-1">
                                                <AlertCircle className="h-4 w-4 text-blue-600" />
                                            </div>
                                            <div>
                                                <span className="font-semibold text-gray-800 block mb-1">Additional Requirements</span>
                                                <span className="text-gray-700 leading-relaxed">{currentProduct.additionalRequirements}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                </div>)
            }