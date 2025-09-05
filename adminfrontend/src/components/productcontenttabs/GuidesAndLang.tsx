import type { GuidesAndLangProps } from "@/types";
import { Users, X } from "lucide-react";


export const GuidesAndLang = ({
  formData,
  updateFormData,
}: GuidesAndLangProps)=>{

return (
    <div className="space-y-8 grid grid-cols-1">
      <div className="bg-gray-50 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Guide & Language Matrix</h4>
        <p className="text-sm text-gray-600 mb-6">
          Configure what type of guide is available for each language
        </p>

        <div className="mb-6">
          <div className="flex items-center space-x-2">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  const existingGuides = formData.guides || [];
                  const languageExists = existingGuides.some((guide: any) => guide.language === e.target.value);

                  if (!languageExists) {
                    const newGuide = {
                      language: e.target.value,
                      inPerson: false,
                      audio: false,
                      written: false
                    };
                    updateFormData({
                      guides: [...existingGuides, newGuide]
                    });
                  }
                }
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            >
              <option value="">Add another language</option>
              <option value="English">English</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
              <option value="German">German</option>
              <option value="Italian">Italian</option>
              <option value="Portuguese">Portuguese</option>
              <option value="Dutch">Dutch</option>
              <option value="Russian">Russian</option>
              <option value="Japanese">Japanese</option>
              <option value="Chinese">Chinese</option>
              <option value="Korean">Korean</option>
              <option value="Arabic">Arabic</option>
              <option value="Hindi">Hindi</option>
              <option value="Bengali">Bengali</option>
              <option value="Tamil">Tamil</option>
              <option value="Telugu">Telugu</option>
              <option value="Marathi">Marathi</option>
              <option value="Gujarati">Gujarati</option>
              <option value="Kannada">Kannada</option>
              <option value="Malayalam">Malayalam</option>
              <option value="Punjabi">Punjabi</option>
              <option value="Urdu">Urdu</option>
            </select>
          </div>
        </div>

        {formData.guides && formData.guides.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900">
                    Languages
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900">
                    <div className="flex flex-col items-center">
                      <Users className="h-5 w-5 mb-1 text-blue-600" />
                      <span>In-person</span>
                    </div>
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900">
                    <div className="flex flex-col items-center">
                      <svg className="h-5 w-5 mb-1 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v6.114a4 4 0 100 1.772V6.114l8-1.6v4.9a4 4 0 100 1.772V3z" />
                      </svg>
                      <span>Audio</span>
                    </div>
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900">
                    <div className="flex flex-col items-center">
                      <svg className="h-5 w-5 mb-1 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                      </svg>
                      <span>Written</span>
                    </div>
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {formData.guides.map((guide: any, index: number) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-3 font-medium text-gray-900">
                      {guide.language}
                    </td>
                    <td className="border border-gray-300 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={guide.inPerson || false}
                        onChange={(e) => {
                          const updatedGuides = [...formData.guides];
                          updatedGuides[index] = {
                            ...updatedGuides[index],
                            inPerson: e.target.checked
                          };
                          updateFormData({ guides: updatedGuides });
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={guide.audio || false}
                        onChange={(e) => {
                          const updatedGuides = [...formData.guides];
                          updatedGuides[index] = {
                            ...updatedGuides[index],
                            audio: e.target.checked
                          };
                          updateFormData({ guides: updatedGuides });
                        }}
                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={guide.written || false}
                        onChange={(e) => {
                          const updatedGuides = [...formData.guides];
                          updatedGuides[index] = {
                            ...updatedGuides[index],
                            written: e.target.checked
                          };
                          updateFormData({ guides: updatedGuides });
                        }}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const updatedGuides = formData.guides.filter((_: any, i: number) => i !== index);
                          updateFormData({ guides: updatedGuides });
                        }}
                        className="text-red-600 hover:text-red-800 transition-colors"
                        title="Remove language"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium">No languages configured</p>
            <p className="text-sm">Add a language from the dropdown above to start configuring guide types</p>
          </div>
        )}

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h5 className="font-medium text-blue-900 mb-2">Guide Types:</h5>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>In-person:</strong> Live guide physically present with the group</li>
            <li>• <strong>Audio:</strong> Pre-recorded audio commentary or live audio guide</li>
            <li>• <strong>Written:</strong> Written materials, brochures, or digital text guides</li>
          </ul>
        </div>
      </div>
    </div>
  );
}