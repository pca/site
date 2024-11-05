import { useState, useEffect } from 'react';
import { MapPin, Calendar, Search, List, Map as MapIcon } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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
  "2x2x2", "3x3x3", "4x4x4", "5x5x5", "6x6x6", "7x7x7",
  "3x3x3 Blindfolded", "3x3x3 One-Handed", "Clock", "Megaminx",
  "Pyraminx", "Skewb", "Square-1", "4x4x4 Blindfolded",
  "5x5x5 Blindfolded", "3x3x3 Multi-Blind"
];

export default function Competitions() {
  const [view, setView] = useState<'list' | 'map'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('All');
  const [filteredCompetitions, setFilteredCompetitions] = useState(sampleCompetitions);

  useEffect(() => {
    const filtered = sampleCompetitions.filter(comp => 
      comp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comp.city.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredCompetitions(filtered);
  }, [searchTerm]);

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
              className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-300 focus:ring focus:ring-yellow-200"
            />
          </div>
          <select
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-yellow-300 focus:ring focus:ring-yellow-200"
          >
            <option value="All">All Events</option>
            {cubeEvents.map(event => (
              <option key={event} value={event}>{event}</option>
            ))}
          </select>
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
        <div className="grid grid-cols-8 gap-4 mb-8">
          {cubeEvents.map((event, index) => (
            <button
              key={index}
              onClick={() => setSelectedEvent(event)}
              className={`aspect-square rounded-lg shadow-sm hover:shadow-md transition-shadow p-2 flex items-center justify-center ${
                selectedEvent === event ? 'bg-yellow-300' : 'bg-white'
              }`}
            >
              <span className="text-xs text-center text-gray-600">{event}</span>
            </button>
          ))}
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