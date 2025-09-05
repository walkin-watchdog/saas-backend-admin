import { useState } from "react";

interface NavbarProps {
    overviewRef: React.RefObject<HTMLDivElement | null>;
    itineraryRef: React.RefObject<HTMLDivElement | null>;
    detailsRef: React.RefObject<HTMLDivElement | null>;
    isExperience?: boolean;
}

export const Navbar = ({
    overviewRef,
    itineraryRef,
    detailsRef,
    isExperience = false,
}: NavbarProps) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'itinerary'>('overview');
    
    const handleTabClick = (tab: 'overview' | 'details' | 'itinerary' ) => {
        setActiveTab(tab);
        const refs = {
            overview: overviewRef,
            details: detailsRef,
            itinerary: itineraryRef,
        };
        const targetRef = refs[tab];
        if (targetRef.current) {
            targetRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }
    };

    const tabs = isExperience
        ? (['overview', 'details'] as const)
        : (['overview', 'details', 'itinerary'] as const);


    return (
        <div className="bg-white rounded-lg shadow-sm mb-8 sticky top-0 z-10">
            <nav className="border-b flex space-x-8 px-6">
                {tabs.map((t) => (
                    <button
                        key={t}
                        onClick={() => handleTabClick(t)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === t
                                ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {{
                            overview: 'Overview',
                            details: 'Details',
                            itinerary: 'Itinerary',
                        }[t]}
                    </button>
                ))}
            </nav>
        </div>
    );
};