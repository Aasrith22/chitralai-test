import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Camera, Users, Shield, Zap, Clock, Image, Share2, ChevronDown, ChevronUp, CheckCircle, Lock } from 'lucide-react';
import { storeUserCredentials, getUserByEmail } from '../config/dynamodb';
import { jwtDecode as jwt_decode } from 'jwt-decode';
import AnnouncementPopup from './AnnouncementPopup';

interface HeroProps {
  onShowSignIn: () => void;
}

const Hero: React.FC<HeroProps> = ({ onShowSignIn }) => {
  const navigate = useNavigate();
  const [showImage, setShowImage] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleCreateEvent = async () => {
    const userEmail = localStorage.getItem('userEmail');
    const token = localStorage.getItem('googleToken');
    
    if (!userEmail || !token) {
      // If user is not signed in, show sign-in modal and set pendingAction
      console.log('User not signed in, showing sign-in modal and setting pendingAction');
      
      // Store in local storage that they wanted to create an event
      // This will be checked after successful login
      localStorage.setItem('pendingAction', 'createEvent');
      onShowSignIn();
    } else {
      try {
        // User is already signed in, set their role as organizer
        const decoded = jwt_decode<any>(token);
        console.log('User already signed in, setting organizer role and navigating to events');
        
        // First, check current user data to see role
        try {
          const existingUser = await getUserByEmail(decoded.email);
          console.log('Current user data before update:', existingUser);
        } catch (checkError) {
          console.error('Error checking existing user:', checkError);
        }
        
        // Update user role to organizer
        const updateResult = await storeUserCredentials({
          userId: decoded.email,
          email: decoded.email,
          name: decoded.name,
          mobile: localStorage.getItem('userMobile') || '',
          role: "organizer" 
        });
        
        if (updateResult) {
          console.log('Successfully updated user role to organizer');
          
          // Verify the update
          try {
            const updatedUser = await getUserByEmail(decoded.email);
            console.log('User data after update:', updatedUser);
          } catch (verifyError) {
            console.error('Error verifying user update:', verifyError);
          }
        } else {
          console.error('Failed to update user role');
        }
        
        // Set pendingAction to createEvent even for logged in users
        localStorage.setItem('pendingAction', 'createEvent');
        
        // Navigate to events dashboard with create parameter to open modal
        navigate('/events?create=true');
      } catch (error) {
        console.error('Error updating user role:', error);
        // Still set pendingAction in case of error
        localStorage.setItem('pendingAction', 'createEvent');
        navigate('/events?create=true');
      }
    }
  };

  const handleGetPhotos = async () => {
    const userEmail = localStorage.getItem('userEmail');
    const token = localStorage.getItem('googleToken');
    
    if (!userEmail || !token) {
      // If user is not signed in, show sign-in modal and set pendingAction
      console.log('User not signed in, showing sign-in modal and setting pendingAction');
      
      // Store in local storage that they wanted to get photos
      localStorage.setItem('pendingAction', 'getPhotos');
      onShowSignIn();
    } else {
      try {
        // User is already signed in, check their role
        const decoded = jwt_decode<any>(token);
        
        // First, check if user exists in the database
        let existingUser;
        try {
          existingUser = await getUserByEmail(decoded.email);
          console.log('Current user data:', existingUser);
        } catch (checkError) {
          console.error('Error checking existing user:', checkError);
          existingUser = null;
        }
        
        // If user doesn't exist or doesn't have a role, create/update them as attendee
        if (!existingUser || !existingUser.role) {
          console.log('User is new or has no role, setting as attendee');
          const updateResult = await storeUserCredentials({
            userId: decoded.email,
            email: decoded.email,
            name: decoded.name,
            mobile: localStorage.getItem('userMobile') || '',
            role: "attendee" 
          });
          
          if (updateResult) {
            console.log('Successfully created/updated user as attendee');
            
            // Verify the update
            try {
              const updatedUser = await getUserByEmail(decoded.email);
              console.log('User data after update:', updatedUser);
            } catch (verifyError) {
              console.error('Error verifying user update:', verifyError);
            }
          } else {
            console.error('Failed to update user role');
          }
        } else {
          console.log('User already exists with role:', existingUser.role);
        }
        
        // Set pendingAction to getPhotos even for logged in users
        localStorage.setItem('pendingAction', 'getPhotos');
        
        // Navigate to attendee dashboard
        navigate('/attendee-dashboard');
      } catch (error) {
        console.error('Error handling user role:', error);
        // Still set pendingAction in case of error
        localStorage.setItem('pendingAction', 'getPhotos');
        navigate('/attendee-dashboard');
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowImage(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const features = [
    {
      icon: <Camera className="w-6 h-6 text-blue-600" />,
      title: "Smart Photo Recognition",
      description: "Advanced face recognition to find your photos in event galleries"
    },
    {
      icon: <Shield className="w-6 h-6 text-blue-600" />,
      title: "Privacy First",
      description: "Secure and private photo sharing with controlled access"
    },
    {
      icon: <Zap className="w-6 h-6 text-blue-600" />,
      title: "Instant Access",
      description: "Quick and easy access to your event memories"
    },
    {
      icon: <Share2 className="w-6 h-6 text-blue-600" />,
      title: "Easy Sharing",
      description: "Share event photos with attendees seamlessly"
    }
  ];

  const useCases = [
    {
      icon: <Users className="w-12 h-12 text-blue-600" />,
      title: "Corporate Events",
      description: "Perfect for conferences, team buildings, and company celebrations"
    },
    {
      icon: <Image className="w-12 h-12 text-blue-600" />,
      title: "Weddings",
      description: "Share precious moments with all wedding guests"
    },
    {
      icon: <Clock className="w-12 h-12 text-blue-600" />,
      title: "School Events",
      description: "Graduations, sports days, and school celebrations"
    }
  ];

  return (
    <div className="bg-white">
      <AnnouncementPopup />
      {/* Hero Section */}
      <div className="relative isolate overflow-hidden bg-gradient-to-b from-blue-50/30 to-blue-50/80 pt-28 sm:pt-28 md:pt-28 lg:pt-28">
        {/* Background Pattern */}
        <div className="absolute inset-0 -z-10 opacity-10">
          <svg
            className="h-full w-full"
            xmlns="http://www.w3.org/2000/svg"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
          >
            <defs>
              <pattern
                id="dotPattern"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1" fill="currentColor" className="text-blue-500" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dotPattern)" />
          </svg>
        </div>
        
        {/* Decorative Elements */}
        <div aria-hidden="true" className="absolute -top-24 right-0 transform translate-y-1/3 -z-10 hidden md:block">
          <svg width="404" height="384" fill="none" viewBox="0 0 404 384" className="text-blue-100">
            <defs>
              <pattern id="beee6589-9925-4183-90ae-81dc24243ede" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="4" height="4" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="404" height="384" fill="url(#beee6589-9925-4183-90ae-81dc24243ede)" />
          </svg>
        </div>
        <div aria-hidden="true" className="absolute -bottom-40 -left-20 transform translate-y-1/3 -z-10 hidden md:block">
          <svg width="404" height="384" fill="none" viewBox="0 0 404 384" className="text-blue-200/40">
            <defs>
              <pattern id="85c4ae27-a343-42da-b3e7-adb7b86a3665" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="4" height="4" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="404" height="384" fill="url(#85c4ae27-a343-42da-b3e7-adb7b86a3665)" />
          </svg>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-10 sm:pb-12 md:pb-16 lg:pb-20 lg:flex lg:items-center lg:gap-x-8 xl:gap-x-12 lg:px-8 lg:py-8">
          {/* Left Content */}
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl lg:flex-shrink-0 lg:pt-0">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div aria-hidden="true" className="relative mb-1 sm:mb-2 md:mb-3 flex items-center gap-x-2">
                <div className="h-1 w-8 sm:w-10 rounded bg-blue-500"></div>
                <p className="text-xs sm:text-sm font-medium tracking-wide text-blue-600 uppercase">
                  Face Recognition Photo Sharing
              </p>
            </div>
              <h1 className="mt-1 sm:mt-2 md:mt-3 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 leading-tight">
                Powerful <span className="text-blue-600">
                  photo sharing
                </span> platform for events
            </h1>
              <p className="mt-2 sm:mt-3 md:mt-4 text-sm sm:text-base md:text-lg leading-relaxed text-gray-600 max-w-lg">
                We offer an intelligent solution for all your event photography needs with advanced face recognition technology.
            </p>
              <div className="mt-4 sm:mt-5 md:mt-6 flex flex-col sm:flex-row items-center gap-y-3 sm:gap-y-0 sm:gap-x-4">
                <motion.button
                onClick={handleCreateEvent}
                  className="w-full sm:w-auto rounded-lg bg-blue-600 px-5 py-2.5 sm:py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
                  aria-label="Create a new event"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
              >
                Create New Event
                </motion.button>
                <motion.button
                onClick={handleGetPhotos}
                  className="w-full sm:w-auto rounded-lg bg-white px-5 py-2.5 sm:py-3 text-sm font-semibold text-blue-600 shadow-md ring-1 ring-inset ring-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
                  aria-label="Get your photos"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
              >
                Get Photos
                </motion.button>
            </div>
            </motion.div>

            {/* Stats Section */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-6 sm:mt-8 md:mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 max-w-md"
            >
              <div className="group bg-white/80 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-sm ring-1 ring-gray-200/70 hover:shadow-md hover:bg-white/90 transition-all duration-300">
                <div className="flex items-center gap-x-3">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-blue-100 group-hover:bg-blue-200 transition-colors duration-300">
                    <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                </div>
                <div>
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">99.3%</p>
                    <p className="text-xs sm:text-sm text-gray-600">Recognition Accuracy</p>
                  </div>
                </div>
              </div>
              <div className="group bg-white/80 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-sm ring-1 ring-gray-200/70 hover:shadow-md hover:bg-white/90 transition-all duration-300">
                <div className="flex items-center gap-x-3">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-blue-100 group-hover:bg-blue-200 transition-colors duration-300">
                    <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                </div>
                <div>
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">100%</p>
                    <p className="text-xs sm:text-sm text-gray-600">Privacy & Security</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right Content - Mobile Display */}
          {showImage && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="mx-auto lg:ml-8 xl:ml-12 mt-6 sm:mt-8 md:mt-10 lg:mt-0 relative w-[180px] sm:w-[210px] md:w-[240px] lg:w-[270px] xl:w-[300px] h-[360px] sm:h-[450px] md:h-[500px] lg:h-[540px]"
            >
              {/* Device Frame */}
              <div className="absolute inset-0 rounded-[2.5rem] border-[10px] sm:border-[12px] border-gray-900 bg-gray-900 shadow-xl overflow-hidden">
                {/* Notch */}
                <div className="absolute top-0 inset-x-0 h-5 sm:h-6 bg-gray-900 z-10 flex justify-center items-end pb-1">
                  <div className="w-16 sm:w-20 h-[3px] sm:h-[4px] bg-gray-800 rounded-full"></div>
                </div>
                
                {/* Screen Content */}
                <div className="h-full w-full pt-5 sm:pt-6 overflow-y-auto bg-white">
                  {/* App Header */}
                  <div className="px-3 sm:px-4 pb-2 sm:pb-3 flex justify-between items-center">
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-900">Photo Gallery</h3>
                      <p className="text-[10px] sm:text-xs text-gray-500">Your event photos</p>
                    </div>
                    <div className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-full bg-blue-100">
                      <Camera className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
                    </div>
              </div>
                  
                  {/* Photos Grid */}
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2 p-1.5 sm:p-2">
                {[
                  { src: 'https://i0.wp.com/josiahandsteph.com/wp-content/uploads/2021/06/An-Elegant-Pen-Ryn-Estate-Wedding-in-Bensalem-PA-Sam-Lexi-0079-scaled.jpg?w=1920', title: 'Wedding Celebration' },
                  { src: 'https://offloadmedia.feverup.com/secretmumbai.com/wp-content/uploads/2024/10/22180638/Birthday-ideas-Freepik-1024x683.jpg', title: 'Birthday Party' },
                  { src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_8eZYDeRpNHeeAdLukfZxHC5T9s9DVIphZQ&s', title: 'Corporate Event' },
                  { src: 'https://i0.wp.com/josiahandsteph.com/wp-content/uploads/2021/06/An-Elegant-Pen-Ryn-Estate-Wedding-in-Bensalem-PA-Sam-Lexi-0079-scaled.jpg?w=1920', title: 'Wedding Celebration' },
                  { src: 'https://offloadmedia.feverup.com/secretmumbai.com/wp-content/uploads/2024/10/22180638/Birthday-ideas-Freepik-1024x683.jpg', title: 'Birthday Party' },
                  { src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_8eZYDeRpNHeeAdLukfZxHC5T9s9DVIphZQ&s', title: 'Corporate Event' }
                ].map((image, index) => (
                  <motion.div
                    key={index}
                    whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                    className="relative aspect-square overflow-hidden rounded-lg shadow-md"
                  >
                    <img
                      src={image.src}
                      alt={image.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end p-1.5 sm:p-2">
                          <p className="text-[10px] sm:text-xs text-white font-medium truncate">{image.title}</p>
                    </div>
                  </motion.div>
                ))}
                  </div>
                </div>
              </div>
              
              {/* Device Reflection & Highlights */}
              <div className="absolute -bottom-4 sm:-bottom-6 left-4 right-4 h-4 sm:h-6 bg-black/10 blur-xl rounded-full"></div>
              <div className="absolute inset-0 rounded-[2.5rem] pointer-events-none bg-gradient-to-tr from-black/5 via-black/0 to-white/10"></div>
            </motion.div>
          )}
        </div>
      </div>

      
    </div>
  );
};

export default Hero;
