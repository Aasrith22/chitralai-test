import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Camera, Calendar, Image as ImageIcon, X, Search, Download, Share2, Facebook, Instagram, Twitter, Linkedin, MessageCircle, Mail, Link } from 'lucide-react';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { s3ClientPromise, rekognitionClientPromise, validateEnvVariables } from '../config/aws';
import { CompareFacesCommand } from '@aws-sdk/client-rekognition';
import { getEventById } from '../config/eventStorage';
import { storeAttendeeImageData } from '../config/attendeeStorage';
import { compareFaces } from '../services/faceRecognition';

interface Event {
  eventId: string;
  eventName: string;
  eventDate: string;
  thumbnailUrl: string;
  coverImage?: string;
}

interface MatchingImage {
  imageId: string;
  eventId: string;
  eventName: string;
  imageUrl: string;
  matchedDate: string;
}

interface Statistics {
  totalEvents: number;
  totalImages: number;
  firstEventDate: string | null;
  latestEventDate: string | null;
}

// Add interface for props
interface AttendeeDashboardProps {
  setShowSignInModal: (show: boolean) => void;
}

const AttendeeDashboard: React.FC<AttendeeDashboardProps> = ({ setShowSignInModal }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const matchedImagesRef = React.useRef<HTMLDivElement>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [attendedEvents, setAttendedEvents] = useState<Event[]>([]);
  const [matchingImages, setMatchingImages] = useState<MatchingImage[]>([]);
  const [filteredImages, setFilteredImages] = useState<MatchingImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<Statistics>({
    totalEvents: 0,
    totalImages: 0,
    firstEventDate: null,
    latestEventDate: null
  });
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>('all');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // New state variables for event code entry and selfie upload
  const [eventCode, setEventCode] = useState('');
  const [eventDetails, setEventDetails] = useState<{ id: string; name: string; date: string } | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventSortOption, setEventSortOption] = useState<'date' | 'name'>('date');
  
  // New state variables for camera functionality
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  
  // New state for enlarged image modal
  const [selectedImage, setSelectedImage] = useState<MatchingImage | null>(null);

  // New state for share menu
  const [shareMenu, setShareMenu] = useState<{
    isOpen: boolean;
    imageUrl: string;
    position: { top: number; left: number };
  }>({
    isOpen: false,
    imageUrl: '',
    position: { top: 0, left: 0 }
  });

  // Toggle header and footer visibility when image is clicked
  const toggleHeaderFooter = (visible: boolean) => {
    // Find header and footer elements in DOM
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    
    if (header) {
      if (visible) {
        header.classList.remove('hidden');
      } else {
        header.classList.add('hidden');
      }
    }
    
    if (footer) {
      if (visible) {
        footer.classList.remove('hidden');
      } else {
        footer.classList.add('hidden');
      }
    }
  };

  // Add a new useEffect to check authentication on page load
  useEffect(() => {
    // Check if user is logged in
    const userEmail = localStorage.getItem('userEmail');
    const searchParams = new URLSearchParams(location.search);
    const eventIdFromUrl = searchParams.get('eventId');
    
    // If user is not logged in and there's an event ID, show sign-in modal
    if (!userEmail) {
      if (eventIdFromUrl) {
        // Store information for redirect after login
        localStorage.setItem('pendingAction', 'getPhotos');
        localStorage.setItem('pendingRedirectUrl', window.location.href);
        // Set some visible state to show what event they're trying to access
        setEventCode(eventIdFromUrl);
        setProcessingStatus('Looking up event...');
        // Look up the event to show details
        getEventById(eventIdFromUrl).then(event => {
          if (event) {
            setEventDetails({
              id: event.id,
              name: event.name,
              date: event.date
            });
            setError('Please sign in to access your photos from this event.');
          } else {
            setError('Event not found. Please check the event code.');
          }
          setProcessingStatus(null);
        }).catch(err => {
          console.error('Error finding event:', err);
          setError('Error finding event. Please try again.');
          setProcessingStatus(null);
        });
      }
      // Show sign in modal
      setShowSignInModal(true);
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Add new useEffect to handle URL parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const eventIdFromUrl = searchParams.get('eventId');
    
    if (eventIdFromUrl) {
      setEventCode(eventIdFromUrl);
      // Create an async function to handle the event lookup
      const lookupEvent = async () => {
        try {
          setError(null);
          setEventDetails(null);
          setSuccessMessage(null);
          setProcessingStatus('Looking up event...');
          
          // Get user email if available
          const userEmail = localStorage.getItem('userEmail');
          
          // Try to get event by ID first
          let event = await getEventById(eventIdFromUrl);
          
          if (!event) {
            // Try with leading zeros if needed (for 6-digit codes)
            if (eventIdFromUrl.length < 6) {
              const paddedCode = eventIdFromUrl.padStart(6, '0');
              event = await getEventById(paddedCode);
            }
            
            // If it's exactly 6 digits, try without leading zeros
            if (eventIdFromUrl.length === 6 && eventIdFromUrl.startsWith('0')) {
              const unPaddedCode = eventIdFromUrl.replace(/^0+/, '');
              if (unPaddedCode) {
                event = await getEventById(unPaddedCode);
              }
            }
          }
          
          if (!event) {
            throw new Error(`Event with code "${eventIdFromUrl}" not found. Please check the code and try again.`);
          }
          
          // If user is not signed in, show event details and prompt to sign in
          if (!userEmail) {
            setEventDetails({
              id: event.id,
              name: event.name,
              date: event.date
            });
            setProcessingStatus(null);
            setError('Please sign in to access your photos from this event.');
            // Store complete URL for redirect after sign in
            localStorage.setItem('pendingAction', 'getPhotos');
            localStorage.setItem('pendingRedirectUrl', window.location.href);
            return;
          }
          
          // Check if user already has images for this event
          const { getAttendeeImagesByUserAndEvent } = await import('../config/attendeeStorage');
          const existingData = await getAttendeeImagesByUserAndEvent(userEmail, event.id);
          
          if (existingData) {
            // Handle existing data case
            handleExistingEventData(existingData, event);
          } else {
            // Show event details for new upload
            setEventDetails({
              id: event.id,
              name: event.name,
              date: event.date
            });
          }
        } catch (error: any) {
          console.error('Error finding event:', error);
          setError(error.message || 'Failed to find event. Please try again.');
        } finally {
          setProcessingStatus(null);
        }
      };
      
      lookupEvent();
    }
  }, [location.search]); // We don't need handleEventCodeSubmit in dependencies

  // Add the handleExistingEventData helper function
  const handleExistingEventData = (existingData: any, event: any) => {
    setProcessingStatus('Found your previous photos for this event!');
    
    // Add this event to the list if not already there
    const eventExists = attendedEvents.some(e => e.eventId === event.id);
    if (!eventExists) {
      const newEvent: Event = {
        eventId: event.id,
        eventName: existingData.eventName || event.name,
        eventDate: event.date,
        // Use coverImage from attendee data if available, then event's coverImage, then fall back to first matched image
        thumbnailUrl: existingData.coverImage || event.coverImage || existingData.matchedImages[0] || '',
        coverImage: existingData.coverImage || event.coverImage || ''
      };
      setAttendedEvents(prev => [newEvent, ...prev]);
    }
    
    // Add the matched images to the list if not already there
    const newImages: MatchingImage[] = existingData.matchedImages.map((url: string) => ({
      imageId: url.split('/').pop() || '',
      eventId: event.id,
      eventName: existingData.eventName || event.name,
      imageUrl: url,
      matchedDate: existingData.uploadedAt
    }));
    
    // Check if these images are already in the state
    const existingImageUrls = new Set(matchingImages.map(img => img.imageUrl));
    const uniqueNewImages = newImages.filter(img => !existingImageUrls.has(img.imageUrl));
    
    if (uniqueNewImages.length > 0) {
      setMatchingImages(prev => [...uniqueNewImages, ...prev]);
    }
    
    // Set filter to show only this event's images
    setSelectedEventFilter(event.id);
    
    // Set success message
    setSuccessMessage(`Found ${existingData.matchedImages.length} photos from ${event.name}!`);
  };

  // Scroll to matched images section when success message is set
  useEffect(() => {
    if (successMessage && matchedImagesRef.current) {
      // Only scroll for photo-related success messages
      if (successMessage.includes('photos') || successMessage.includes('Found')) {
        matchedImagesRef.current.scrollIntoView({ behavior: 'smooth' });
        
        // Clear photo-related success messages after 5 seconds
        const timer = setTimeout(() => {
          setSuccessMessage(null);
        }, 5000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [successMessage]);

  // Clear selfie update success message after 2 seconds
  useEffect(() => {
    if (successMessage === 'Your selfie has been updated successfully!') {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userEmail = localStorage.getItem('userEmail');
        setLoading(true);

        // Dynamically import required modules
        const { getAllAttendeeImagesByUser, getAttendeeStatistics } = await import('../config/attendeeStorage');
        const { getEventById } = await import('../config/eventStorage');
            
        // If user is signed in, fetch their data
        if (userEmail) {
          // Fetch attendee image data from the database
          const attendeeImageData = await getAllAttendeeImagesByUser(userEmail);
          
          // Get statistics
          const userStats = await getAttendeeStatistics(userEmail);
          setStatistics(userStats);
          
          if (attendeeImageData.length > 0) {
            // Extract events from the attendee image data
            const eventsList: Event[] = [];
            const imagesList: MatchingImage[] = [];
            
            // Process each attendee-event entry sequentially to get event details
            for (const data of attendeeImageData) {
              // Get event details from the events database
              const eventDetails = await getEventById(data.eventId);
              
              // Skip the 'default' event entries
              if (data.eventId === 'default') continue;
              
              // Default event name and date if details not found
              const eventName = data.eventName || eventDetails?.name || `Event ${data.eventId}`;
              const eventDate = eventDetails?.date || data.uploadedAt;
              
              // Add to events list if not already added
              if (!eventsList.some(e => e.eventId === data.eventId)) {
                eventsList.push({
                  eventId: data.eventId,
                  eventName: eventName,
                  eventDate: eventDate,
                  // Use coverImage from attendee data if available, then event's coverImage, then fall back to first matched image
                  thumbnailUrl: data.coverImage || eventDetails?.coverImage || data.matchedImages[0] || '',
                  coverImage: data.coverImage || eventDetails?.coverImage || ''
                });
              }
              
              // Add all matched images to the images list
              data.matchedImages.forEach(imageUrl => {
                imagesList.push({
                  imageId: imageUrl.split('/').pop() || '',
                  eventId: data.eventId,
                  eventName: eventName,
                  imageUrl: imageUrl,
                  matchedDate: data.uploadedAt
                });
              });
            }
            
            // Update state - filter out any default entries
            setAttendedEvents(eventsList.filter(event => event.eventId !== 'default'));
            setMatchingImages(imagesList.filter(image => image.eventId !== 'default'));
            setFilteredImages(imagesList.filter(image => image.eventId !== 'default')); // Initially show all images
            
            // Set selfie URL to the most recent selfie
            const mostRecent = attendeeImageData.reduce((prev, current) => 
              new Date(current.uploadedAt) > new Date(prev.uploadedAt) ? current : prev
            );
            setSelfieUrl(mostRecent.selfieURL);
          } else {
            // No attendee image data found
          }
        } else {
          // User is not signed in, show empty state with event code entry
          setAttendedEvents([]);
          setMatchingImages([]);
          setFilteredImages([]);
          setStatistics({
            totalEvents: 0,
            totalImages: 0,
            firstEventDate: null,
            latestEventDate: null
          });
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching user data:', error);
        setLoading(false);
      }
    };

    fetchUserData();
  }, [navigate]);

  // Filter images by event
  useEffect(() => {
    if (selectedEventFilter === 'all') {
      setFilteredImages(matchingImages);
    } else {
      const filtered = matchingImages.filter(image => image.eventId === selectedEventFilter);
      setFilteredImages(filtered);
    }
  }, [selectedEventFilter, matchingImages]);

  // Handle event filter change
  const handleEventFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedEventFilter(e.target.value);
  };

  // Handle event code form submission
  const handleEventCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEventDetails(null);
    setSuccessMessage(null);
    
    if (!eventCode.trim()) {
      setError('Please enter an event code');
      return;
    }
    
    try {
      setProcessingStatus('Looking up event...');
      console.log('Looking up event with code:', eventCode);
      
      // Get user email if available
      const userEmail = localStorage.getItem('userEmail');
      
      // Try to get event by ID first
      let event = await getEventById(eventCode);
      console.log('Event lookup result:', event);
      
      // If not found, try some alternative approaches
      if (!event) {
        console.log('Event not found with exact ID, trying alternative methods...');
        
        // Try with leading zeros if needed (for 6-digit codes)
        if (eventCode.length < 6) {
          const paddedCode = eventCode.padStart(6, '0');
          console.log('Trying with padded code:', paddedCode);
          event = await getEventById(paddedCode);
        }
        
        // If it's exactly 6 digits, try without leading zeros
        if (eventCode.length === 6 && eventCode.startsWith('0')) {
          const unPaddedCode = eventCode.replace(/^0+/, '');
          if (unPaddedCode) {
            console.log('Trying without leading zeros:', unPaddedCode);
            event = await getEventById(unPaddedCode);
          }
        }
      }
      
      if (!event) {
        throw new Error(`Event with code "${eventCode}" not found. Please check the code and try again. The code should be the unique identifier provided by the event organizer.`);
      }
      
      console.log('Event found:', event);
      
      // If user is not signed in, show event details and prompt to sign in
      if (!userEmail) {
        setEventDetails({
          id: event.id,
          name: event.name,
          date: event.date
        });
        setProcessingStatus(null);
        setError('Please sign in to access your photos from this event.');
        // Store complete URL for redirect after sign in
        localStorage.setItem('pendingAction', 'getPhotos');
        localStorage.setItem('pendingRedirectUrl', window.location.href);
        // Show sign in modal
        setShowSignInModal(true);
        return;
      }
      
      // Check if user already has images for this event
      const { getAttendeeImagesByUserAndEvent } = await import('../config/attendeeStorage');
      const existingData = await getAttendeeImagesByUserAndEvent(userEmail, event.id);
      
      if (existingData) {
        console.log('User already has images for this event:', existingData);
        setProcessingStatus('Found your previous photos for this event!');
        
        // Add this event to the list if not already there
        const eventExists = attendedEvents.some(e => e.eventId === event.id);
        if (!eventExists) {
          const newEvent: Event = {
            eventId: event.id,
            eventName: existingData.eventName || event.name,
            eventDate: event.date,
            // Use coverImage from attendee data if available, then event's coverImage, then fall back to first matched image
            thumbnailUrl: existingData.coverImage || event.coverImage || existingData.matchedImages[0] || '',
            coverImage: existingData.coverImage || event.coverImage || ''
          };
          setAttendedEvents(prev => [newEvent, ...prev]);
        }
        
        // Add the matched images to the list if not already there
        const newImages: MatchingImage[] = existingData.matchedImages.map((url: string) => ({
          imageId: url.split('/').pop() || '',
          eventId: event.id,
          eventName: existingData.eventName || event.name,
          imageUrl: url,
          matchedDate: existingData.uploadedAt
        }));
        
        // Check if these images are already in the state
        const existingImageUrls = new Set(matchingImages.map(img => img.imageUrl));
        const uniqueNewImages = newImages.filter(img => !existingImageUrls.has(img.imageUrl));
        
        if (uniqueNewImages.length > 0) {
          setMatchingImages(prev => [...uniqueNewImages, ...prev]);
        }
        
        // Set filter to show only this event's images
        setSelectedEventFilter(event.id);
        
        // Clear event code
        setEventCode('');
        
        // Set success message
        setSuccessMessage(`Found ${existingData.matchedImages.length} photos from ${event.name}!`);
        
        // Update statistics
        await updateStatistics();
        
        // Hide processing status after a delay
        setTimeout(() => setProcessingStatus(null), 3000);
      } else {
        // Check if user has an existing selfie
        if (selfieUrl) {
          // User has an existing selfie, use it for comparison automatically
          setProcessingStatus('Using your existing selfie to find photos...');
          
          // Start the face comparison process using the existing selfie
          await performFaceComparisonWithExistingSelfie(userEmail, selfieUrl, event);
          
          // Clear event code
          setEventCode('');
        } else {
          // No existing data or selfie, show the event details and selfie upload form
          setEventDetails({
            id: event.id,
            name: event.name,
            date: event.date
          });
          setProcessingStatus(null);
        }
      }
    } catch (error: any) {
      console.error('Error finding event:', error);
      setError(error.message || 'Failed to find event. Please try again.');
      setProcessingStatus(null);
    }
  };

  // Add a new function to update statistics
  const updateStatistics = async () => {
    try {
      const userEmail = localStorage.getItem('userEmail');
      if (userEmail) {
        const { getAttendeeStatistics } = await import('../config/attendeeStorage');
        const userStats = await getAttendeeStatistics(userEmail);
        setStatistics(userStats);
      }
    } catch (error) {
      console.error('Error updating statistics:', error);
    }
  };

  // New function to perform face comparison with existing selfie
  const performFaceComparisonWithExistingSelfie = async (userEmail: string, existingSelfieUrl: string, event: any) => {
    try {
      setIsUploading(true);
      setProcessingStatus('Comparing with event images...');
      
      // Extract the S3 key from the selfie URL
      const { bucketName } = await validateEnvVariables();
      let selfiePath = '';
      
      if (existingSelfieUrl.startsWith(`https://${bucketName}.s3.amazonaws.com/`)) {
        selfiePath = existingSelfieUrl.substring(`https://${bucketName}.s3.amazonaws.com/`.length);
      } else {
        throw new Error('Could not determine S3 path for the existing selfie');
      }
      
      // Get the list of images in the event
      const imagesPath = `events/shared/${event.id}/images/`;
      let allImageKeys: string[] = [];
      let continuationToken: string | undefined;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: imagesPath,
          MaxKeys: 1000,
          ContinuationToken: continuationToken
        });
        
        const listResponse = await (await s3ClientPromise).send(listCommand);
        
        if (listResponse.Contents) {
          const imageKeys = listResponse.Contents
            .filter(item => item.Key && /\.(jpg|jpeg|png)$/i.test(item.Key!))
            .map(item => item.Key!);
          allImageKeys.push(...imageKeys);
        }
        
        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);

      if (allImageKeys.length === 0) {
        throw new Error('No valid images found in this event.');
      }
      
      // Compare faces in larger batches with parallel processing
      const batchSize = 70; // Reduced batch size for more frequent updates
      const results: { url: string; similarity: number }[] = [];
      let processedCount = 0;
      let matchedCount = 0;
      
      for (let i = 0; i < allImageKeys.length; i += batchSize) {
        const batch = allImageKeys.slice(i, i + batchSize);
        processedCount += batch.length;
        setProcessingStatus(`Processing images... ${processedCount}/${allImageKeys.length} (${matchedCount} matches found)`);
        
        const batchPromises = batch.map(async (imageKey) => {
          try {
            const compareCommand = new CompareFacesCommand({
              SourceImage: {
                S3Object: { Bucket: bucketName, Name: selfiePath },
              },
              TargetImage: {
                S3Object: { Bucket: bucketName, Name: imageKey },
              },
              SimilarityThreshold: 80,
              QualityFilter: "HIGH"
            });
            
            // Add timeout to prevent hanging
            const compareResponse = await Promise.race([
              (await rekognitionClientPromise).send(compareCommand),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Face comparison timed out')), 30000)
              )
            ]) as { FaceMatches?: Array<{ Similarity?: number }> };
            
            if (compareResponse.FaceMatches && compareResponse.FaceMatches.length > 0) {
              const bestMatch = compareResponse.FaceMatches.reduce(
                (prev: { Similarity?: number }, current: { Similarity?: number }) => 
                  (prev.Similarity || 0) > (current.Similarity || 0) ? prev : current
              );
              
              const result = { 
                url: `https://${bucketName}.s3.amazonaws.com/${imageKey}`, 
                similarity: bestMatch.Similarity || 0 
              };
              
              // Update UI immediately when a match is found with higher similarity threshold
              if (result.similarity >= 70) {
                const newMatchingImage: MatchingImage = {
                  imageId: imageKey.split('/').pop() || '',
                  eventId: event.id,
                  eventName: event.name,
                  imageUrl: result.url,
                  matchedDate: new Date().toISOString()
                };
                
                matchedCount++;
                // Update UI with the new match immediately
                setMatchingImages(prev => {
                  // Check if this image is already in the list
                  if (!prev.some(img => img.imageUrl === newMatchingImage.imageUrl)) {
                    return [newMatchingImage, ...prev];
                  }
                  return prev;
                });
                
                // Update processing status with new match count
                setProcessingStatus(`Processing images... ${processedCount}/${allImageKeys.length} (${matchedCount} matches found)`);
              }
              
              return result;
            }
            return null;
          } catch (error) {
            console.error(`Error processing image ${imageKey}:`, error);
            return null;
          }
        });
        
        // Use Promise.allSettled to continue even if some comparisons fail
        const batchResults = await Promise.allSettled(batchPromises);
        const successfulResults = batchResults
          .filter((result): result is PromiseFulfilledResult<{ url: string; similarity: number }> => 
            result.status === 'fulfilled' && 
            result.value !== null && 
            typeof result.value === 'object' &&
            'url' in result.value &&
            'similarity' in result.value &&
            result.value.similarity >= 70
          )
          .map(result => result.value);
          
        results.push(...successfulResults);
      }
      
      // Sort matches by similarity
      const sortedMatches = results.sort((a, b) => b.similarity - a.similarity);
      
      if (sortedMatches.length === 0) {
        throw new Error('No matching faces found in the event images.');
      }
      
      // Add this event to attended events if not already there
      const eventExists = attendedEvents.some(e => e.eventId === event.id);
      
      if (!eventExists) {
        const newEvent: Event = {
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          thumbnailUrl: event.coverImage || sortedMatches[0].url,
          coverImage: event.coverImage || ''
        };
        
        setAttendedEvents(prev => [newEvent, ...prev]);
      }
      
      // Store the attendee image data in the database
      const matchedImageUrls = sortedMatches.map(match => match.url);
      const currentTimestamp = new Date().toISOString();
      
      const attendeeData = {
        userId: userEmail,
        eventId: event.id,
        eventName: event.name,
        coverImage: event.coverImage,
        selfieURL: existingSelfieUrl,
        matchedImages: matchedImageUrls,
        uploadedAt: currentTimestamp,
        lastUpdated: currentTimestamp
      };
      
      // Store in the database
      const storageResult = await storeAttendeeImageData(attendeeData);
      
      if (!storageResult) {
        console.error('Failed to store attendee image data in the database');
      }
      
      // Update statistics
      await updateStatistics();
      
      // Set success message and filter to show only this event's images
      setSuccessMessage(`Found ${sortedMatches.length} new photos from ${event.name}!`);
      setSelectedEventFilter(event.id);
      
      // Clear event code and details since we're done processing
      setEventCode('');
      setEventDetails(null);
      
      setProcessingStatus(null);
      setIsUploading(false);
      
    } catch (error: any) {
      console.error('Error in comparison with existing selfie:', error);
      setError(error.message || 'Error processing your request. Please try again.');
      setIsUploading(false);
      setProcessingStatus(null);
    }
  };

  // New function to start the camera
  const startCamera = async () => {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      setStream(videoStream);
      setIsCameraActive(true);
      
      // Wait for the next render cycle to ensure video element exists
      setTimeout(() => {
        const videoElement = document.querySelector('video');
        if (videoElement) {
          videoElement.srcObject = videoStream;
          videoElement.play().catch(console.error);
          setVideoRef(videoElement);
        }
      }, 100);
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      setError('Could not access camera. Please make sure you have granted camera permissions.');
      setIsCameraActive(false);
      setShowCameraModal(false);
    }
  };

  // New function to stop the camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      setStream(null);
    }
    if (videoRef && videoRef.srcObject) {
      const tracks = (videoRef.srcObject as MediaStream).getTracks();
      tracks.forEach(track => {
        track.stop();
        track.enabled = false;
      });
      videoRef.srcObject = null;
    }
    setVideoRef(null);
    setIsCameraActive(false);
  };

  // New function to capture image from camera
  const captureImage = async () => {
    if (!videoRef || !stream) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.videoWidth;
      canvas.height = videoRef.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      ctx.drawImage(videoRef, 0, 0);
      
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/jpeg', 0.8);
      });
      
      const cameraFile = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
      
      // Process the captured image
      setSelfie(cameraFile);
      setSelfiePreview(URL.createObjectURL(cameraFile));
      
      // Stop camera and cleanup
      stopCamera();
      
      // Upload the captured selfie
      await uploadSelfie(cameraFile);
      
      // Update statistics after selfie upload
      await updateStatistics();
      
      // Close the modal
      setShowCameraModal(false);
      
    } catch (error: any) {
      console.error('Error capturing image:', error);
      setError(error.message || 'Failed to capture image. Please try again.');
      // Ensure camera is stopped even if capture fails
      stopCamera();
    }
  };

  // New function to upload the selfie
  const uploadSelfie = async (file: File) => {
    setError(null);
    setSuccessMessage(null);
    setProcessingStatus('Updating your selfie...');
    const { bucketName } = await validateEnvVariables();

    try {
      const userEmail = localStorage.getItem('userEmail') || '';
      
      // Generate a unique filename
      const fileName = `selfie-${Date.now()}-${file.name}`;
      const selfiePath = `users/${userEmail}/selfies/${fileName}`;
      
      // Convert File to arrayBuffer and then to Uint8Array
      const buffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      // Upload selfie to S3
      const upload = new Upload({
        client: await s3ClientPromise,
        params: {
          Bucket: bucketName,
          Key: selfiePath,
          Body: uint8Array,
          ContentType: file.type,
          ACL: 'public-read'
        },
        partSize: 1024 * 1024 * 5
      });
      
      await upload.done();
      
      // Get the public URL of the uploaded selfie
      const selfieUrl = `https://${bucketName}.s3.amazonaws.com/${selfiePath}`;
      
      // Import the necessary functions
      const { updateUserSelfieURL, getAllAttendeeImagesByUser } = await import('../config/attendeeStorage');
      
      // Check if the user has any events
      const userEvents = await getAllAttendeeImagesByUser(userEmail);
      
      // If the user has events, update the selfie URL for all of them
      if (userEvents.length > 0) {
        const updateResult = await updateUserSelfieURL(userEmail, selfieUrl);
        
        if (!updateResult) {
          console.warn('Failed to update selfie for existing events');
        }
      }
      
      // Update the selfie URL in state
      setSelfieUrl(selfieUrl);
      setSelfie(file);
      
      // Update statistics after selfie update
      await updateStatistics();
      
      // Show success message
      setProcessingStatus(null);
      setSuccessMessage('Your selfie has been updated successfully!');
      
      // If event code is present, automatically trigger handleEventCodeSubmit
      if (eventCode && eventDetails) {
        // Start the face comparison process
        setProcessingStatus('Finding your photos...');
        try {
          await performFaceComparisonWithExistingSelfie(userEmail, selfieUrl, eventDetails);
        } catch (error: any) {
          console.error('Error in face comparison:', error);
          setError(error.message || 'Error finding your photos. Please try again.');
        }
      }
      
      // Scroll to top to show the updated selfie
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
    } catch (error: any) {
      console.error('Error updating selfie:', error);
      setError(error.message || 'Error updating your selfie. Please try again.');
      setProcessingStatus(null);
    }
  };

  // Update user's selfie using camera
  const handleUpdateSelfie = () => {
    // Clear any previous errors
    setError(null);
    setSuccessMessage(null);
    
    // Show camera modal and start the camera
    setShowCameraModal(true);
    startCamera();
  };

  // Clean up camera when component unmounts
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Add cleanup when component is hidden or user navigates away
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopCamera();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', stopCamera);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', stopCamera);
    };
  }, []);

  // Modify the handleSelfieChange to use handleUpdateSelfie instead
 

  // Clear selfie selection
  const clearSelfie = () => {
    setSelfie(null);
    if (selfiePreview) {
      URL.revokeObjectURL(selfiePreview);
    }
    setSelfiePreview(null);
  };

  // Upload selfie and compare faces
  const handleUploadAndCompare = async () => {
    // Check for user authentication first
    const userEmail = localStorage.getItem('userEmail');
    const { bucketName } = await validateEnvVariables();
    if (!userEmail) {
      setError('Please sign in to access your photos from this event.');
      // Store pendingAction for after sign in
      localStorage.setItem('pendingAction', 'getPhotos');
      // Store complete URL for redirect after sign in
      localStorage.setItem('pendingRedirectUrl', window.location.href);
      // Show sign in modal
      setShowSignInModal(true);
      return;
    }

    if (!selfie || !eventDetails) {
      setError('Please select a selfie and enter a valid event code');
      return;
    }
    
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);
    setProcessingStatus('Uploading selfie...');
    
    try {
      // Fetch complete event details from database
      const completeEventDetails = await getEventById(eventDetails.id);
      
      if (!completeEventDetails) {
        throw new Error('Could not retrieve complete event details from database.');
      }
      
      // Generate a unique filename
      const fileName = `selfie-${Date.now()}-${selfie.name}`;
      const selfiePath = `events/shared/${eventDetails.id}/selfies/${fileName}`;
      
      // Convert File to arrayBuffer and then to Uint8Array
      const buffer = await selfie.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      // Upload selfie to S3
      const upload = new Upload({
        client: await s3ClientPromise,
        params: {
          Bucket: bucketName,
          Key: selfiePath,
          Body: uint8Array,
          ContentType: selfie.type,
          ACL: 'public-read'
        },
        partSize: 1024 * 1024 * 5
      });
      
      await upload.done();
      
      // After successful upload, start face comparison
      setProcessingStatus('Comparing with event images...');
      
      // Get the list of images in the event
      const imagesPath = `events/shared/${eventDetails.id}/images/`;
      let allImageKeys: string[] = [];
      let continuationToken: string | undefined;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: imagesPath,
          MaxKeys: 1000,
          ContinuationToken: continuationToken
        });
        
        const listResponse = await (await s3ClientPromise).send(listCommand);
        
        if (listResponse.Contents) {
          const imageKeys = listResponse.Contents
            .filter(item => item.Key && /\.(jpg|jpeg|png)$/i.test(item.Key!))
            .map(item => item.Key!);
          allImageKeys.push(...imageKeys);
        }
        
        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);

      if (allImageKeys.length === 0) {
        throw new Error('No images found in this event.');
      }
      
      // Get the uploaded selfie URL
      const selfieUrl = `https://${bucketName}.s3.amazonaws.com/${selfiePath}`;
      
      // Compare faces with each image
      const matchingImages: MatchingImage[] = [];
      for (const imageKey of allImageKeys) {
        const imageUrl = `https://${bucketName}.s3.amazonaws.com/${imageKey}`;
        
        try {
          const result = await compareFaces(selfieUrl, imageUrl);
          if (result) {
            matchingImages.push({
              imageId: imageKey.split('/').pop() || '',
              eventId: eventDetails.id,
              eventName: eventDetails.name,
              imageUrl,
              matchedDate: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error('Error comparing faces:', error);
          continue;
        }
      }
      
      if (matchingImages.length > 0) {
        // Store the matching images for the user
        const { storeAttendeeImageData } = await import('../config/attendeeStorage');
        await storeAttendeeImageData({
          userId: userEmail,
          eventId: eventDetails.id,
          eventName: eventDetails.name,
          coverImage: completeEventDetails.coverImage,
          selfieURL: selfieUrl,
          matchedImages: matchingImages.map(img => img.imageUrl),
          uploadedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        });
        
        // Update statistics
        await updateStatistics();
        
        // Update the UI
        setMatchingImages(matchingImages);
        setFilteredImages(matchingImages);
        setSuccessMessage(`Found ${matchingImages.length} matching photos!`);
      } else {
        setError('No matching photos found. Please try again with a different selfie.');
      }
    } catch (error) {
      console.error('Error in upload and compare:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while processing your request.');
    } finally {
      setIsUploading(false);
      setProcessingStatus(null);
    }
  };

  // Handle event click to view associated images
  const handleEventClick = (eventId: string) => {
    // Skip navigation for default event
    if (eventId === 'default') return;
    
    // Navigate to the event photos page
    navigate(`/event-photos/${eventId}`);
  };

  const handleDownload = async (url: string) => {
    try {
// Get user email and use it for download tracking
const userEmail = localStorage.getItem('userEmail') || '';
console.log(`User ${userEmail} downloading image`);
      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache',
        },
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      // Get the content type
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // Get the image as a blob
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Extract filename from URL
      const filename = url.split('/').pop() || 'photo.jpg';
      
      // Create a temporary anchor element
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.type = contentType;
      link.target = '_blank';
      
      // Required for Firefox
      document.body.appendChild(link);
      
      // Trigger the download
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (error) {
      console.error('Error downloading image:', error);
      // If download fails, open the image in a new tab
      window.open(url, '_blank');
    }
  };

  const handleDownloadAll = async () => {
    try {
      // Show a message that downloads are starting
      alert('Starting downloads. Please allow multiple downloads in your browser settings.');
      
      // Download each image with a small delay to prevent browser blocking
      for (const image of filteredImages) {
        await handleDownload(image.imageUrl);
        // Add a small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Error downloading all images:', error);
      alert('Some downloads may have failed. Please try downloading individual photos.');
    }
  };

  // Add styles for animation
  const fadeInOutStyles = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(-20px); }
      15% { opacity: 1; transform: translateY(0); }
      85% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-20px); }
    }
    .animate-fade-in-out {
      animation: fadeInOut 2s ease-in-out forwards;
    }
  `;

  // New function to handle sharing image
  const handleShare = async (platform: string, imageUrl: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    try {
      // Fetch the image and convert to blob
      const response = await fetch(imageUrl, {
        headers: {
          'Cache-Control': 'no-cache',
        },
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const imageFile = new File([blob], 'photo.jpg', { type: blob.type });

      // If Web Share API is supported and platform is not specified (direct share button click)
      if (typeof navigator.share === 'function' && !platform) {
        try {
          await navigator.share({
            title: 'Check out this photo!',
            text: 'Photo from Chitralai',
            files: [imageFile]
          });
          setShareMenu(prev => ({ ...prev, isOpen: false }));
          return;
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            console.error('Error sharing file:', err);
          }
        }
      }

      // Fallback to custom share menu for specific platforms
      const shareUrl = encodeURIComponent(imageUrl);
      const shareText = encodeURIComponent('Check out this photo!');
      
      let shareLink = '';
      switch (platform) {
        case 'facebook':
          shareLink = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
          break;
        case 'twitter':
          shareLink = `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`;
          break;
        case 'instagram':
          shareLink = `instagram://library?AssetPath=${shareUrl}`;
          break;
        case 'linkedin':
          shareLink = `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`;
          break;
        case 'whatsapp':
          shareLink = `https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}`;
          break;
        case 'email':
          shareLink = `mailto:?subject=${shareText}&body=${shareUrl}`;
          break;
        case 'copy':
          try {
            await navigator.clipboard.writeText(imageUrl);
            alert('Link copied to clipboard!');
            setShareMenu(prev => ({ ...prev, isOpen: false }));
            return;
          } catch (err) {
            console.error('Failed to copy link:', err);
            alert('Failed to copy link');
          }
          break;
      }
      
      if (shareLink) {
        window.open(shareLink, '_blank', 'noopener,noreferrer');
        setShareMenu(prev => ({ ...prev, isOpen: false }));
      }
    } catch (error) {
      console.error('Error sharing image:', error);
      alert('Failed to share image. Please try again.');
    }
  };

  // Close share menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareMenu.isOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('.share-menu')) {
          setShareMenu(prev => ({ ...prev, isOpen: false }));
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [shareMenu.isOpen]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-6 px-4 sm:px-6 lg:px-8">
      <style>{fadeInOutStyles}</style>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Your Event Memories</h1>
          <p className="mt-2 text-black-600">Find and view your photos from events</p>
        </div>

        {/* Top Row containing Event Form, Stats and Selfie */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
          {/* Event Code Entry Section */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 h-full">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">Enter Event Code</h2>
            <p className="text-sm text-gray-600 mb-3 sm:mb-4">
              Find your photos from events
            </p>
            
            {error && (
              <div className="bg-red-50 text-red-600 p-2 rounded-lg mb-3 text-sm">
                {error}
              </div>
            )}
            
            {processingStatus && (
              <div className="bg-blue-50 text-blue-600 p-2 rounded-lg mb-3 text-sm flex items-center">
                <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-600 mr-2"></div>
                {processingStatus}
              </div>
            )}
            
            <form onSubmit={handleEventCodeSubmit}>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={eventCode}
                  onChange={(e) => setEventCode(e.target.value)}
                  placeholder="Event code"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                  required
                />
                <button
                  type="submit"
                  className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center text-sm sm:text-base whitespace-nowrap"
                  disabled={isUploading}
                >
                  <Search className="w-4 h-4 mr-1" />
                  Find
                </button>
              </div>
            </form>
            
            {!selfieUrl && eventDetails && (
              <div className="border border-blue-200 bg-blue-50 p-3 rounded-lg mt-4">
                <h3 className="font-semibold text-blue-800 text-sm">{eventDetails.name}</h3>
                <p className="text-blue-600 text-xs">
                  {new Date(eventDetails.date).toLocaleDateString()}
                </p>
                
                <div className="mt-3">
                  <p className="text-gray-700 text-sm mb-2">
                    Upload a selfie to find your photos
                  </p>
                  {selfiePreview ? (
                    <div className="relative w-20 h-20 mb-2">
                      <img
                        src={selfiePreview}
                        alt="Selfie preview"
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        onClick={clearSelfie}
                        className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full p-1 hover:bg-blue-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleUpdateSelfie}
                      className="cursor-pointer bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors inline-block text-sm"
                    >
                      <Camera className="w-3 h-3 inline-block mr-1" />
                      Select Selfie
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats Section */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 h-full">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">Your Photo Stats</h2>
            <div className="space-y-3 sm:space-y-6">
              <div className="bg-blue-50 rounded-lg p-3 sm:p-4 flex justify-between items-center">
                <span className="text-gray-700">Events</span>
                <span className="text-lg sm:text-xl font-bold text-blue-600">{statistics.totalEvents}</span>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 sm:p-4 flex justify-between items-center">
                <span className="text-gray-700">Photos</span>
                <span className="text-lg sm:text-xl font-bold text-blue-600">{statistics.totalImages}</span>
              </div>
            </div>
          </div>

          {/* Selfie Section */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 h-full flex flex-col sm:col-span-2 lg:col-span-1">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">Your Selfie</h2>
            <div className="flex flex-col items-center flex-grow justify-center">
              <div className="h-24 w-24 rounded-full overflow-hidden bg-gray-100 relative mb-3">
                {selfieUrl ? (
                  <img src={selfieUrl} alt="Your selfie" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-full w-full text-gray-400 p-6" />
                )}
                {processingStatus && processingStatus.includes('Updating your selfie') && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 text-center mb-3 sm:mb-5">Used for photo matching across events</p>
              <button
                onClick={handleUpdateSelfie}
                disabled={!!processingStatus && processingStatus.includes('Updating your selfie')}
                className={`w-full sm:max-w-xs px-3 sm:px-4 py-2 rounded-lg ${
                  processingStatus && processingStatus.includes('Updating your selfie')
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                } transition-colors flex items-center justify-center mt-auto`}
              >
                {processingStatus && processingStatus.includes('Updating your selfie') ? (
                  <>
                    <div className="animate-spin rounded-full h-3 sm:h-4 w-3 sm:w-4 border-t-2 border-b-2 border-white mr-1 sm:mr-2"></div>
                    Updating...
                  </>
                ) : (
                  <>
                    <Camera className="w-3 sm:w-4 h-3 sm:h-4 mr-1 sm:mr-2" />
                    Update Selfie
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Attended Events Section */}
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 mb-8">
  <div className="flex justify-between items-center mb-4">
    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Your Event Albums</h2>
    <select
      value={eventSortOption}
      onChange={(e) => setEventSortOption(e.target.value as 'date' | 'name')}
      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="date">Latest First</option>
      <option value="name">Name A-Z</option>
    </select>
  </div>

  {attendedEvents.length === 0 ? (
    <div className="bg-gray-50 rounded-lg p-4 sm:p-6 text-center">
      <Calendar className="h-10 sm:h-12 w-10 sm:w-12 text-gray-400 mx-auto mb-2" />
      <p className="text-gray-600">You haven't attended any events yet.</p>
      <p className="text-gray-500 text-sm mt-2">Enter an event code above to find your photos from an event.</p>
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {attendedEvents
        .filter(event => event.eventId !== 'default')
        .sort((a, b) => {
          if (eventSortOption === 'date') {
            return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
          } else {
            return a.eventName.localeCompare(b.eventName);
          }
        })
        .map((event) => (
          // ... existing event card code ...
          <div
            key={event.eventId}
            className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow border border-gray-200 cursor-pointer"
            onClick={() => handleEventClick(event.eventId)}
          >
            <div className="aspect-square relative">
              <img
                src={event.thumbnailUrl || event.coverImage}
                alt={`${event.eventName} thumbnail`}
                className="object-cover w-full h-full"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                <h3 className="text-white font-semibold truncate">{event.eventName}</h3>
                <p className="text-white/80 text-sm">
                  {new Date(event.eventDate).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        ))}
    </div>
  )}
</div>

        {/* Matching Images Section */}
        <div ref={matchedImagesRef} className="bg-white rounded-lg shadow-sm p-4 sm:p-6 mb-8">
          <div className="mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              {selectedEventFilter !== 'all' 
                ? `Photos from ${attendedEvents.find(e => e.eventId === selectedEventFilter)?.eventName || 'Event'}`
                : 'All Your Photos'
              }
            </h2>
            {selectedEventFilter !== 'all' && (
              <p className="text-gray-600 text-sm mt-1">
                {attendedEvents.find(e => e.eventId === selectedEventFilter)?.eventDate 
                  ? `Event date: ${new Date(attendedEvents.find(e => e.eventId === selectedEventFilter)?.eventDate || '').toLocaleDateString()}`
                  : ''
                }
              </p>
            )}
          </div>
          
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            {filteredImages.length > 0 && (
              <button
                onClick={handleDownloadAll}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="h-4 w-4 mr-2" />
                Download All
              </button>
            )}
            
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor="event-filter" className="text-gray-700 whitespace-nowrap">Filter by event:</label>
              <select
                id="event-filter"
                value={selectedEventFilter}
                onChange={handleEventFilterChange}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto max-w-[230px]"
              >
                <option value="all">All Events</option>
                {attendedEvents
                  .filter(event => event.eventId !== 'default')
                  .map(event => (
                    <option key={event.eventId} value={event.eventId}>
                      {event.eventName}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          
          {filteredImages.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredImages.map((image) => (
                <div
                  key={image.imageId}
                  className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow border border-gray-200"
                >
                  <div 
                    className="aspect-square relative cursor-pointer"
                    onClick={() => {
                      setSelectedImage(image);
                      toggleHeaderFooter(false);
                    }}
                  >
                    <img
                      src={image.imageUrl}
                      alt={`Matched photo from ${image.eventName}`}
                      className="object-cover w-full h-full"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(image.imageUrl);
                      }}
                      className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <ImageIcon className="h-12 w-12 text-gray-400 mx-auto" />
              {selectedEventFilter !== 'all' ? (
                <>
                  <p className="mt-2 text-gray-500">No photos found for this event</p>
                  <button
                    onClick={() => setSelectedEventFilter('all')}
                    className="mt-4 text-blue-600 hover:text-blue-800 px-4 py-2 border border-blue-300 rounded-lg"
                  >
                    Show all photos
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-gray-500">No matching photos found for any events</p>
                  <p className="mt-2 text-sm text-gray-500">Enter an event code above to find your photos</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Enlarged Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" 
          onClick={() => {
            setSelectedImage(null);
            toggleHeaderFooter(true);
          }}
        >
          <div className="relative bg-white rounded-lg shadow-xl max-w-[800px] max-h-[600px] w-full mx-auto" onClick={e => e.stopPropagation()}>
            <img
              src={selectedImage.imageUrl}
              alt={`Enlarged photo from ${selectedImage.eventName}`}
              className="w-full h-full object-contain rounded-lg"
              style={{ maxHeight: 'calc(600px - 4rem)' }}
            />
            <button
              className="absolute top-4 right-4 p-2 rounded-full bg-black/20 text-white hover:bg-black/70 transition-colors duration-200"
              onClick={() => {
                setSelectedImage(null);
                toggleHeaderFooter(true);
              }}
            >
              <X className="w-8 h-8" />
            </button>
            <div className="absolute bottom-4 right-4 flex space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  // Try native sharing first
                  if (typeof navigator.share === 'function') {
                    handleShare('', selectedImage.imageUrl, e);
                  } else {
                    // Fall back to custom share menu
                    setShareMenu({
                      isOpen: true,
                      imageUrl: selectedImage.imageUrl,
                      position: {
                        top: rect.top - 200,
                        left: rect.left - 200
                      }
                    });
                  }
                }}
                className="p-2 rounded-full bg-black/10 text-white hover:bg-black/70 transition-colors duration-200 flex items-center gap-2"
              >
                <Share2 className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(selectedImage.imageUrl);
                }}
                className="p-2 rounded-full bg-black/10 text-white hover:bg-black/70 transition-colors duration-200 flex items-center gap-2"
              >
                <Download className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Camera Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full relative">
            <button
              onClick={() => {
                stopCamera();
                setShowCameraModal(false);
              }}
              className="absolute -top-3 -right-3 bg-white text-gray-700 rounded-full p-2 shadow-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Take a Selfie</h3>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg">
                {error}
              </div>
            )}
            
            <div className="relative w-full">
              {isCameraActive && (
                <div className="mb-4">
                  <video
                    autoPlay
                    playsInline
                    className="w-full rounded-lg border-2 border-blue-500"
                    style={{ transform: 'scaleX(-1)' }} // Mirror the video feed
                  />
                  
                  <button
                    onClick={captureImage}
                    className="mt-4 w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                  >
                    <Camera className="w-5 h-5 mr-2" />
                    Capture Selfie
                  </button>
                </div>
              )}
              
              {!isCameraActive && processingStatus && (
                <div className="flex items-center justify-center p-6">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mr-3"></div>
                  <p className="text-blue-600">{processingStatus}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success Message Popup */}
      {successMessage && successMessage === 'Your selfie has been updated successfully!' && (
        <div className="fixed left-0 right-0 top-16 sm:top-24 z-[3000] pointer-events-none">
          <div className="container mx-auto px-4 max-w-md">
            <div className="bg-green-50 text-green-700 p-4 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in-out">
              <div className="bg-green-100 rounded-full p-1.5 flex-shrink-0">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-medium">{successMessage}</span>
            </div>
          </div>
        </div>
      )}

      {/* Share Menu */}
      {shareMenu.isOpen && (
        <div
          className="share-menu fixed z-50 bg-white rounded-lg shadow-xl p-4 w-64"
          style={{
            top: `${shareMenu.position.top}px`,
            left: `${shareMenu.position.left}px`,
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={(e) => handleShare('facebook', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Facebook className="h-6 w-6 text-blue-600" />
            </button>
            <button
              onClick={(e) => handleShare('instagram', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Instagram className="h-6 w-6 text-pink-600" />
            </button>
            <button
              onClick={(e) => handleShare('twitter', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Twitter className="h-6 w-6 text-blue-400" />
            </button>
            <button
              onClick={(e) => handleShare('linkedin', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Linkedin className="h-6 w-6 text-blue-700" />
            </button>
            <button
              onClick={(e) => handleShare('whatsapp', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <MessageCircle className="h-6 w-6 text-green-500" />
            </button>
            <button
              onClick={(e) => handleShare('email', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Mail className="h-6 w-6 text-gray-600" />
            </button>
            <button
              onClick={(e) => handleShare('copy', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors col-start-2"
            >
              <Link className="h-6 w-6 text-gray-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendeeDashboard; 
