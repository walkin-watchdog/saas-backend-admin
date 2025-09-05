import { Check, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { Product } from "../../types/index";

export const InclusionsExclusions = ({ product }: { product: Product | null }) => {
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

    return (
        <div className="flex flex-col gap-6 p-6">
            {currentProduct.inclusions.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-green-50 border-b border-green-100 px-6 py-4">
                        <h2 className="text-lg font-semibold text-green-800">What's Included</h2>
                    </div>
                    <div className="p-6">
                        <ul className="space-y-3">
                            {currentProduct.inclusions.map((inclusion, index) => (
                                <li key={index} className="flex items-start">
                                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mr-3 mt-0.5">
                                        <Check className="h-3 w-3 text-green-600" />
                                    </div>
                                    <span className="text-gray-700 text-sm leading-relaxed">{inclusion}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {currentProduct.exclusions.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-red-50 border-b border-red-100 px-6 py-4">
                        <h2 className="text-lg font-semibold text-red-800">Not Included</h2>
                    </div>
                    <div className="p-6">
                        <ul className="space-y-3">
                            {currentProduct.exclusions.map((exclusion, index) => (
                                <li key={index} className="flex items-start">
                                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center mr-3 mt-0.5">
                                        <X className="h-3 w-3 text-red-600" />
                                    </div>
                                    <span className="text-gray-700 text-sm leading-relaxed">{exclusion}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};