import React, { useState, useEffect, useRef, useContext } from 'react';
import { Menu, X, Upload, Camera, LogIn, LogOut, User, MessageSquare, Phone, Mail, AlertCircle, Calendar, ChevronDown, ChevronUp, ImageIcon } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { storeUserCredentials, getUserByEmail, queryUserByEmail } from '../config/dynamodb';
import { UserContext } from '../App';
import PhoneVerification from './PhoneVerification';
import { s3ClientPromise, getOrganizationLogoPath, getOrganizationLogoUrl, ensureFolderStructure, getOrganizationFolderPath, validateEnvVariables } from '../config/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';

interface NavbarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  showSignInModal: boolean;
  setShowSignInModal: (show: boolean) => void;
}

interface DecodedToken {
  exp: number;
  name: string;
  email: string;
  picture: string;
  sub: string;
}

interface UserProfile {
  name: string;
  email: string;
  picture: string;
  mobile: string;
}

const Navbar: React.FC<NavbarProps> = ({ 
  mobileMenuOpen, 
  setMobileMenuOpen,
  showSignInModal,
  setShowSignInModal 
}) => {
  const { userEmail, userRole, setUserEmail, setUserRole } = useContext(UserContext);
  const [isLoggedIn, setIsLoggedIn] = useState(!!userEmail);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [signInForm, setSignInForm] = useState({
    name: '',
    mobile: ''
  });
  const [contactForm, setContactForm] = useState({
    fullName: '',
    email: '',
    mobile: '',
    event: '',
    message: ''
  });
  const [formErrors, setFormErrors] = useState({
    name: '',
    mobile: ''
  });
  const [showSignInError, setSignInError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserProfile | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [navType, setNavType] = useState<'organizer' | 'attendee' | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');

  useEffect(() => {
    const token = localStorage.getItem('googleToken');
    const storedProfile = localStorage.getItem('userProfile');
    
    if (token && storedProfile) {
      try {
        const decoded = jwtDecode<DecodedToken>(token);
        const exp = decoded.exp * 1000; // Convert to milliseconds
        
        if (exp > Date.now()) {
          setIsLoggedIn(true);
          setUserProfile(JSON.parse(storedProfile));
          setUserEmail(decoded.email);
          
          // Check user role from DynamoDB using both methods
          const checkUserRole = async () => {
            try {
              // First try with getUserByEmail
              let user = await getUserByEmail(decoded.email);
              console.log('getUserByEmail result:', user);
              
              // If that fails, try with queryUserByEmail
              if (!user) {
                console.log('getUserByEmail returned null, trying queryUserByEmail');
                user = await queryUserByEmail(decoded.email);
                console.log('queryUserByEmail result:', user);
              }
              
              if (user && user.role) {
                console.log('User role found:', user.role);
                setUserRole(user.role);
              } else {
                console.log('No user role found for email:', decoded.email);
                // Set a consistent role of 'organizer' if no role is found
                setUserRole('organizer');
                
                // Optionally, create/update the user record to include a role
                try {
                  const mobileNumber = localStorage.getItem('userMobile') || '';
                  await storeUserCredentials({
                    userId: decoded.email,
                    email: decoded.email,
                    name: JSON.parse(storedProfile).name || '',
                    mobile: mobileNumber,
                    role: 'organizer'
                  });
                  console.log('Added default user role to database');
                } catch (err) {
                  console.error('Error adding default user role:', err);
                }
              }
            } catch (error) {
              console.error('Error fetching user role:', error);
              // Set a default role as fallback
              setUserRole('user');
            }
          };
          
          checkUserRole();
        } else {
          handleLogout();
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        handleLogout();
      }
    }
  }, [setUserEmail, setUserRole]);

  // Update useEffect to set navType based on current location and user role
  useEffect(() => {
    if (isLoggedIn) {
      // Handle home page specially - no specific navType needed
      if (location.pathname === '/') {
        console.log('On home page, not setting specific navType');
        setNavType(null);
      }
      // Explicitly set navigation type based on current page
      else if (location.pathname === '/attendee-dashboard' || 
               location.pathname.includes('/attendee') ||
               location.pathname.includes('/event-photos') ||
               location.pathname.includes('/my-photos')) {
        console.log('Setting navType to attendee based on current page:', location.pathname);
        setNavType('attendee');
      } else if (location.pathname === '/events' || 
                location.pathname.includes('/event') || 
                location.pathname === '/upload' || 
                location.pathname.includes('/upload') ||
                location.pathname.includes('/view-event')) {
        console.log('Setting navType to organizer based on current page:', location.pathname);
        setNavType('organizer');
      } else if (userRole === 'organizer') {
        setNavType('organizer');
      } else if (userRole === 'attendee') {
        setNavType('attendee');
      }
    }
  }, [isLoggedIn, location.pathname, userRole]);

  // Keep the pendingAction useEffect
  useEffect(() => {
    if (isLoggedIn) {
      const pendingAction = localStorage.getItem('pendingAction');
      if (pendingAction === 'createEvent') {
        setNavType('organizer');
      } else if (pendingAction === 'getPhotos') {
        setNavType('attendee');
      }
    }
  }, [isLoggedIn]);

  // Add scroll event listener
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      if (scrollPosition > 10) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleSignIn = async (credentialResponse: CredentialResponse) => {
    try {
      const credential = credentialResponse.credential;
      if (!credential) throw new Error('No credential received');

      const decoded: any = jwtDecode(credential);
      if (!decoded) throw new Error('Unable to decode credentials');

      const email = decoded.email || '';
      console.log('Decoded email:', email);

      // Check if user exists in DynamoDB
      let existingUser = await getUserByEmail(email);
      if (!existingUser) {
        existingUser = await queryUserByEmail(email);
      }

      // If user doesn't exist, switch to signup tab
      if (!existingUser) {
        setActiveTab('signup');
        setSignInError('User not registered. Please sign up to continue.');
        return;
      }

      // Get the stored data
      const phoneNumber = localStorage.getItem('pendingPhoneNumber') || '';
      const organizationDataStr = localStorage.getItem('pendingOrganizationData');
      let organizationData = null;
      let organizationLogo = null;

      if (organizationDataStr) {
        try {
          organizationData = JSON.parse(organizationDataStr);
          console.log('Organization data loaded:', organizationData);
        } catch (error) {
          console.error('Error parsing organization data:', error);
        }
      }

      // If user doesn't exist and no phone number is provided, show error
      if (!existingUser && !phoneNumber) {
        setSignInError('User not registered. Please enter your phone number to continue.');
        return;
      }

      const name = decoded.name || '';
      const picture = decoded.picture || '';

      // Check if there was a pending action before login
      const pendingAction = localStorage.getItem('pendingAction');
      const role = pendingAction === 'createEvent' ? 'organizer' : 'attendee';
      
      // Set the navigation type based on the pending action
      if (pendingAction === 'createEvent') {
        setNavType('organizer');
      } else if (pendingAction === 'getPhotos') {
        setNavType('attendee');
      }

      let organizationCode = '';
      let logoUrl = '';

      // Handle organization data and logo upload
      if (organizationData?.isOrganization) {
        console.log('Processing organization data...');
        
        // Check if user already has an organization code
        if (existingUser?.organizationCode) {
          organizationCode = existingUser.organizationCode;
          console.log('Using existing organization code:', organizationCode);
        } else {
          organizationCode = Math.floor(100000 + Math.random() * 900000).toString();
          console.log('Generated new organization code:', organizationCode);
        }

        // Get the logo file from the PhoneVerification component
        const logoFile = document.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
        if (logoFile) {
          try {
            console.log('Starting logo upload process...');
            // Create folder structure first
            await ensureFolderStructure(email);
            
            const folderPath = getOrganizationFolderPath(email);
            const s3Key = getOrganizationLogoPath(email, logoFile.name);
            
            console.log('Creating folder structure:', folderPath);
            console.log('Uploading logo to:', s3Key);

            try {
              // Convert File to arrayBuffer
              const fileBuffer = await logoFile.arrayBuffer();
              
              // Upload directly to S3
              const uploadCommand = new PutObjectCommand({
                Bucket: (await validateEnvVariables()).bucketName,
                Key: s3Key,
                Body: new Uint8Array(fileBuffer),
                ContentType: logoFile.type,
                ACL: 'public-read'
              });

              console.log('Sending upload command to S3...');
              await (await s3ClientPromise).send(uploadCommand);

              // Get the S3 URL
              logoUrl = await getOrganizationLogoUrl(email, logoFile.name);
              console.log('Organization logo uploaded successfully to:', logoUrl);
            } catch (uploadError) {
              console.error('S3 upload error:', uploadError);
              throw new Error('Failed to upload logo to S3. Please try again.');
            }
          } catch (error) {
            console.error('Error uploading logo:', error);
            setSignInError('Failed to upload organization logo. Please try again.');
            return;
          }
        } else {
          console.log('No logo file found in the input element');
        }
      }

      // Store user in DynamoDB
      const userData = {
        userId: email,
        email: email,
        name: name || '',
        mobile: existingUser?.mobile || phoneNumber,
        role: role,
        organizationName: organizationData?.organizationName,
        organizationCode: organizationCode || undefined,
        organizationLogo: logoUrl || undefined
      };

      console.log('Storing user data in DynamoDB:', userData);
      await storeUserCredentials(userData);

      // Store essential user data in localStorage
      localStorage.setItem('userEmail', email);
      localStorage.setItem('userMobile', userData.mobile);
      if (organizationCode) {
        localStorage.setItem('organizationCode', organizationCode);
      }
      
      if (credentialResponse.credential) {
        localStorage.setItem('googleToken', credentialResponse.credential);
      }
      localStorage.setItem('userProfile', JSON.stringify({
        name,
        email,
        picture,
        mobile: userData.mobile,
        organizationName: userData.organizationName,
        organizationCode: userData.organizationCode,
        organizationLogo: userData.organizationLogo
      }));

      // Clear the pending data
      localStorage.removeItem('pendingPhoneNumber');
      localStorage.removeItem('pendingOrganizationData');

      setShowSignInModal(false);
      setUserProfile({
        name,
        email,
        picture,
        mobile: userData.mobile
      });
      setUserEmail(email);
      setIsLoggedIn(true);
      setUserRole(role);

      if (pendingAction) {
        localStorage.removeItem('pendingAction');
        if (pendingAction === 'createEvent') {
          navigate('/events?create=true');
        } else if (pendingAction === 'getPhotos') {
          const pendingRedirectUrl = localStorage.getItem('pendingRedirectUrl');
          if (pendingRedirectUrl) {
            localStorage.removeItem('pendingRedirectUrl');
            // Set flag to indicate we need to reload after redirect
            sessionStorage.setItem('justLoggedIn', 'true');
            window.location.href = pendingRedirectUrl;
          } else {
            navigate('/attendee-dashboard');
          }
        }
      }
    } catch (error) {
      console.error('Error in sign in process:', error);
      setSignInError('Failed to sign in. Please try again.');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserProfile(null);
    setUserRole(null);
    setUserEmail(null);
    setNavType(null);
    localStorage.removeItem('googleToken');
    localStorage.removeItem('userProfile');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userMobile');
    localStorage.removeItem('pendingAction');
    localStorage.removeItem('pendingRedirectUrl');
    
    // Navigate to homepage and reload the page
    navigate('/', { replace: true });
    window.location.reload();
  };

  const validateForm = () => {
    // No longer validating form, always true
    return true;
  };

  const isFormValid = true; // Always valid since we don't need form fields anymore

  const handleSignOut = async () => {
    // Clear user data from localStorage
    localStorage.removeItem('googleToken');
    localStorage.removeItem('userProfile');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userMobile');
    localStorage.removeItem('pendingAction');
    localStorage.removeItem('pendingRedirectUrl');
    
    setUserInfo(null);
    setIsUserMenuOpen(false);
    
    // Redirect to home page
    navigate('/');
  };

  const handleSignUpWithGoogle = async (response: any) => {
    try {
      const credential = response.credential;
      if (!credential) throw new Error('No credential received');

      const decoded: any = jwtDecode(credential);
      if (!decoded) throw new Error('Unable to decode credentials');

      const email = decoded.email || '';
      console.log('Decoded email for signup:', email);

      // Check if user already exists
      let existingUser = await getUserByEmail(email);
      if (!existingUser) {
        existingUser = await queryUserByEmail(email);
      }

      // If user exists, process sign in instead of showing error
      if (existingUser) {
        console.log('User exists, processing sign in');
        handleSignIn(response);
        return;
      }

      const name = decoded.name || '';
      const picture = decoded.picture || '';
      const phoneNumber = response.phoneNumber || localStorage.getItem('pendingPhoneNumber') || '';
      const organizationDataStr = localStorage.getItem('pendingOrganizationData');
      let organizationData = null;

      if (organizationDataStr) {
        try {
          organizationData = JSON.parse(organizationDataStr);
          console.log('Organization data loaded:', organizationData);
        } catch (error) {
          console.error('Error parsing organization data:', error);
        }
      }

      let organizationCode = '';
      let logoUrl = '';

      // Handle organization data and logo upload for new organization
      if (organizationData?.isOrganization) {
        console.log('Processing organization data for new user...');
        organizationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        if (response.organizationLogo) {
          try {
            // Create folder structure first
            await ensureFolderStructure(email);
            
            const folderPath = getOrganizationFolderPath(email);
            const s3Key = getOrganizationLogoPath(email, response.organizationLogo.name);
            
            console.log('Creating folder structure:', folderPath);
            console.log('Uploading logo to:', s3Key);

            // Convert File to arrayBuffer
            const fileBuffer = await response.organizationLogo.arrayBuffer();
            
            // Upload directly to S3
            const uploadCommand = new PutObjectCommand({
              Bucket: (await validateEnvVariables()).bucketName,
              Key: s3Key,
              Body: new Uint8Array(fileBuffer),
              ContentType: response.organizationLogo.type,
              ACL: 'public-read'
            });

            console.log('Sending upload command to S3...');
            await (await s3ClientPromise).send(uploadCommand);

            // Get the S3 URL
            logoUrl = await getOrganizationLogoUrl(email, response.organizationLogo.name);
            console.log('Organization logo uploaded successfully to:', logoUrl);
          } catch (error) {
            console.error('Error uploading logo:', error);
            setSignInError('Failed to upload organization logo. Please try again.');
            return;
          }
        }
      }

      // Check if there was a pending action before signup
      const pendingAction = localStorage.getItem('pendingAction');
      const role = pendingAction === 'createEvent' ? 'organizer' : 'attendee';
      
      // Set the navigation type based on the pending action
      if (pendingAction === 'createEvent') {
        setNavType('organizer');
      } else if (pendingAction === 'getPhotos') {
        setNavType('attendee');
      }

      // Store new user in DynamoDB
      const userData = {
        userId: email,
        email: email,
        name: name || '',
        mobile: phoneNumber,
        role: role,
        organizationName: organizationData?.organizationName,
        organizationCode: organizationCode || undefined,
        organizationLogo: logoUrl || undefined
      };

      console.log('Creating new user in DynamoDB:', userData);
      await storeUserCredentials(userData);

      // Store essential user data in localStorage
      localStorage.setItem('userEmail', email);
      localStorage.setItem('userMobile', phoneNumber);
      if (organizationCode) {
        localStorage.setItem('organizationCode', organizationCode);
      }
      
      localStorage.setItem('googleToken', credential);
      localStorage.setItem('userProfile', JSON.stringify({
        name,
        email,
        picture,
        mobile: phoneNumber,
        organizationName: organizationData?.organizationName,
        organizationCode: organizationCode,
        organizationLogo: logoUrl
      }));

      // Clear the pending data
      localStorage.removeItem('pendingPhoneNumber');
      localStorage.removeItem('pendingOrganizationData');

      setShowSignInModal(false);
      setUserProfile({
        name,
        email,
        picture,
        mobile: phoneNumber
      });
      setUserEmail(email);
      setIsLoggedIn(true);
      setUserRole(role);

      if (pendingAction) {
        localStorage.removeItem('pendingAction');
        if (pendingAction === 'createEvent') {
          navigate('/events?create=true');
        } else if (pendingAction === 'getPhotos') {
          const pendingRedirectUrl = localStorage.getItem('pendingRedirectUrl');
          if (pendingRedirectUrl) {
            localStorage.removeItem('pendingRedirectUrl');
            // Set flag to indicate we need to reload after redirect
            sessionStorage.setItem('justLoggedIn', 'true');
            window.location.href = pendingRedirectUrl;
          } else {
            navigate('/attendee-dashboard');
          }
        }
      }
    } catch (error) {
      console.error('Error in sign up process:', error);
      setSignInError('Failed to sign up. Please try again.');
    }
  };

  return (              
    <header 
      ref={headerRef}
      className={`bg-white fixed top-0 left-0 right-0 z-[1000] transition-all duration-300 rounded-b-2xl ${
        scrolled ? 'shadow-2xl py-1' : 'shadow-md py-2'
      }`}
    >
      <nav className="mx-auto flex items-center justify-between p-2 sm:px-4 lg:px-8 relative" aria-label="Global">
        <div className="flex-1 flex items-center -ml-4 sm:ml-0">
          <Link to="/" className={`flex items-center transform transition-all duration-300 hover:scale-105 ${
            scrolled ? 'scale-90' : ''
          }`}>
            <img src="/chitralai.jpeg" alt="Chitralai Logo" className="h-10 w-auto" />
          </Link>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full p-2.5 text-blue-600 hover:text-blue-800 transition-colors duration-300 ml-auto"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open main menu</span>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        <div className="hidden lg:flex lg:gap-x-2 items-center">
          {!isLoggedIn && (
            <>
              {/*<Link to="/" className={`text-base font-semibold leading-6 text-blue-600 hover:text-blue-800 transition-all duration-300 hover:bg-blue-50 px-3 py-2 rounded-lg ${location.pathname === '/' ? 'bg-blue-50' : ''}`}>
                Home
              </Link>
              <Link to="/about" className={`text-base font-semibold leading-6 text-blue-600 hover:text-blue-800 transition-all duration-300 hover:bg-blue-50 px-3 py-2 rounded-lg ${location.pathname === '/about' ? 'bg-blue-50' : ''}`}>
                About
              </Link>*/}
            </>
          )}
        </div>
        <div className="hidden lg:flex lg:flex-1 lg:justify-end">
          {!isLoggedIn ? (
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowContactModal(true)}
                className="text-blue-600 hover:text-blue-800 transition-all duration-300 hover:scale-105 px-4 py-2 rounded-full hover:bg-blue-50"
              >
                Get in Touch
              </button>
              <button
                onClick={() => setShowSignInModal(true)}
                className={`flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300 shadow-md ${
                  scrolled ? 'py-1' : 'py-1.5'
                }`}
              >
                <LogIn className="h-4 w-4" /> Sign In
              </button>
              
            </div>
          ) : (
            <div className="flex items-center gap-4">
              {/* Show Events tab on home page */}
              {location.pathname === '/' && (
                <Link to="/events" className="text-base font-semibold leading-6 text-blue-600 hover:text-blue-800 transition-all duration-300 hover:scale-105 px-5 py-2 rounded-lg hover:bg-blue-50 flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />Events
                </Link>
              )}
              
              {/* Conditional navigation based on navType */}
              {navType === 'organizer' && (
                <>
                  <Link to="/events" className={`text-base whitespace-nowrap font-semibold leading-6 text-blue-600 hover:text-blue-800 transition-all duration-300 hover:scale-105 px-5 py-2 rounded-lg hover:bg-blue-50 flex items-center ${location.pathname === '/events' ? 'bg-blue-50' : ''}`}>
                    <Calendar className="h-4 w-4 mr-2" />Events
                  </Link>
                  
                  <Link to="/upload" className={`text-base whitespace-nowrap font-semibold leading-6 text-blue-600 hover:text-blue-800 transition-all duration-300 hover:scale-105 px-5 py-2 rounded-lg hover:bg-blue-50 flex items-center ${location.pathname === '/upload' ? 'bg-blue-50' : ''}`}>
                    <Upload className="h-4 w-4 mr-2" />Uploaded Images
                  </Link>
                </>
              )}
              
              {navType === 'attendee' && (
                <>
                  <Link to="/attendee-dashboard" className={`text-base whitespace-nowrap font-semibold leading-6 text-blue-600 hover:text-blue-800 transition-all duration-300 hover:scale-105 px-5 py-2 rounded-lg hover:bg-blue-50 flex items-center ${location.pathname === '/attendee-dashboard' ? 'bg-blue-50' : ''}`}>
                    <Camera className="h-4 w-4 mr-2" />My Albums
                  </Link>
                  <Link to="/my-photos" className={`text-base whitespace-nowrap font-semibold leading-6 text-blue-600 hover:text-blue-800 transition-all duration-300 hover:scale-105 px-5 py-2 rounded-lg hover:bg-blue-50 flex items-center ${location.pathname === '/my-photos' ? 'bg-blue-50' : ''}`}>
                    <ImageIcon className="h-4 w-4 mr-2" />My Photos
                  </Link>
                  <Link to="/my-organizations" className={`text-base whitespace-nowrap font-semibold leading-6 text-blue-600 hover:text-blue-800 transition-all duration-300 hover:scale-105 px-5 py-2 rounded-lg hover:bg-blue-50 flex items-center ${location.pathname === '/my-organizations' ? 'bg-blue-50' : ''}`}>
                    <User className="h-4 w-4 mr-2" />My Organizations
                  </Link>
                </>
              )}
              
              {/* Always show logout button when logged in */}
              <button
                onClick={handleLogout}
                className="text-base font-semibold leading-6 text-blue-600 hover:text-blue-800 transition-all duration-300 hover:scale-105 px-5 py-2 rounded-lg hover:bg-blue-50 flex items-center"
              >
                <LogOut className="h-4 w-4 mr-2" />Logout
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile menu - updated for better styling */}
      <div className={`lg:hidden ${mobileMenuOpen ? 'fixed inset-0 z-[1100]' : 'hidden'}`}>
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" onClick={() => setMobileMenuOpen(false)} />
        <div className="fixed inset-y-0 right-0 z-[1200] w-full overflow-y-auto bg-white px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10 transform transition-transform duration-300 ease-in-out">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center" onClick={() => setMobileMenuOpen(false)}>
              <img src="/chitralai.jpeg" alt="Chitralai Logo" className="h-12 w-auto" />
            </Link>
            <button
              type="button"
              className="rounded-full p-2.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors duration-300"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="sr-only">Close menu</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-gray-500/10">
              <div className="space-y-2 py-6">
               {/* <Link 
                  to="/" 
                  className={`-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 w-full text-left ${location.pathname === '/' ? 'bg-blue-50' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Home
                </Link>
                <Link 
                  to="/about" 
                  className={`-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 w-full text-left ${location.pathname === '/about' ? 'bg-blue-50' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  About
                </Link>*/}
                {!isLoggedIn && (
                  <>
                    <button
                      onClick={() => {
                        setShowContactModal(true);
                        setMobileMenuOpen(false);
                      }}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 w-full text-left"
                    >
                      Get in Touch
                    </button>
                    <button
                      onClick={() => {
                        setShowSignInModal(true);
                        setMobileMenuOpen(false);
                      }}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 w-full text-left flex items-center"
                    >
                      <LogIn className="h-5 w-5 mr-2" /> Sign In
                    </button>
                  </>
                )}
                {isLoggedIn && (
                  <>
                    {/* Show Events tab on home page in mobile menu */}
                    {location.pathname === '/' && (
                      <Link
                        to="/events"
                        className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Calendar className="h-5 w-5 mr-2" /> Events
                      </Link>
                    )}
                    
                    {/* Conditional navigation based on navType */}
                    {navType === 'organizer' && (
                      <>
                        <Link
                          to="/events"
                          className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Calendar className="h-5 w-5 mr-2" /> Events
                        </Link>
                        
                        <Link
                          to="/upload"
                          className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Upload className="h-5 w-5 mr-2" /> Uploaded Images
                        </Link>
                      </>
                    )}
                    
                    {navType === 'attendee' && (
                      <>
                        <Link
                          to="/attendee-dashboard"
                          className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Camera className="h-5 w-5 mr-2" /> My Albums
                        </Link>
                        <Link
                          to="/my-photos"
                          className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <ImageIcon className="h-5 w-5 mr-2" /> My Photos
                        </Link>
                        <Link
                          to="/my-organizations"
                          className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <User className="h-5 w-5 mr-2" /> My Organizations
                        </Link>
                      </>
                    )}

                    {/* Always show logout option when logged in */}
                    <button
                      onClick={() => {
                        handleLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50 w-full text-left flex items-center"
                    >
                      <LogOut className="h-5 w-5 mr-2" /> Logout
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Sign In Modal */}
      {showSignInModal && (
        <div className="fixed inset-0 z-[1300] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center px-4 py-6 sm:p-0">
            <div 
              className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity" 
              aria-hidden="true" 
              onClick={() => setShowSignInModal(false)} 
            />
            <div className="relative w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left shadow-xl transition-all sm:my-8 sm:p-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setActiveTab('signin')}
                    className={`px-4 py-2 rounded-md transition-all duration-200 ${
                      activeTab === 'signin'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => setActiveTab('signup')}
                    className={`px-4 py-2 rounded-md transition-all duration-200 ${
                      activeTab === 'signup'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>
                <button
                  onClick={() => setShowSignInModal(false)}
                  className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form Fields */}
              <div className="space-y-5">
                {activeTab === 'signin' ? (
                  <div className="mt-4">
                    <div className="flex flex-col items-center gap-4">
                      <div>
                        <GoogleLogin 
                          onSuccess={handleSignIn} 
                          onError={() => {
                            console.error('Google Login Error');
                            setSignInError('Failed to sign in. Please try again.');
                          }} 
                        />
                      </div>
                      <p className="text-sm text-gray-600 mt-4">
                        New to Chitralai? 
                        <button 
                          onClick={() => setActiveTab('signup')}
                          className="text-blue-600 hover:text-blue-800 ml-1 font-medium"
                        >
                          Create an account
                        </button>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="flex flex-col items-center gap-4">
                      <p className="text-xl font-semibold text-gray-900">
                        Create your account
                      </p>
                      <PhoneVerification
                        isSignUp={true}
                        onSubmit={async (data) => {
                          localStorage.setItem('pendingPhoneNumber', data.phoneNumber);
                          
                          if (data.isOrganization && data.organizationName && data.organizationLogo) {
                            localStorage.setItem('pendingOrganizationData', JSON.stringify({
                              isOrganization: true,
                              organizationName: data.organizationName
                            }));
                          }
                        }}
                        onGoogleSignIn={handleSignUpWithGoogle}
                        onError={() => {
                          console.error('Google Login Error');
                          setSignInError('Failed to sign up. Please try again.');
                        }}
                      />
                      <p className="text-sm text-gray-600 mt-4">
                        Already have an account? 
                        <button 
                          onClick={() => setActiveTab('signin')}
                          className="text-blue-600 hover:text-blue-800 ml-1 font-medium"
                        >
                          Sign in
                        </button>
                      </p>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {showSignInError && (
                  <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl text-sm flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    {showSignInError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-[1300] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" onClick={() => setShowContactModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-auto p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">Get in Touch</h2>
                <button
                  onClick={() => setShowContactModal(false)}
                  className="text-gray-400 hover:text-gray-500 rounded-full p-2 hover:bg-gray-100"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Contact Information */}
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-3">Contact us via:</p>
                <div className="space-y-2">
                  <p className="text-gray-700 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-500" /> chitralai.in@gmail.com
                  </p>
                  <p className="text-gray-700 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-blue-500" /> +91-8977725553
                  </p>
                </div>
              </div>

              {/* Social Links */}
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-3">Or connect with us directly:</p>
                <div className="flex gap-4">
                  <a href="https://wa.me/918977725553" 
                     className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors">
                    <img src="/whatsapp-icon.svg" alt="WhatsApp" className="h-5 w-5" />
                  </a>
                  <a href="mailto:Contact@chitralai.in" 
                     className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                    <Mail className="h-5 w-5" />
                  </a>
                  <a href="tel:+91897772553" 
                     className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-500 text-white hover:bg-purple-600 transition-colors">
                    <Phone className="h-5 w-5" />
                  </a>
                </div>
              </div>

              {/* Contact Form */}
              <form className="space-y-4">
                <div>
                  <input
                    type="text"
                    placeholder="Full Name"
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    value={contactForm.fullName}
                    onChange={(e) => setContactForm({...contactForm, fullName: e.target.value})}
                  />
                </div>
                <div>
                  <input
                    type="email"
                    placeholder="Email"
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
                  />
                </div>
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="w-24 shrink-0">
                      <select
                        className="w-full h-10 px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        defaultValue="+91"
                      >
                        <option value="+91">+91</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <input
                        type="tel"
                        placeholder="Mobile"
                        className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        value={contactForm.mobile}
                        onChange={(e) => setContactForm({...contactForm, mobile: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <textarea
                    placeholder="Type your message"
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none"
                    value={contactForm.message}
                    onChange={(e) => setContactForm({...contactForm, message: e.target.value})}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full h-10 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-300 font-medium"
                >
                  Submit Now
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
