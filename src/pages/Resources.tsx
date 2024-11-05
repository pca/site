import { BookOpen, Book, Lightbulb, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface TutorialCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

function TutorialCard({ title, description, href, icon }: TutorialCardProps) {
  return (
    <Link 
      to={href}
      className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
    >
      <div className="flex items-start gap-4">
        <div className="text-yellow-500">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 text-sm">{description}</p>
        </div>
        <ChevronRight className="text-gray-400" />
      </div>
    </Link>
  );
}

export default function Resources() {
  return (
    <main>
      <div className="bg-yellow-300 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Resources
          </h1>
          <p className="text-xl text-gray-800 max-w-2xl mx-auto">
            Learn how to solve the Rubik's cube and improve your solving techniques.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-12">
          {/* 3x3 Tutorials */}
          <section>
            <h2 className="text-2xl font-bold mb-6">3x3 Tutorials</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TutorialCard
                title="Beginner's Method"
                description="Learn how to solve the 3x3 Rubik's cube with simple steps and no complex algorithms."
                href="/resources/beginners-method"
                icon={<BookOpen size={24} />}
              />
              <TutorialCard
                title="CFOP Method"
                description="Advanced method used by most speedcubers to achieve faster times."
                href="/resources/cfop"
                icon={<Book size={24} />}
              />
            </div>
          </section>

          {/* Other Tutorials */}
          <section>
            <h2 className="text-2xl font-bold mb-6">Other Tutorials</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TutorialCard
                title="Finger Tricks"
                description="Essential techniques to improve your solving speed and efficiency."
                href="/resources/finger-tricks"
                icon={<Lightbulb size={24} />}
              />
              <TutorialCard
                title="Advanced F2L"
                description="Learn advanced First Two Layers techniques for faster solves."
                href="/resources/advanced-f2l"
                icon={<Lightbulb size={24} />}
              />
            </div>
          </section>

          {/* Algorithms Section */}
          <section>
            <h2 className="text-2xl font-bold mb-6">Algorithms</h2>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-3">OLL Algorithms</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>
                      <Link to="/resources/algorithms/oll" className="hover:text-yellow-600">
                        Full OLL (57 algorithms)
                      </Link>
                    </li>
                    <li>
                      <Link to="/resources/algorithms/2-look-oll" className="hover:text-yellow-600">
                        2-Look OLL (10 algorithms)
                      </Link>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-3">PLL Algorithms</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>
                      <Link to="/resources/algorithms/pll" className="hover:text-yellow-600">
                        Full PLL (21 algorithms)
                      </Link>
                    </li>
                    <li>
                      <Link to="/resources/algorithms/2-look-pll" className="hover:text-yellow-600">
                        2-Look PLL (6 algorithms)
                      </Link>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-3">F2L Cases</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>
                      <Link to="/resources/algorithms/f2l" className="hover:text-yellow-600">
                        Basic F2L Cases
                      </Link>
                    </li>
                    <li>
                      <Link to="/resources/algorithms/advanced-f2l" className="hover:text-yellow-600">
                        Advanced F2L Cases
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}