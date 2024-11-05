import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Competitions from './pages/Competitions';
import Rankings from './pages/Rankings';
import Resources from './pages/Resources';
import Meet from './pages/Meet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data stays fresh for 5 minutes
      gcTime: 1000 * 60 * 30, // Cache is kept for 30 minutes (renamed from cacheTime)
      refetchOnWindowFocus: false,
      retry: 2
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-white">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/competitions" element={<Competitions />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/meet" element={<Meet />} />
        </Routes>
      </div>
    </QueryClientProvider>
  );
}

export default App;