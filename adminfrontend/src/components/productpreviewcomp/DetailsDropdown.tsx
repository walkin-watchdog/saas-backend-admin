import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface DetailsDropdownProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    isOpen?: boolean;
    onToggle?: (isOpen: boolean) => void;
}

export const DetailsDropdown = ({ title, children, defaultOpen = false, isOpen, onToggle }: DetailsDropdownProps) => {
    const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
    
    // Use controlled state if provided, otherwise use internal state
    const dropdownIsOpen = isOpen !== undefined ? isOpen : internalIsOpen;
    
    const handleToggle = () => {
        const newState = !dropdownIsOpen;
        if (onToggle) {
            onToggle(newState);
        } else {
            setInternalIsOpen(newState);
        }
    };

    return (
        <div className="group border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-all duration-300 hover:border-[var(--brand-primary)]/30">
            <button
                onClick={handleToggle}
                className="w-full px-6 py-1 bg-gradient-to-r from-white to-gray-50/50 hover:from-[var(--brand-primary)]/5 hover:to-[var(--brand-primary)]/10 flex items-center justify-between text-left transition-all duration-300 group-hover:px-7"
            >
                <span className="font-semibold text-gray-900 text-lg group-hover:text-[var(--brand-primary)] transition-colors duration-300">{title}</span>
                <div className="flex items-center space-x-2">
                    <div className={`w-8 h-8 rounded-full bg-gray-100 group-hover:bg-[var(--brand-primary)]/10 flex items-center justify-center transition-all duration-300 ${dropdownIsOpen ? 'rotate-180 bg-[var(--brand-primary)]/20' : ''}`}>
                        {dropdownIsOpen ? (
                            <ChevronUp className="h-5 w-5 text-[var(--brand-primary)] transition-transform duration-300" />
                        ) : (
                            <ChevronDown className="h-5 w-5 text-gray-600 group-hover:text-[var(--brand-primary)] transition-colors duration-300" />
                        )}
                    </div>
                </div>
            </button>
            
            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${dropdownIsOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="border-t border-gray-100 bg-gradient-to-b from-white to-gray-50/30">
                    <div className="transform transition-all duration-300 translate-y-0">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};
