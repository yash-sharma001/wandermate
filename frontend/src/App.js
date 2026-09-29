import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

// Import components
import Landing from './components/Auth/Landing';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import { ForgotPassword, ResetPassword } from './components/Auth/Recover';
import MapView from './components/Map/MapView';
import ActivityDetails from './components/Activities/ActivityDetails';
import CreateActivity from './components/Activities/CreateActivity';
import Profile from './components/Profile/Profile';
import TravelJournal from './components/Journal/TravelJournal';
import Marketplace from './components/Marketplace/Marketplace';
import VendorDashboard from './components/Vendor/VendorDashboard';
import TravelPackages from './components/Packages/TravelPackages';
import ProviderDashboard from './components/Provider/ProviderDashboard';
import Groups from './components/Groups/Groups';
import GroupDetail from './components/Groups/GroupDetail';
import JoinGroup from './components/Groups/JoinGroup';
import WaveDashboard from './components/Waves/WaveDashboard';
import Itinerary from './components/Itinerary/Itinerary';
import Navbar from './components/Layout/Navbar';

import { motion, AnimatePresence } from 'framer-motion';
import { authAPI, usersAPI, setToken, refreshSession } from './utils/api';

// Fade-in wrapper; also gives every screen the shared page gutter
// Logged-out visitors opening an invite link: remember it, sign in, then land on the join page
const RememberInvite = () => {
  const { code } = useParams();
  sessionStorage.setItem('pendingInvite', code);
  return <Navigate to="/login" replace />;
};

const PageWrapper = ({ children, className = '' }) => (
  <motion.div className={`page ${className}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
    {children}
  </motion.div>
);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Restore the session from the refresh cookie; the cached profile fills in fields the slim login payload lacks
  useEffect(() => {
    refreshSession()
      .then(({ user: fresh }) => {
        const saved = JSON.parse(localStorage.getItem('user') || 'null');
        setUser(saved?.id === fresh.id ? { ...saved, ...fresh } : fresh);
      })
      .catch(() => localStorage.removeItem('user'))
      .finally(() => setLoading(false));
  }, []);

  // The login payload is slim; pull the full profile (verification flags etc.) so gated screens know the user's state
  useEffect(() => {
    if (!user?.id) return;
    usersAPI.getProfile().then((res) => {
      const merged = { ...user, ...res.data.user };
      localStorage.setItem('user', JSON.stringify(merged));
      setUser(merged);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const pending = user && sessionStorage.getItem('pendingInvite');
    if (pending) {
      sessionStorage.removeItem('pendingInvite');
      navigate(`/join/${pending}`, { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = (userData, token) => {
    setToken(token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    authAPI.logout().catch(() => {}); // revoke the session server-side (refresh token + Redis blacklist)
    setToken(null);
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner-modern"></div>
        <p>WanderMates is getting ready...</p>
      </div>
    );
  }

  const isVendor = user?.role === 'vendor';
  const isProvider = user?.role === 'provider';
  const defaultRoute = isVendor ? '/vendor/dashboard' : isProvider ? '/provider/dashboard' : '/';

  return (
      <div className={`app ${isVendor || isProvider ? 'with-sidebar' : ''}`}>
        {user && <Navbar user={user} onLogout={handleLogout} />}

        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {/* Public routes */}
            <Route path="/welcome" element={!user ? <Landing /> : <Navigate to={defaultRoute} />} />
            <Route 
              path="/login" 
              element={!user ? <Login onLogin={handleLogin} /> : <Navigate to={defaultRoute} />} 
            />
            <Route 
              path="/register" 
              element={!user ? <Register onLogin={handleLogin} /> : <Navigate to={defaultRoute} />} 
            />
            <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to={defaultRoute} />} />
            <Route path="/reset-password" element={!user ? <ResetPassword /> : <Navigate to={defaultRoute} />} />

            {/* Traveler routes */}
            <Route 
              path="/" 
              element={user ? <MapView user={user} onLocationChange={setUserLocation} /> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/activity/:id" 
              element={user ? <PageWrapper><ActivityDetails user={user} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/create-activity" 
              element={user ? <PageWrapper><CreateActivity user={user} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/profile" 
              element={user ? <PageWrapper><Profile user={user} setUser={setUser} userLocation={userLocation} onLogout={handleLogout} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/journal" 
              element={user ? <PageWrapper><TravelJournal user={user} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/marketplace" 
              element={user ? <PageWrapper><Marketplace user={user} userLocation={userLocation} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/packages" 
              element={user ? <PageWrapper><TravelPackages user={user} userLocation={userLocation} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/itinerary" 
              element={user ? <PageWrapper><Itinerary /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/groups" 
              element={user ? <PageWrapper><Groups user={user} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/join/:code" 
              element={user ? <PageWrapper><JoinGroup /></PageWrapper> : <RememberInvite />} 
            />
            <Route 
              path="/groups/:id" 
              element={user ? <PageWrapper><GroupDetail user={user} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/waves" 
              element={user ? <PageWrapper><WaveDashboard user={user} userLocation={userLocation} /></PageWrapper> : <Navigate to="/welcome" />} 
            />

            <Route 
              path="/vendor/dashboard" 
              element={user && isVendor ? <PageWrapper><VendorDashboard user={user} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
            <Route 
              path="/provider/dashboard" 
              element={user && isProvider ? <PageWrapper><ProviderDashboard user={user} /></PageWrapper> : <Navigate to="/welcome" />} 
            />
          </Routes>
        </AnimatePresence>
      </div>
  );
}

export default App;
