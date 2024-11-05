import { X } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Dropdown from './ui/Dropdown';
import { List, BarChart } from 'lucide-react';
import "@fontsource/rubik";

// Add API URL constant
const PCA_API_URL = 'https://api.pinoycubers.org';

// Update the interfaces to match API response
interface Competition {
  id: string;
  name: string;
}

interface Event {
  id: string;
  name: string;
  rank: number;
  format: string;
  cell_name: string;
}

interface Solves {
  value1: string;
  value2: string;
  value3: string;
  value4: string;
  value5: string;
}

interface Ranking {
  competition: Competition;
  event: Event;
  value: string;
  person_name: string;
  wca_id: string;
  solves: Solves;
}

// Add the region options
const fetchRegions = async () => {
  const response = await axios.get(`${PCA_API_URL}/regions`);
  return response.data;
};

// Update cube events to match API format
const cubeEvents = [
  { id: "222", name: "2x2x2", icon: "/images/222.svg" },
  { id: "333", name: "3x3x3", icon: "/images/333.svg" },
  { id: "444", name: "4x4x4", icon: "/images/444.svg" },
  { id: "555", name: "5x5x5", icon: "/images/555.svg" },
  { id: "666", name: "6x6x6", icon: "/images/666.svg" },
  { id: "777", name: "7x7x7", icon: "/images/777.svg" },
  { id: "333bf", name: "3x3x3 Blindfolded", icon: "/images/333bf.svg" },
  { id: "333oh", name: "3x3x3 One-Handed", icon: "/images/333oh.svg" },
  { id: "clock", name: "Clock", icon: "/images/clock.svg" },
  { id: "minx", name: "Megaminx", icon: "/images/minx.svg" },
  { id: "pyram", name: "Pyraminx", icon: "/images/pyram.svg" },
  { id: "skewb", name: "Skewb", icon: "/images/skewb.svg" },
  { id: "sq1", name: "Square-1", icon: "/images/sq1.svg" },
  { id: "444bf", name: "4x4x4 Blindfolded", icon: "/images/444bf.svg" },
  { id: "555bf", name: "5x5x5 Blindfolded", icon: "/images/555bf.svg" },
  { id: "333mbf", name: "3x3x3 Multi-Blind", icon: "/images/333mbo.svg" }
];

// First, add this new component above the main Rankings component
const SelectedEventDisplay = ({ event }: { event: string }) => {
  const selectedEvent = cubeEvents.find(e => e.id === event);
  return (
    <div className="text-sm font-medium text-gray-700 mb-4">
      Selected Event: {selectedEvent?.name}
    </div>
  );
};

// Add interface for Region
interface Region {
  id: string;
  name: string;
}

// Update fetchRankings type
const fetchRankings = async ({ 
  region, 
  viewType, 
  event 
}: { 
  region: [string, string], 
  viewType: 'single' | 'average', 
  event: string 
}): Promise<Ranking[]> => {
  const response = await axios.get(
    `${PCA_API_URL}/rankings/${region[0]}-${viewType}${region[1]}${event}`
  );
  return response.data;
};

export default function Rankings() {
  const [showLoginPrompt, setShowLoginPrompt] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<[string, string]>(['national', '/']);
  const [selectedEvent, setSelectedEvent] = useState('333');
  const [viewType, setViewType] = useState<'single' | 'average'>('single');

  // Move the regions query inside the component
  const { 
    data: regions = [], 
    isLoading: isRegionsLoading 
  } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: fetchRegions
  });

  // Create regionOptions inside the component
  const regionOptions = [
    { value: 'PH', label: 'Philippines' },
    ...(regions?.map((region: Region) => ({
      value: region.id,
      label: `${region.name}`
    })) || [])
  ];

  // Replace useState and useEffect with useQuery
  const { 
    data: rankings = [], 
    isLoading,
    error
  } = useQuery<Ranking[]>({
    queryKey: ['rankings', selectedRegion, viewType, selectedEvent],
    queryFn: () => fetchRankings({
      region: selectedRegion as [string, string],
      viewType,
      event: selectedEvent
    })
  });

  const handleRegionChange = (value: string) => {
    let formattedRegion = "/";
    let nationalOrRegional = "national";
    
    if (value === "PH") {
      formattedRegion = "/";
      nationalOrRegional = "national";
    } else {
      formattedRegion = `/${value}/`;
      nationalOrRegional = "regional";
    }
    
    setSelectedRegion([nationalOrRegional, formattedRegion]);
  };

  return (
    <section className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

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
        <div className="mb-8">
          <SelectedEventDisplay event={selectedEvent} />
          <div className="flex flex-wrap gap-2">
            {cubeEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event.id)}
                className={`p-2 rounded-md transition-colors ${
                  selectedEvent === event.id 
                    ? 'bg-yellow-300' 
                    : 'bg-white hover:bg-gray-50'
                }`}
                title={event.name}
              >
                <img
                  src={event.icon}
                  alt={event.name}
                  className="w-6 h-6"
                />
              </button>
            ))}
          </div>
        </div>

        {/* View Type Tabs and Region Selector */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8 mb-8">
          {/* View Type Tabs */}
          <div className="flex gap-2 w-full md:w-auto">
            <button
              onClick={() => setViewType('single')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
                viewType === 'single' 
                  ? 'bg-yellow-300 text-gray-900' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <List size={20} />
              Single
            </button>
            <button
              onClick={() => setViewType('average')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
                viewType === 'average' 
                  ? 'bg-yellow-300 text-gray-900' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <BarChart size={20} />
              Average
            </button>
          </div>

          {/* Region Selector */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium text-gray-700">
              Region
            </label>
            {isRegionsLoading ? (
              <div className="w-full md:w-[350px] h-10 bg-gray-100 animate-pulse rounded-md" />
            ) : (
              <Dropdown
                value={selectedRegion[1].replace(/\//g, '') || 'PH'}
                onChange={handleRegionChange}
                options={regionOptions}
                className="w-full md:w-[350px]"
                placeholder="Select a region"
              />
            )}
          </div>
        </div>

        {/* Rankings Table */}
        <div className="w-full bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading rankings...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">
              Error loading rankings. Please try again later.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="sticky left-0 z-20 w-20 bg-gray-50">
                      <div className="pl-4 pr-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-full ml-[-1px]">
                        #
                      </div>
                    </th>
                    <th className="w-[350px] min-w-[350px] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Result
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Competition
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      WCA ID
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rankings.map((ranking: Ranking, index: number) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="sticky left-0 z-20 w-20">
                        <div 
                          className={`${
                            index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                          } pl-4 pr-2 py-4 text-sm text-gray-500 w-full h-full absolute top-0 left-0 ml-[-1px]`}
                        >
                          {index + 1}
                        </div>
                      </td>
                      <td className="w-[350px] min-w-[350px] px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {ranking.person_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {ranking.value}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ranking.competition.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ranking.wca_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}