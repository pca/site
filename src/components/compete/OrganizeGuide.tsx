import { Clipboard, Users, Calendar, Award } from 'lucide-react';

const stages = [
  {
    icon: Clipboard,
    title: "Pre-Post",
    description: "From initial idea to WCA approval",
    details: "Fill out basic information like date, venue, events, sponsors, and registration fees. The Delegate will submit this to WCA for approval."
  },
  {
    icon: Calendar,
    title: "Pre-Competition",
    description: "Planning and preparation",
    details: "Handle registrations, track expenses, promote the event, and prepare competition materials and equipment."
  },
  {
    icon: Users,
    title: "Competition Day",
    description: "Event execution",
    details: "Arrive early for setup, manage registration, conduct competitor tutorial, and oversee event flow."
  },
  {
    icon: Award,
    title: "Post-Competition",
    description: "Wrap-up and reporting",
    details: "Handle payments, clean up the venue, and complete any remaining administrative tasks."
  }
];

export default function OrganizeGuide() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-3xl font-bold mb-6">Organize a Competition</h2>
        <p className="text-gray-600 mb-8">
          Want to bring speedcubing to your area? Here's your guide to organizing a WCA competition.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {stages.map((stage, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow-md">
            <stage.icon className="w-8 h-8 text-yellow-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">{stage.title}</h3>
            <p className="text-yellow-600 text-sm mb-4">{stage.description}</p>
            <p className="text-gray-600 text-sm">{stage.details}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 rounded-lg p-8">
        <h3 className="text-2xl font-semibold mb-6">Ready to organize?</h3>
        <p className="text-gray-600 mb-4">
          Contact a WCA Delegate to get started. They'll guide you through the process and help ensure your competition meets all WCA requirements.
        </p>
        <a 
          href="https://www.worldcubeassociation.org/delegates"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-yellow-300 hover:bg-yellow-400 text-gray-900 font-medium py-2 px-4 rounded-md"
        >
          Find a Delegate
        </a>
      </div>
    </div>
  );
}