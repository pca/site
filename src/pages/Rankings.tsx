import Rankings from '../components/Rankings';

export default function RankingsPage() {
  return (
    <main>
      <div className="bg-yellow-300 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Rankings
          </h1>
          <p className="text-xl text-gray-800 max-w-2xl mx-auto">
            Track the top speedcubers in the Philippines across all events.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Rankings />
      </div>
    </main>
  );
}