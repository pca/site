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
    content: "Mist Almeida reappeared on national television on June 28, 2007 to promote the association and announced the upcoming Rubik's Cube Philippine Open 2007, the first speedcubing competition in the country which was recognized by WCA.",
    image: "https://images.unsplash.com/photo-1585676623595-ca0662bdc395?auto=format&fit=crop&w=800&q=80"
  }
];

export default function Timeline() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">
          How PCA Started
        </h2>
        
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-0.5 bg-gray-300" />

          {events.map((event, index) => (
            <div key={event.year} className="relative mb-16">
              <div className={`flex items-center ${index % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                {/* Timeline dot */}
                <div className="absolute left-1/2 transform -translate-x-1/2">
                  <Circle className="w-6 h-6 bg-yellow-300 rounded-full text-yellow-300" />
                </div>

                {/* Content */}
                <div className="w-1/2 px-8">
                  <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                    {event.image && (
                      <img 
                        src={event.image} 
                        alt={`Event ${event.year}`}
                        className="w-full h-48 object-cover"
                      />
                    )}
                    <div className="p-6">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">
                        {event.year}
                      </h3>
                      <p className="text-gray-600">
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