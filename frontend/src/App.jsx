import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import RegisterPage from './pages/RegisterPage';
import StatusPage from './pages/StatusPage';
import CheckStatusPage from './pages/CheckStatusPage';
import AdminPage from './pages/AdminPage'; // <--- Import the new page
import DisclaimerPage from './pages/DisclaimerPage';
import PeerFeedbackPage from './pages/PeerFeedbackPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/status/check" element={<CheckStatusPage />} />
        <Route path="/status/:userId" element={<StatusPage />} />
        <Route path="/peer-feedback" element={<PeerFeedbackPage />} />
        
        {/* The new Admin Route */}
        <Route path="/admin" element={<AdminPage />} /> 
        
        <Route path="/disclaimer" element={<DisclaimerPage />} />
      </Routes>
    </Router>
  );
}

export default App;
