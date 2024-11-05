import { X } from 'lucide-react';
import { useState } from 'react';

interface Ranking {
  position: number;
  name: string;
  result: string;
  competition: string;
}

const rankings: Ranking[] = [
  { position: 1, name: "Sean Patrick Villanueva", result: "4.11", competition: "Valenzuela Cubing Open 2023" },
  { position: 2, name: "Leo Borromeo", result: "4.31", competition: "Cebu New Year Open 2023" },
  { position: 3, name: "Toby Litiatco", result: "4.40", competition: "Cavite Speedcubing Open VI 2023" },
  { position: 4, name: "Brenton Angelo Lo Wong", result: "4.42", competition: "Let's Cube Laguna 2023" },
  { position: 5, name: "Jay Benedict Alfaras", result: "5.12", competition: "Bacolod Cubing Quest 2018" },
  { position: 6, name: "Crimson Arradaza", result: "5.29", competition: "Imus Speedcubing Open 2024" },
  { position: 7, name: "Karl Matthew Angeles", result: "5.34", competition: "Baguio Speedcubing Open 2023" },
];

const cubeEvents = [
  "2x2x2", "3x3x3", "4x4x4", "5x5x5", "6x6x6", "7x7x7",
  "3x3x3 Blindfolded", "3x3x3 One-Handed", "Clock", "Megaminx",
  "Pyraminx", "Skewb", "Square-1", "4x4x4 Blindfolded",
  "5x5x5 Blindfolded", "3x3x3 Multi-Blind"
];

export default function Rankings() {
  const [showLoginPrompt, setShowLoginPrompt] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState('Philippines');
  const [viewType, setViewType] = useState<'single' | 'average'>('single');

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">
          Regional Rankings
        </h2>

        {/* Login Prompt */}
        {showLoginPrompt && (
          <div className="bg-white p-6 rounded-lg shadow-md mb-8 relative">
            <button 
              onClick={() => setShowLoginPrompt(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-semibold mb-2">Want to see your regional rank here?</h3>
            <p className="text-gray-600 mb-4">
              If you've competed in an official WCA competition before, you can easily set your region in just a few steps.
            </p>
            <button className="bg-yellow-300 hover:bg-yellow-400 text-gray-900 font-medium py-2 px-4 rounded-md flex items-center gap-2">
              <img src="https://www.worldcubeassociation.org/assets/WCA%20Logo%202020-4c0c5ba6092c77e1b3f54a3f3f4e8c0b4e237c59f3c3b60d0b9f6f7f5d7dc94.svg" 
                   alt="WCA Logo" 
                   className="w-6 h-6" />
              Login with WCA
            </button>
          </div>
        )}

        {/* Event Icons */}
        <div className="grid grid-cols-8 gap-4 mb-8">
          {cubeEvents.map((event, index) => (
            <button
              key={index}
              className="aspect-square bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-2 flex items-center justify-center"
            >
              <span className="text-xs text-center text-gray-600">{event}</span>
            </button>
          ))}
        </div>

        {/* Region Selector */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Region
          </label>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-yellow-300 focus:ring focus:ring-yellow-200 focus:ring-opacity-50"
          >
            <option value="Philippines">Philippines</option>
            <option value="Asia">Asia</option>
            <option value="World">World</option>
          </select>
        </div>

        {/* View Type Tabs */}
        <div className="mb-6">
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => setViewType('single')}
              className={`px-4 py-2 text-sm font-medium rounded-l-md ${
                viewType === 'single'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Single
            </button>
            <button
              onClick={() => setViewType('average')}
              className={`px-4 py-2 text-sm font-medium rounded-r-md ${
                viewType === 'average'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Average
            </button>
          </div>
        </div>

        {/* Rankings Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Result
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Competition
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rankings.map((ranking) => (
                <tr key={ranking.position} className={ranking.position % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {ranking.position}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{ranking.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {ranking.result}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {ranking.competition}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}