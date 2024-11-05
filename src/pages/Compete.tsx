import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import Rankings from '../components/Rankings';
import FAQs from '../components/compete/FAQs';
import Rules from '../components/compete/Rules';
import Competitions from '../components/compete/Competitions';
import OrganizeGuide from '../components/compete/OrganizeGuide';

export default function Compete() {
  return (
    <main>
      <div className="bg-yellow-300 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Compete
          </h1>
          <p className="text-xl text-gray-800 max-w-2xl mx-auto">
            Join the competitive speedcubing community, learn about competitions, and track rankings.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Tabs defaultValue="rankings" className="space-y-8">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 gap-2">
            <TabsTrigger value="rankings">Rankings</TabsTrigger>
            <TabsTrigger value="faqs">FAQs</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="competitions">Competitions</TabsTrigger>
            <TabsTrigger value="organize">Organize</TabsTrigger>
          </TabsList>

          <TabsContent value="rankings">
            <Rankings />
          </TabsContent>

          <TabsContent value="faqs">
            <FAQs />
          </TabsContent>

          <TabsContent value="rules">
            <Rules />
          </TabsContent>

          <TabsContent value="competitions">
            <Competitions />
          </TabsContent>

          <TabsContent value="organize">
            <OrganizeGuide />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}