import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Community from './pages/Community';
import Resources from './pages/Resources';
import Meet from './pages/Meet';

function App() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/community" element={<Community />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/meet" element={<Meet />} />
      </Routes>
    </div>
  );
}

export default App;