import { useState, useEffect } from 'react';
import { MapPin, Calendar, Search, List, Map as MapIcon } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Dropdown from '../ui/Dropdown';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Competition {
  id: string;
  name: string;
  date: string;
  city: string;
  venue: string;
  lat: number;
  lng: number;
}

const sampleCompetitions: Competition[] = [
  {
    id: '1',
    name: 'Manila Open 2024',
    date: '2024-04-15',
    city: 'Manila',
    venue: 'SM Mall of Asia',
    lat: 14.5355,
    lng: 120.9821,
  },
  {
    id: '2',
    name: 'Cebu Championship 2024',
    date: '2024-05-01',
    city: 'Cebu',
    venue: 'Ayala Center Cebu',
    lat: 10.3157,
    lng: 123.8854,
  },
];

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

const SelectedEventDisplay = ({ event }: { event: string }) => {
  const selectedEvent = cubeEvents.find(e => e.id === event);
  return (
    <div className="text-sm font-medium text-gray-700 mb-4">
      Selected Event: {selectedEvent?.name || 'All Events'}
    </div>
  );
};

// Add API URL constant at the top with other imports
const PCA_API_URL = 'https://api.pinoycubers.org';

// Add interface for Region
interface Region {
  id: string;
  name: string;
}

export default function Competitions() {
  const [view, setView] = useState<'list' | 'map'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState<[string, string]>(['national', '/']);
  const [filteredCompetitions, setFilteredCompetitions] = useState(sampleCompetitions);

  // Add regions query
  const { 
    data: regions = [], 
    isLoading: isRegionsLoading 
  } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: async () => {
      const response = await axios.get(`${PCA_API_URL}/regions`);
      return response.data;
    }
  });

  // Create regionOptions inside the component
  const regionOptions = [
    { value: 'PH', label: 'Philippines' },
    ...(regions?.map((region: Region) => ({
      value: region.id,
      label: `${region.name}`
    })) || [])
  ];

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

  // Update useEffect to use new region format
  useEffect(() => {
    const filtered = sampleCompetitions.filter(comp => {
      const matchesSearch = comp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comp.city.toLowerCase().includes(searchTerm.toLowerCase());
      // Update region matching logic based on your requirements
      const matchesRegion = selectedRegion[0] === 'national' ? true : 
        comp.city.toLowerCase().includes(selectedRegion[1].replace(/\//g, '').toLowerCase());
      return matchesSearch && matchesRegion;
    });
    setFilteredCompetitions(filtered);
  }, [searchTerm, selectedRegion]);

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search competitions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="custom-input custom-input-with-icon"
            />
          </div>
          {isRegionsLoading ? (
            <div className="w-full h-10 bg-gray-100 animate-pulse rounded-md" />
          ) : (
            <Dropdown
              value={selectedRegion[1].replace(/\//g, '') || 'PH'}
              onChange={handleRegionChange}
              options={regionOptions}
              className="w-full"
              placeholder="Select Region"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setView('list')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
                view === 'list' 
                  ? 'bg-yellow-300 text-gray-900' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <List size={20} />
              List
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
                view === 'map' 
                  ? 'bg-yellow-300 text-gray-900' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <MapIcon size={20} />
              Map
            </button>
          </div>
        </div>

        {/* Event Icons */}
        <div className="mb-8">
          <SelectedEventDisplay event={selectedEvent} />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedEvent('all')}
              className={`p-2 rounded-md transition-colors ${
                selectedEvent === 'all' 
                  ? 'bg-yellow-300' 
                  : 'bg-white hover:bg-gray-50'
              }`}
              title="All Events"
            >
              <span className="px-2">All</span>
            </button>
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

        {/* View Content */}
        {view === 'list' ? (
          <div className="space-y-4">
            {filteredCompetitions.map(competition => (
              <div key={competition.id} className="bg-gray-50 rounded-lg p-4 flex items-start gap-4">
                <div className="bg-yellow-300 rounded-lg p-3">
                  <Calendar className="text-gray-900" size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{competition.name}</h3>
                  <p className="text-gray-600">{competition.date}</p>
                  <div className="flex items-center gap-1 mt-2 text-gray-600">
                    <MapPin size={16} />
                    <span>{competition.venue}, {competition.city}</span>
                  </div>
                </div>
                <button className="bg-yellow-300 hover:bg-yellow-400 text-gray-900 px-4 py-2 rounded-md">
                  Register
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[600px] rounded-lg overflow-hidden">
            <MapContainer
              center={[12.8797, 121.7740]} // Center of Philippines
              zoom={6}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {filteredCompetitions.map(competition => (
                <Marker 
                  key={competition.id}
                  position={[competition.lat, competition.lng]}
                >
                  <Popup>
                    <div className="p-2">
                      <h3 className="font-semibold">{competition.name}</h3>
                      <p className="text-sm text-gray-600">{competition.date}</p>
                      <p className="text-sm text-gray-600">{competition.venue}</p>
                      <button className="mt-2 w-full bg-yellow-300 hover:bg-yellow-400 text-gray-900 px-3 py-1 rounded-md text-sm">
                        Register
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}
      </div>
    </div>
  );
}