import { Facebook, Users, Calendar, Store, MessageSquare, MapPin, Search, List, Map as MapIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Dropdown from '../components/ui/Dropdown';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Meetup {
  id: string;
  name: string;
  host: string;
  wcaId?: string;
  date: string;
  time: string;
  city: string;
  venue: string;
  contact: string;
  lat: number;
  lng: number;
}

const sampleMeetups: Meetup[] = [
  {
    id: '1',
    name: 'Weekend Cube Meetup',
    host: 'Juan Dela Cruz',
    wcaId: '2019CRUZ01',
    date: '2024-04-20',
    time: '14:00',
    city: 'Manila',
    venue: 'SM North EDSA The Block',
    contact: 'FB: juan.cruz / 09123456789',
    lat: 14.6577,
    lng: 121.0307,
  },
  {
    id: '2',
    name: 'Cebu Cubers Hangout',
    host: 'Maria Santos',
    date: '2024-04-21',
    time: '13:00',
    city: 'Cebu',
    venue: 'Ayala Center Cebu',
    contact: 'FB: maria.santos / 09187654321',
    lat: 10.3157,
    lng: 123.8854,
  },
];

function MeetupsView() {
  const [view, setView] = useState<'list' | 'map'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredMeetups, setFilteredMeetups] = useState(sampleMeetups);
  const [selectedCity, setSelectedCity] = useState('All');

  const cityOptions = [
    { value: 'All', label: 'All Cities' },
    { value: 'Manila', label: 'Manila' },
    { value: 'Cebu', label: 'Cebu' },
    { value: 'Davao', label: 'Davao' },
    // ... add other major cities
  ];

  useEffect(() => {
    const filtered = sampleMeetups.filter(meetup => 
      meetup.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      meetup.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      meetup.host.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredMeetups(filtered);
  }, [searchTerm]);

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Search and View Toggle */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search meetups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="custom-input custom-input-with-icon"
            />
          </div>
          <Dropdown
            value={selectedCity}
            onChange={setSelectedCity}
            options={cityOptions}
            placeholder="Select City"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setView('list')}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
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
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md ${
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

        {/* View Content */}
        {view === 'list' ? (
          <div className="space-y-4">
            {filteredMeetups.map(meetup => (
              <div key={meetup.id} className="bg-gray-50 rounded-lg p-4 flex items-start gap-4">
                <div className="bg-yellow-300 rounded-lg p-3">
                  <Calendar className="text-gray-900" size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{meetup.name}</h3>
                  <p className="text-gray-600">Host: {meetup.host} {meetup.wcaId && `(${meetup.wcaId})`}</p>
                  <p className="text-gray-600">{meetup.date} at {meetup.time}</p>
                  <div className="flex items-center gap-1 mt-2 text-gray-600">
                    <MapPin size={16} />
                    <span>{meetup.venue}, {meetup.city}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">Contact: {meetup.contact}</p>
                </div>
                <button className="bg-yellow-300 hover:bg-yellow-400 text-gray-900 px-4 py-2 rounded-md">
                  Join
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
              {filteredMeetups.map(meetup => (
                <Marker 
                  key={meetup.id}
                  position={[meetup.lat, meetup.lng]}
                >
                  <Popup>
                    <div className="p-2">
                      <h3 className="font-semibold">{meetup.name}</h3>
                      <p className="text-sm text-gray-600">Host: {meetup.host}</p>
                      <p className="text-sm text-gray-600">{meetup.date} at {meetup.time}</p>
                      <p className="text-sm text-gray-600">{meetup.venue}</p>
                      <button className="mt-2 w-full bg-yellow-300 hover:bg-yellow-400 text-gray-900 px-3 py-1 rounded-md text-sm">
                        Join
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

interface SocialGroupProps {
  name: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  iconColor: string;
}

function SocialGroup({ name, description, href, icon, iconColor }: SocialGroupProps) {
  return (
    <a 
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
    >
      <div className="flex items-center gap-4 mb-3">
        <div className={iconColor}>{icon}</div>
        <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
      </div>
      <p className="text-gray-600">{description}</p>
    </a>
  );
}

interface CubemeetFormProps {
  onSubmit: (event: React.FormEvent) => void;
}

function CubemeetForm({ onSubmit }: CubemeetFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6 bg-white rounded-lg shadow-md p-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Name of host
        </label>
        <input
          type="text"
          id="name"
          className="custom-input"
          required
        />
        <p className="mt-1 text-sm text-gray-500">WCA ID (optional)</p>
      </div>

      <div>
        <label htmlFor="venue" className="block text-sm font-medium text-gray-700 mb-1">
          Venue
        </label>
        <input
          type="text"
          id="venue"
          className="custom-input"
          required
        />
        <p className="mt-1 text-sm text-gray-500">Please be as specific as possible. Include a Google Maps link if possible.</p>
      </div>

      <div>
        <label htmlFor="time" className="block text-sm font-medium text-gray-700 mb-1">
          Time
        </label>
        <input
          type="datetime-local"
          id="time"
          className="custom-input"
          required
        />
      </div>

      <div>
        <label htmlFor="contact" className="block text-sm font-medium text-gray-700 mb-1">
          Contact Information
        </label>
        <textarea
          id="contact"
          rows={3}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-300 focus:border-yellow-300 placeholder:text-gray-500"
          placeholder="Facebook name and contact number"
          required
        />
      </div>

      <button
        type="submit"
        className="w-full bg-yellow-300 hover:bg-yellow-400 text-gray-900 font-medium py-2 px-4 rounded-md"
      >
        Submit Cubemeet
      </button>
    </form>
  );
}

export default function Meet() {
  const handleCubemeetSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Handle form submission
  };

  const socialGroups = [
    {
      name: "PCA - Main Group",
      description: "The main community group for general discussions and announcements.",
      href: "https://facebook.com/groups/pca",
      icon: <Facebook size={24} />,
      iconColor: "text-blue-600"
    },
    {
      name: "PCA Discord Server",
      description: "Join our Discord community for real-time discussions, events, and support.",
      href: "https://discord.gg/pca",
      icon: <MessageSquare size={24} />,
      iconColor: "text-indigo-600"
    },
    {
      name: "PCA Speedcubing Arena",
      description: "Share and compare your solving times with other speedcubers.",
      href: "https://facebook.com/groups/pca-arena",
      icon: <Facebook size={24} />,
      iconColor: "text-blue-600"
    },
    {
      name: "PCA Support Group",
      description: "Get tips, advice, and support for improving your solving skills.",
      href: "https://facebook.com/groups/pca-support",
      icon: <Facebook size={24} />,
      iconColor: "text-blue-600"
    },
    {
      name: "PCA Marketplace",
      description: "Buy and sell cubes within the community.",
      href: "https://facebook.com/groups/pca-marketplace",
      icon: <Facebook size={24} />,
      iconColor: "text-blue-600"
    }
  ];

  return (
    <main>
      <div className="bg-yellow-300 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Meet the Community
          </h1>
          <p className="text-xl text-gray-800 max-w-2xl mx-auto">
            Connect with fellow cubers, join meetups, and find cube shops.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-16">
          {/* Current Meetups Section */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Calendar size={28} className="text-yellow-500" />
              <h2 className="text-2xl font-bold">Current Meetups</h2>
            </div>
            <MeetupsView />
          </section>

          {/* Organize a Cubemeet Section */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Users size={28} className="text-yellow-500" />
              <h2 className="text-2xl font-bold">Organize a Cubemeet</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <p className="text-gray-600 mb-4">
                  Want to meet and hang out with cubers near you? Organize a cubemeet! It's the best way to personally connect with people who share your passion, exchange tips, and maybe even trade cubes.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">What is a cubemeet?</h3>
                  <p className="text-gray-600">
                    A casual gathering of cubing enthusiasts to practice, share techniques, and build friendships within the community.
                  </p>
                </div>
              </div>
              <CubemeetForm onSubmit={handleCubemeetSubmit} />
            </div>
          </section>

          {/* Community Groups Section */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Users size={28} className="text-blue-600" />
              <h2 className="text-2xl font-bold">Join Our Community</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {socialGroups.map((group, index) => (
                <SocialGroup key={index} {...group} />
              ))}
            </div>
          </section>

          {/* Cube Shops Section */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Store size={28} className="text-yellow-500" />
              <h2 className="text-2xl font-bold">Cube Shops</h2>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <p className="text-gray-600 mb-6">
                Looking for the latest cubes? Check out our PCA Sponsors - the most trusted shops in the country offering quick delivery at competitive prices!
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Add sponsor shops here */}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}