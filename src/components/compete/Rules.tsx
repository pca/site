import { ExternalLink } from 'lucide-react';

export default function Rules() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-3xl font-bold mb-6">WCA Rules & Regulations</h2>
        <p className="text-gray-600 mb-8">
          Before competing, it's important to familiarize yourself with the official WCA regulations. Here are some helpful resources:
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <a 
          href="https://www.worldcubeassociation.org/regulations/"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
            Official WCA Regulations
            <ExternalLink size={16} />
          </h3>
          <p className="text-gray-600">
            Complete set of rules and guidelines for WCA competitions.
          </p>
        </a>

        <a 
          href="https://www.youtube.com/watch?v=TOJ2dXahS1Q"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
            Competition Tutorial
            <ExternalLink size={16} />
          </h3>
          <p className="text-gray-600">
            Comprehensive video guide on competition rules and procedures.
          </p>
        </a>
      </div>
    </div>
  );
}