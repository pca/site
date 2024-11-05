import { type ReactNode } from 'react';

interface MemberCardProps {
  name: string;
  role: string;
  image?: string;
}

function MemberCard({ name, role, image }: MemberCardProps) {
  return (
    <div className="bg-gray-100 rounded-lg overflow-hidden">
      <div className="aspect-square bg-gray-200">
        {image && (
          <img 
            src={image} 
            alt={name} 
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className="p-4 text-center">
        <h3 className="font-medium text-gray-900">{name}</h3>
        <p className="text-sm text-gray-600">{role}</p>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
        {title}
      </h2>
      <div className="w-24 h-1 bg-yellow-300 mx-auto mb-12" />
      {children}
    </section>
  );
}

export default function Organization() {
  const boardMembers = [
    { name: 'Nino Francis Reyes', role: 'Internals Head' },
    { name: 'Christian Hinkle', role: 'Moderating Head' },
    { name: 'Bille Janssen Lagarde', role: 'Competitions Head' },
    { name: 'Nino Francis Reyes', role: 'Internals Head' },
    { name: 'Christian Hinkle', role: 'Moderating Head' },
    { name: 'Bille Janssen Lagarde', role: 'Competitions Head' },
  ];

  const communicationsCommittee = {
    head: { name: 'John Edison Ubaldo', role: 'Communications Head' },
    members: ['Juan Dela Cube', 'Juan Dela Cube', 'Juan Dela Cube'],
  };

  const moderatingCommittee = {
    head: { name: 'Christian Hinkle', role: 'Moderating Head' },
    members: ['Juan Dela Cube', 'Juan Dela Cube', 'Juan Dela Cube'],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Section title="The Organization">
        <p className="text-center text-gray-600 max-w-3xl mx-auto">
          Philippine Cubers Association reappeared on national television on June 28, 2007 to promote the association and announced the upcoming Rubik's Cube Philippine Open 2007. When the first Philippine Open was finalized, it was then scheduled to take place in August 25, 2007. With its success, it gathered huge attention to cubing enthusiasts and then PCA has begun growing exponentially.
        </p>
      </Section>

      <Section title="PCA Board">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {boardMembers.map((member, index) => (
            <MemberCard key={index} {...member} />
          ))}
        </div>
      </Section>

      <Section title="Communications Committee">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gray-200 aspect-square rounded-lg" />
          <div className="text-center">
            <h3 className="font-medium text-gray-900 mb-4">{communicationsCommittee.head.name}</h3>
            <p className="text-gray-600">{communicationsCommittee.head.role}</p>
            <div className="mt-6">
              <h4 className="font-medium text-gray-900 mb-2">Members</h4>
              <ul className="space-y-2">
                {communicationsCommittee.members.map((member, index) => (
                  <li key={index} className="text-gray-600">{member}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Moderating Committee">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="text-center">
            <h3 className="font-medium text-gray-900 mb-4">{moderatingCommittee.head.name}</h3>
            <p className="text-gray-600">{moderatingCommittee.head.role}</p>
            <div className="mt-6">
              <h4 className="font-medium text-gray-900 mb-2">Members</h4>
              <ul className="space-y-2">
                {moderatingCommittee.members.map((member, index) => (
                  <li key={index} className="text-gray-600">{member}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="bg-gray-200 aspect-square rounded-lg" />
        </div>
      </Section>

      <Section title="You">
        <p className="text-center text-gray-600 max-w-3xl mx-auto">
          Your participation and support is also the reason why the Philippine cubing community exists and continues to exist. Come and join us and take part or help volunteer in our competitions and events! :)
        </p>
      </Section>
    </div>
  );
}