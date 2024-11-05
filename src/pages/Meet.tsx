import { Facebook, Users, Calendar, Store, MessageSquare } from 'lucide-react';

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
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-300 focus:ring focus:ring-yellow-200"
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
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-300 focus:ring focus:ring-yellow-200"
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
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-300 focus:ring focus:ring-yellow-200"
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
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-300 focus:ring focus:ring-yellow-200"
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
            Connect with fellow cubers, join events, and find cube shops.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-16">
          {/* Social Groups */}
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

          {/* Cubemeets */}
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

          {/* Events */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Calendar size={28} className="text-yellow-500" />
              <h2 className="text-2xl font-bold">Events</h2>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <iframe 
                src="https://www.worldcubeassociation.org/competitions?region=Philippines&embedded=true"
                className="w-full h-[600px] border-0"
                title="WCA Competitions in Philippines"
              />
            </div>
          </section>

          {/* Cube Shops */}
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