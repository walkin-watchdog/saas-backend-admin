import { useState } from 'react';
import { HomeManagement } from './HomeManagement';
import { LogoManagement } from './LogoManagement';
import { TeamManagement } from './TeamManagement';
import { FAQManagement } from './FAQManagement';
import { JobManagement } from './JobManagement';
import { PartnersManagement } from './PartnersManagement';
import { SlidesManagement } from './SlidesManagement';
import { Image, Home, Users, HelpCircle, Briefcase, Globe, Camera } from 'lucide-react';

export const ContentIndex = () => {
  const [activeTab, setActiveTab] = useState('logo');

  const tabs = [
    { id: 'logo', label: 'Logo', icon: Image },
    { id: 'home', label: 'Home', icon: Home },
    { id: 'team', label: 'Team Members', icon: Users },
    { id: 'faqs', label: 'FAQs', icon: HelpCircle },
    { id: 'jobs', label: 'Job Postings', icon: Briefcase },
    { id: 'partners', label: 'Partners', icon: Globe },
    { id: 'slides', label: 'Slides', icon: Camera }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Content Management</h1>
          <p className="text-gray-600 mt-2">Manage website content pages</p>
        </div>
      </div>
      {/* Sidebar and Content */}
      <div className="md:flex md:space-x-6 space-y-6 md:space-y-0">
        <aside className="hidden md:block w-64 bg-white rounded-lg shadow-sm border border-gray-200 overflow-y-auto">
          <nav className="p-4 space-y-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="h-5 w-5 mr-3" />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

          {/* Content */}
          <div className="flex-1">
            {/* Mobile Tab Dropdown */}
            <div className="md:hidden bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
              <select
                value={activeTab}
                onChange={e => setActiveTab(e.target.value)}
                className="w-full p-3 text-gray-700"
              >
                {tabs.map(tab => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </div>
          
            {/* Tab Content */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              {activeTab === 'logo'     && <LogoManagement />}
              {activeTab === 'home'     && <HomeManagement />}
              {activeTab === 'team'     && <TeamManagement />}
              {activeTab === 'faqs'     && <FAQManagement />}
              {activeTab === 'jobs'     && <JobManagement />}
              {activeTab === 'partners' && <PartnersManagement />}
              {activeTab === 'slides'   && <SlidesManagement />}
            </div>
          </div>
        </div>
      </div>
  );
};