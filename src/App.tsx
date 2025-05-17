import React, { createContext, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, Navigate } from 'react-router-dom';

import Navbar from './components/Navbar';
import Hero from './components/Hero';

import HowItWorks from './components/HowItWorks';
import FAQ from './components/FAQ';
import Footer from './components/Footer';
import UploadImage from './components/UploadImage';

import EventDashboard from './components/EventDashboard';
import EventDetail from './components/EventDetail';
import ViewEvent from './components/ViewEvent';
import AttendeeDashboard from './components/AttendeeDashboard';
import EventPhotos from './components/EventPhotos';
import MyPhotos from './components/MyPhotos';
import MyOrganizations from './components/MyOrganizations';
import { queryUserByEmail, storeUserCredentials } from './config/dynamodb';
import { migrateLocalStorageToDb } from './config/eventStorage';
import Login from './components/Login';

// Create a user context to manage authentication state
export const UserContext = createContext<{
  userEmail: string | null;
  userRole: string | null;
  setUserEmail: (email: string | null) => void;
  setUserRole: (role: string | null) => void;
}>({
  userEmail: null,
  userRole: null,
  setUserEmail: () => {},
  setUserRole: () => {}
});

const App = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [showNavbar, setShowNavbar] = React.useState(true);
  const [showSignInModal, setShowSignInModal] = React.useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('userEmail'));
  const [userRole, setUserRole] = useState<string | null>(null);

  // Ensure user exists in DynamoDB
  const ensureUserInDb = async (email: string) => {
    try {
      // Check if user exists
      const user = await queryUserByEmail(email);
      
      // If user doesn't exist, create default record
      if (!user) {
        console.log('Creating default user record in DynamoDB');
        
        // Get user info from localStorage if available
        let name = '';
        let mobile = '';
        
        const userProfileStr = localStorage.getItem('userProfile');
        if (userProfileStr) {
          try {
            const userProfile = JSON.parse(userProfileStr);
            name = userProfile.name || '';
          } catch (e) {
            console.error('Error parsing user profile from localStorage', e);
          }
        }
        
        mobile = localStorage.getItem('userMobile') || '';
        
        // Check if there was a pending action
        const pendingAction = localStorage.getItem('pendingAction');
        const role = pendingAction === 'createEvent' ? 'organizer' : 'attendee';
        
        // Create user with appropriate role
        await storeUserCredentials({
          userId: email,
          email,
          name,
          mobile,
          role: role
        });
        
        return role;
      }
      
      return user.role || 'attendee'; // Default to attendee if no role exists
    } catch (error) {
      console.error('Error ensuring user in DynamoDB:', error);
      return 'attendee'; // Default to attendee on error
    }
  };

  // Check user role on mount or when email changes
  useEffect(() => {
    const fetchUserRole = async () => {
      if (userEmail) {
        try {
          // Migrate any existing localStorage data to DynamoDB
          await migrateLocalStorageToDb(userEmail);
          
          // Ensure user exists in DynamoDB and get role
          const role = await ensureUserInDb(userEmail);
          setUserRole(role);
          
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUserRole('user'); // Default fallback
        }
      }
    };

    fetchUserRole();
  }, [userEmail]);

  return (
    <UserContext.Provider value={{ userEmail, userRole, setUserEmail, setUserRole }}>
      <Router>
      {showSignInModal && <Login />}
        <div className="min-h-screen bg-white">
          {showNavbar && (
            <Navbar
              mobileMenuOpen={mobileMenuOpen}
              setMobileMenuOpen={setMobileMenuOpen}
              showSignInModal={showSignInModal}
              setShowSignInModal={setShowSignInModal}
            />
          )}
          <Routes>
            <Route path="/" element={
              <div className="animate-slideIn">
                <Hero onShowSignIn={() => setShowSignInModal(true)} />
                <HowItWorks />
                <FAQ />
              </div>
            } />
            <Route path="/events" element={<div className="animate-slideIn"><EventDashboard setShowNavbar={setShowNavbar} /></div>} />
            <Route path="/event/:eventId" element={<div className="animate-slideIn"><EventDetail eventId={useParams().eventId || ''} /></div>} />
            <Route path="/attendee-dashboard" element={<div className="animate-slideIn"><AttendeeDashboard setShowSignInModal={setShowSignInModal} /></div>} />
            <Route path="/event-photos/:eventId" element={<div className="animate-slideIn"><EventPhotos /></div>} />
            <Route path="/my-photos" element={<div className="animate-slideIn"><MyPhotos /></div>} />
            <Route path="/upload" element={<div className="animate-slideIn"><UploadImage /></div>} />
            <Route path="/upload-image" element={<div className="animate-slideIn"><UploadImage /></div>} />
            
            <Route path="/view-event/:eventId" element={<div className="animate-slideIn"><ViewEventWrapper /></div>} />
            <Route path="/my-organizations" element={<MyOrganizations />} />
          </Routes>
          <Footer />
        </div>
      </Router>
    </UserContext.Provider>
  );
};

const ViewEventWrapper = () => {
  const { eventId } = useParams();
  return <ViewEvent eventId={eventId || ''} />;
};

export default App;