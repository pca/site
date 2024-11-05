import { Circle } from 'lucide-react';

interface TimelineEvent {
  year: number;
  content: string;
  image?: string;
}

const events: TimelineEvent[] = [
  {
    year: 2007,
    content: "John Canares reappeared on national television on June 28, 2007 to promote the association and announced the upcoming Rubik's Cube Philippine Open 2007, the first speedcubing competition in the country which was recognized by WCA.",
    image: "https://images.unsplash.com/photo-1577374994650-b9c170c0cd5c?auto=format&fit=crop&w=800&q=80"
  },
  {
    year: 2008,
    content: "Mateus Almeida reappeared on national television on June 28, 2007 to promote the association and announced the upcoming Rubik's Cube Philippine Open 2007, the first speedcubing competition in the country which was recognized by WCA.",
    image: "https://images.unsplash.com/photo-1585676623595-ca0662bdc395?auto=format&fit=crop&w=800&q=80"
  }
];

export default function Timeline() {
  return (
    <section className="py-12 md:py-20 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-8 md:mb-16">
          How PCA Started
        </h2>
        
        <div className="relative">
          {/* Vertical line - hidden on mobile */}
          <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2 h-full w-0.5 bg-gradient-to-b from-gray-300 to-gray-200" />

          {events.map((event, index) => (
            <div key={event.year} className="relative mb-8 md:mb-16">
              {/* Mobile Layout */}
              <div className="block md:hidden">
                <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-shadow duration-300">
                  {event.image && (
                    <img 
                      src={event.image} 
                      alt={`Event ${event.year}`}
                      className="w-full h-48 object-cover rounded-t-xl"
                    />
                  )}
                  <div className="p-6">
                    <div className="inline-block px-4 py-1.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold mb-4 border border-yellow-200">
                      {event.year}
                    </div>
                    <p className="text-gray-700 leading-relaxed">
                      {event.content}
                    </p>
                  </div>
                </div>
              </div>

              {/* Desktop Layout */}
              <div className={`hidden md:flex items-center ${index % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                {/* Timeline dot */}
                <div className="absolute left-1/2 transform -translate-x-1/2">
                  <div className="w-4 h-4 bg-yellow-300 rounded-full ring-4 ring-yellow-100 shadow-sm" />
                </div>

                {/* Content */}
                <div className="w-5/12">
                  <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-shadow duration-300 group">
                    {event.image && (
                      <img 
                        src={event.image} 
                        alt={`Event ${event.year}`}
                        className="w-full h-48 md:h-56 object-cover rounded-t-xl"
                      />
                    )}
                    <div className="p-6">
                      <div className="inline-block px-4 py-1.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold mb-4 border border-yellow-200 group-hover:bg-yellow-200 transition-colors duration-300">
                        {event.year}
                      </div>
                      <p className="text-gray-700 leading-relaxed">
                        {event.content}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}