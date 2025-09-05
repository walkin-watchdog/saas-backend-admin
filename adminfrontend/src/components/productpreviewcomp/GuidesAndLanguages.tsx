import { Users, Volume2, FileText, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import type { Product } from "../../types/index";

export const GuidesAndLanguages = ({ product }: { product: Product | null }) => {
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
    <div>

{currentProduct.guides && Array.isArray(currentProduct.guides) && currentProduct.guides.length > 0 && (
    <div className="p-4 md:p-6">
                                <div className="flex items-center space-x-3 mb-4 md:mb-6">
                                    <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center">
                                        <Globe className="h-4 w-4 md:h-5 md:w-5 text-white" />
                                    </div>
                                    <h3 className="text-lg md:text-xl font-bold text-gray-900">Available Guides & Languages</h3>
                                </div>
                                <div className="bg-gradient-to-br from-indigo-50/50 to-blue-50/50 rounded-2xl p-4 md:p-6 border border-indigo-100">
                                    <div className="space-y-3 md:space-y-4">
                                        {currentProduct.guides.map((guide: any, idx: number) => (
                                            <div key={idx} className="group bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-200 transition-all duration-200">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                                                    <div className="flex items-center space-x-3 md:space-x-4">
                                                        <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-indigo-100 to-blue-100 rounded-full flex items-center justify-center group-hover:from-indigo-200 group-hover:to-blue-200 transition-all duration-200">
                                                            <Globe className="h-5 w-5 md:h-6 md:w-6 text-indigo-600" />
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-base md:text-lg text-gray-900 group-hover:text-indigo-600 transition-colors duration-200">{guide.language}</div>
                                                            <div className="text-xs md:text-sm text-gray-500">Guide Language</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 sm:ml-4">
                                                        {guide.inPerson && (
                                                            <div className="flex items-center bg-blue-100 text-blue-700 px-2.5 md:px-3 py-1 md:py-1.5 rounded-full border border-blue-200 hover:bg-blue-200 transition-colors duration-200">
                                                                <Users className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-1.5" />
                                                                <span className="text-xs md:text-sm font-medium">In-person</span>
                                                            </div>
                                                        )}
                                                        {guide.audio && (
                                                            <div className="flex items-center bg-green-100 text-green-700 px-2.5 md:px-3 py-1 md:py-1.5 rounded-full border border-green-200 hover:bg-green-200 transition-colors duration-200">
                                                                <Volume2 className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-1.5" />
                                                                <span className="text-xs md:text-sm font-medium">Audio</span>
                                                            </div>
                                                        )}
                                                        {guide.written && (
                                                            <div className="flex items-center bg-purple-100 text-purple-700 px-2.5 md:px-3 py-1 md:py-1.5 rounded-full border border-purple-200 hover:bg-purple-200 transition-colors duration-200">
                                                                <FileText className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-1.5" />
                                                                <span className="text-xs md:text-sm font-medium">Written</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    )}