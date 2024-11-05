import { X } from 'lucide-react';
import { useState } from 'react';
import Dropdown from './ui/Dropdown';
import { Tabs, TabsList, TabsTrigger } from './ui/Tabs';

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

  const regionOptions = [
    { value: 'Philippines', label: 'Philippines' },
    { value: 'NCR', label: 'NCR (Luzon - Metro Manila)' },
    { value: 'CAR', label: 'CAR (Luzon - Cordillera Region)' },
    { value: 'Region-I', label: 'Region I (Luzon - Ilocos Region)' },
    { value: 'Region-II', label: 'Region II (Luzon - Cagayan Valley)' },
    { value: 'Region-III', label: 'Region III (Luzon - Central Luzon)' },
    { value: 'Region-IV-A', label: 'Region IV-A (Luzon - Calabarzon)' },
    { value: 'Region-IV-B', label: 'Region IV-B (Luzon - Mimaropa)' },
    { value: 'Region-V', label: 'Region V (Luzon - Bicol Region)' },
    { value: 'Region-VI', label: 'Region VI (Visayas - Western Visayas)' },
    { value: 'Region-VII', label: 'Region VII (Visayas - Central Visayas)' },
  ];

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

        {/* View Type Tabs and Region Selector */}
        <div className="flex items-center gap-8 mb-8">
          {/* View Type Tabs */}
          <Tabs defaultValue={viewType} onValueChange={(value) => setViewType(value as 'single' | 'average')}>
            <TabsList className="grid w-[200px] grid-cols-2">
              <TabsTrigger value="single">Single</TabsTrigger>
              <TabsTrigger value="average">Average</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Region Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Region
            </label>
            <Dropdown
              value={selectedRegion}
              onChange={(value) => setSelectedRegion(value)}
              options={regionOptions}
              className="w-[300px]"
            />
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