import { ExternalLink } from 'lucide-react';

export default function FAQs() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-3xl font-bold mb-6">Frequently Asked Questions</h2>
        <p className="text-gray-600 mb-8">
          New to competing? Here we answer common questions about competitions in the Philippines and provide tips for handling a competition environment.
        </p>
      </section>

      <div className="space-y-8">
        <div>
          <h3 className="text-xl font-semibold mb-3">What is the WCA?</h3>
          <p className="text-gray-600">
            The WCA is the governing body of speedcubing competitions worldwide. They oversee competition organization and handle competition-related issues.{' '}
            <a href="https://www.worldcubeassociation.org/about" className="text-blue-600 hover:underline inline-flex items-center gap-1">
              Read more about the WCA <ExternalLink size={16} />
            </a>
          </p>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-3">Why should I compete?</h3>
          <p className="text-gray-600 mb-4">
            Competitions offer a unique experience where you can enjoy speedcubing and meet fellow enthusiasts. You might meet top solvers like Sean Villanueva and Leo Borromeo! While you can aim for podiums and records, every competition provides a fun and unique experience.
          </p>
          <div className="space-y-2">
            <p className="font-medium">Check out these helpful videos by Chris Olson:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>
                <a href="https://www.youtube.com/watch?v=TOJ2dXahS1Q" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                  Competition Guide Part 1 <ExternalLink size={16} />
                </a>
              </li>
              <li>
                <a href="https://www.youtube.com/watch?v=hZPEmqjQGuw" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                  Competition Guide Part 2 <ExternalLink size={16} />
                </a>
              </li>
              <li>
                <a href="https://www.youtube.com/watch?v=1oZY2e25VUw" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                  Competition Guide Part 3 <ExternalLink size={16} />
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-3">How fast do I need to be to compete?</h3>
          <p className="text-gray-600">
            As long as you average under 10 minutes, you can compete!
          </p>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-3">How do I check for competitions in my area?</h3>
          <p className="text-gray-600">
            Visit the{' '}
            <a href="https://www.worldcubeassociation.org/competitions?region=Philippines" className="text-blue-600 hover:underline inline-flex items-center gap-1">
              WCA Competitions page <ExternalLink size={16} />
            </a>
            {' '}to find local competitions. If there are none in your area, consider organizing one! Contact your{' '}
            <a href="https://www.worldcubeassociation.org/delegates" className="text-blue-600 hover:underline inline-flex items-center gap-1">
              local delegate <ExternalLink size={16} />
            </a>
            {' '}for guidance. They can help you find co-organizers too!
          </p>
        </div>
      </div>
    </div>
  );
}