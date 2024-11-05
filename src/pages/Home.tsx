import Timeline from '../components/Timeline';
import Organization from '../components/Organization';

export default function Home() {
  return (
    <main>
      <div className="bg-yellow-300 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Philippine Cubers Association
          </h1>
          <p className="text-xl text-gray-800 max-w-2xl mx-auto">
            Philippine Cubers Association reappeared on national television on June 28, 2007 to promote the association and announced the upcoming Rubik's Cube Philippine Open 2007.
          </p>
        </div>
      </div>
      <Timeline />
      <Organization />
    </main>
  );
}