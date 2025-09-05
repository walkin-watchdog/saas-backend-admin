export default function ProductHelp() {
    return (
        <div className="p-4 sm:p-6">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 sm:p-6 border border-green-200">
                <div className="flex items-center space-x-3 mb-4 sm:mb-6">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="h-4 w-4 sm:h-5 sm:w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 2.25a9.75 9.75 0 100 19.5 9.75 9.75 0 000-19.5z" />
                        </svg>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900">Customer Assistance</h3>
                </div>
                <div className="space-y-4">
                    <p className="text-gray-700 leading-relaxed mb-4 text-sm sm:text-base">Need assistance? Our reservation team is here to help you 24/7.</p>

                    <div className="grid gap-3 sm:gap-4">
                        <div className="flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-white rounded-xl shadow-sm border border-green-100">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                                <span className="font-semibold text-gray-800 block text-sm sm:text-base">Phone Support</span>
                                <span className="text-blue-600 font-medium text-sm sm:text-base break-all">{import.meta.env.VITE_COMPANY_PHONE}</span>
                            </div>
                        </div>

                        <div className="flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-white rounded-xl shadow-sm border border-green-100">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                                <span className="font-semibold text-gray-800 block text-sm sm:text-base">Email Support</span>
                                <span className="text-purple-600 font-medium text-sm sm:text-base break-all">{import.meta.env.VITE_COMPANY_SUPPORT_EMAIL}</span>
                            </div>
                        </div>

                        <div className="flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-white rounded-xl shadow-sm border border-green-100">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                                <span className="font-semibold text-gray-800 block text-sm sm:text-base">Availability</span>
                                <span className="text-green-600 font-medium text-sm sm:text-base">24/7 for your convenience</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}