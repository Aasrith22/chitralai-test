import React, { useState, useEffect, useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Image, Video, Users, Plus, X, Trash2, Copy, RefreshCw, CheckCircle, Edit, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { 
    storeEventData, 
    getEventStatistics, 
    getUserEvents, 
    EventData, 
    deleteEvent, 
    getEventsByOrganizerId,
    getEventsByUserId,
    getEventById,
    updateEventsWithOrganizationCode
} from '../config/eventStorage';
import s3ClientPromise, { validateEnvVariables } from '../config/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { UserContext } from '../App';
import { storeUserCredentials, getUserByEmail, queryUserByEmail } from '../config/dynamodb';
import { ObjectCannedACL } from '@aws-sdk/client-s3';

// Initialize S3 bucket name
let s3BucketName: string = '';

interface Event {
    id: string;
    name: string;
    date: string;
    description?: string;
    coverImage?: File;
}

interface StatsCardProps {
    icon: React.ReactNode;
    title: string;
    count: number;
    bgColor: string;
    className?: string;
    titleColor?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ icon, title, count, bgColor, className, titleColor }) => (
    <div className={`${bgColor} p-2 sm:p-2.5 rounded-lg shadow-md flex items-center space-x-2 ${className || ''}`}>
        <div className="p-1.5 bg-white rounded-full">{icon}</div>
        <div>
            <h3 className={`text-xs font-semibold truncate ${titleColor || 'text-blue-900'}`}>{title}</h3>
            <p className="text-sm sm:text-base font-bold text-black">{count}</p>
        </div>
    </div>
);

interface EventDashboardProps {
    setShowNavbar: (show: boolean) => void;
}

// Function to generate a unique 6-digit event ID
const generateUniqueEventId = async (): Promise<string> => {
    const generateSixDigitId = (): string => {
        // Generate a random 6-digit number
        return Math.floor(100000 + Math.random() * 900000).toString();
    };
    
    // Generate an initial ID
    let eventId = generateSixDigitId();
    
    // Check if the ID already exists in the database
    // If it does, generate a new one until we find a unique ID
    let isUnique = false;
    let maxAttempts = 10; // Prevent infinite loops
    let attempts = 0;
    
    while (!isUnique && attempts < maxAttempts) {
        attempts++;
        try {
            // Check if an event with this ID already exists
            const existingEvent = await getEventById(eventId);
            
            if (!existingEvent) {
                // ID is unique
                isUnique = true;
            } else {
                // ID exists, generate a new one
                console.log(`Event ID ${eventId} already exists, generating a new one...`);
                eventId = generateSixDigitId();
            }
        } catch (error) {
            console.error('Error checking event ID uniqueness:', error);
            // If there's an error checking, assume it's unique to avoid getting stuck
            isUnique = true;
        }
    }
    
    if (attempts >= maxAttempts) {
        console.warn('Reached maximum attempts to generate a unique ID');
    }
    
    return eventId;
};

const MAX_COVER_IMAGE_SIZE = 500 * 1024 * 1024; // 500MB

const EventDashboard = (props: EventDashboardProps) => {
    const navigate = useNavigate();
    const { userEmail, userRole, setUserRole } = useContext(UserContext);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{isOpen: boolean; eventId: string; userEmail: string}>({isOpen: false, eventId: '', userEmail: ''});

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newEvent, setNewEvent] = useState<Event>({ id: '', name: '', date: '' });
    const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);

    const [stats, setStats] = useState({ eventCount: 0, photoCount: 0, videoCount: 0, guestCount: 0 });
    const [isLoading, setIsLoading] = useState(false);
    const [events, setEvents] = useState<EventData[]>([]);
    const [showAllEvents, setShowAllEvents] = useState(true);
    const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
    const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

    const [userProfile, setUserProfile] = useState<any>(null);
    const [copiedCode, setCopiedCode] = useState(false);
    const [sortOption, setSortOption] = useState<'name' | 'date'>('date');
    const [showQRCode, setShowQRCode] = useState(false);

    // Add these states near the top of the EventDashboard component
    const [editMode, setEditMode] = useState<{eventId: string; type: 'name' | 'coverImage'} | null>(null);
    const [editedName, setEditedName] = useState('');

    // Add this to the EventDashboard component near other state declarations
    const [imageOrientations, setImageOrientations] = useState<Record<string, 'landscape' | 'portrait' | 'unknown'>>({});

    // Sort events based on selected option
    const sortedEvents = [...events].sort((a, b) => {
        if (sortOption === 'name') {
            return a.name.localeCompare(b.name);
        } else {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
    });

    useEffect(() => {
        loadEvents();

        // Check URL query parameters for 'create=true'
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('create') === 'true') {
            // Update user role to organizer when directed to create event
            const updateUserRole = async () => {
                const email = localStorage.getItem('userEmail');
                if (email) {
                    // Get user info from localStorage
                    let name = '';
                    const userProfileStr = localStorage.getItem('userProfile');
                    if (userProfileStr) {
                        try {
                            const userProfile = JSON.parse(userProfileStr);
                            name = userProfile.name || '';
                        } catch (e) {
                            console.error('Error parsing user profile from localStorage', e);
                        }
                    }
                    
                    const mobile = localStorage.getItem('userMobile') || '';
                    
                    // Update user role to organizer
                    await storeUserCredentials({
                        userId: email,
                        email,
                        name,
                        mobile,
                        role: 'organizer'
                    });
                    
                    // Update local context
                    setUserRole('organizer');

                    // Get the updated user data to get the organization code
                    const userData = await getUserByEmail(email);
                    if (userData?.organizationCode) {
                        // Update existing events with the organization code
                        await updateEventsWithOrganizationCode(email, userData.organizationCode);
                        console.log('Updated existing events with organization code:', userData.organizationCode);
                    }
                }
            };
            
            updateUserRole();
            setIsModalOpen(true);
            // Remove the parameter from URL without refreshing
            navigate('/events', { replace: true });
        }
    }, [navigate, setUserRole]);

    // Add effect to update statistics periodically and when component is visible
    useEffect(() => {
        // Initial load
        loadEventStatistics();
        
        // Set up refresh interval when component mounts
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                loadEventStatistics();
            }
        }, 2000); // Refresh every 2 seconds when visible for more responsive updates
        
        setRefreshInterval(interval);
        
        // Add visibility change listener to refresh data when coming back to page
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('Tab became visible, refreshing statistics...');
                loadEventStatistics();
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Force refresh on focus
        const handleFocus = () => {
            console.log('Window focused, refreshing statistics...');
            loadEventStatistics();
        };
        
        window.addEventListener('focus', handleFocus);
        
        // Clean up
        return () => {
            clearInterval(interval); // Clear using the local interval variable
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);  // Empty dependency array - only run on mount and unmount

    // Fix the detectImageOrientation function with proper typing
    const detectImageOrientation = (imageUrl: string, eventId: string): void => {
        const img = document.createElement('img');
        img.onload = () => {
            // Compare width and height to determine orientation
            const orientation = img.width >= img.height ? 'landscape' : 'portrait';
            setImageOrientations(prev => ({
                ...prev,
                [eventId]: orientation
            }));
            
        };
        img.onerror = () => {
            // Set unknown if image fails to load
            setImageOrientations(prev => ({
                ...prev,
                [eventId]: 'unknown'
            }));
            console.error(`Failed to load image for orientation detection: ${imageUrl}`);
        };
        // Use a single consistent timestamp to prevent flickering
        img.src = `${imageUrl}?cache=${Date.now()}`;
    };

    const loadEvents = async () => {
        try {
            const userEmail = localStorage.getItem('userEmail');
            if (!userEmail) {
                console.error('User email not found');
                return;
            }
            
            // Get events where user is listed as userEmail (backward compatibility)
            const userEvents = await getUserEvents(userEmail);
            
            // Get events where user is the organizer
            const organizerEvents = await getEventsByOrganizerId(userEmail);
            
            // Get events where user is the userId
            const userIdEvents = await getEventsByUserId(userEmail);
            
            // Combine events and remove duplicates (based on eventId)
            const allEvents = [...userEvents];
            
            // Add organizer events that aren't already in the list
            organizerEvents.forEach(orgEvent => {
                if (!allEvents.some(event => event.id === orgEvent.id)) {
                    allEvents.push(orgEvent);
                }
            });
            
            // Add userId events that aren't already in the list
            userIdEvents.forEach(userIdEvent => {
                if (!allEvents.some(event => event.id === userIdEvent.id)) {
                    allEvents.push(userIdEvent);
                }
            });
            
            if (Array.isArray(allEvents)) {
                // Calculate statistics directly from loaded events
                const newStats = {
                    eventCount: allEvents.length,
                    photoCount: allEvents.reduce((sum, event) => sum + (event.photoCount || 0), 0),
                    videoCount: allEvents.reduce((sum, event) => sum + (event.videoCount || 0), 0),
                    guestCount: allEvents.reduce((sum, event) => sum + (event.guestCount || 0), 0)
                };
                
                // Check if stats actually changed before updating state to prevent unnecessary renders
                const statsChanged = 
                    newStats.eventCount !== stats.eventCount ||
                    newStats.photoCount !== stats.photoCount ||
                    newStats.videoCount !== stats.videoCount ||
                    newStats.guestCount !== stats.guestCount;
                    
                if (statsChanged) {
                    console.log('Statistics updated:', newStats);
                    setStats(newStats);
                }
                
                // Check if events have changed before updating state
                const eventsChanged = allEvents.length !== events.length;
                if (eventsChanged) {
                    setEvents(allEvents);
                    console.log('Events updated:', allEvents.length);
                    
                    // Detect orientation for all event cover images
                    allEvents.forEach(event => {
                        if (event.coverImage) {
                            detectImageOrientation(event.coverImage, event.id);
                        }
                    });
                }
            } else {
                console.error('Invalid events data received');
            }
        } catch (error) {
            console.error('Error loading events:', error);
        }
    };

    const loadEventStatistics = async () => {
        try {
            const userEmail = localStorage.getItem('userEmail');
            if (userEmail) {
                console.log('Loading statistics for user:', userEmail);
                // Load events which will automatically update statistics
                await loadEvents();
            }
        } catch (error) {
            console.error('Error loading event statistics:', error);
            // Set default stats on error
            setStats({
                eventCount: 0,
                photoCount: 0,
                videoCount: 0,
                guestCount: 0
            });
        }
    };

    const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            
            // Validate file size
            if (file.size > MAX_COVER_IMAGE_SIZE) {
                alert(`File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the maximum limit of 500MB`);
                return;
            }

            // Validate file type
            if (!file.type.startsWith('image/')) {
                alert('Please upload a valid image file');
                return;
            }

            setNewEvent(prev => ({ ...prev, coverImage: file }));
            setCoverImagePreview(URL.createObjectURL(file));
        }
    };

    const handleOpenCreateModal = async () => {
        try {
            // Hide navbar immediately when opening create event modal
            props.setShowNavbar(false);
            
            // Update user role if needed
            if (userRole !== 'organizer') {
                console.log('Updating user role to organizer');
                const email = localStorage.getItem('userEmail');
                if (email) {
                    // Get user info from localStorage
                    let name = '';
                    const userProfileStr = localStorage.getItem('userProfile');
                    if (userProfileStr) {
                        try {
                            const userProfile = JSON.parse(userProfileStr);
                            name = userProfile.name || '';
                        } catch (e) {
                            console.error('Error parsing user profile from localStorage', e);
                        }
                    }
                    
                    const mobile = localStorage.getItem('userMobile') || '';
                    
                    // Update user role to organizer
                    await storeUserCredentials({
                        userId: email,
                        email,
                        name,
                        mobile,
                        role: 'organizer'
                    });
                    
                    // Update local context
                    setUserRole('organizer');
                    console.log('User role updated to organizer');
                }
            }
        } catch (error) {
            console.error('Error updating user role:', error);
        }
        
        // Open the modal
        setIsModalOpen(true);
    };

    const compressImage = async (file: File): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img: HTMLImageElement = new window.Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Failed to get canvas context'));
                        return;
                    }
                    // Calculate new dimensions while maintaining aspect ratio
                    let width = img.width;
                    let height = img.height;
                    const maxDimension = 1200;
                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = (height / width) * maxDimension;
                            width = maxDimension;
                        } else {
                            width = (width / height) * maxDimension;
                            height = maxDimension;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(blob);
                            } else {
                                reject(new Error('Failed to compress image'));
                            }
                        },
                        'image/jpeg',
                        0.8
                    );
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target?.result as string;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    };

    const handleCreateEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('Starting event creation process...');
        const { bucketName } = await validateEnvVariables();

        if (!newEvent.name || !newEvent.date || !newEvent.coverImage) {
            console.log('Validation failed:', { name: newEvent.name, date: newEvent.date, coverImage: !!newEvent.coverImage });
            alert('Please fill in all required fields including cover image');
            return;
        }

        setIsLoading(true);
        props.setShowNavbar(false);

        try {
            const userEmail = localStorage.getItem('userEmail');
            if (!userEmail) {
                console.error('User not authenticated - no email found in localStorage');
                throw new Error('User not authenticated');
            }
            console.log('User authenticated:', userEmail);

            // Generate a unique 6-digit event ID
            const eventId = await generateUniqueEventId();
            console.log('Generated event ID:', eventId);

            // Handle cover image upload first
            let coverImageUrl = '';
            if (newEvent.coverImage) {
                console.log('Starting cover image upload...');
                const coverImageKey = `events/shared/${eventId}/cover.jpg`;
                console.log('Cover image key:', coverImageKey);
                try {
                    // Compress the cover image before uploading
                    const compressedCoverImage = await compressImage(newEvent.coverImage);
                    // Upload directly to S3 using PutObjectCommand
                    const uploadCommand = new PutObjectCommand({
                        Bucket: bucketName,
                        Key: coverImageKey,
                        Body: new Uint8Array(await compressedCoverImage.arrayBuffer()),
                        ContentType: 'image/jpeg',
                        ACL: 'public-read' as ObjectCannedACL
                    });
                    console.log('Sending upload command to S3...');
                    await (await s3ClientPromise).send(uploadCommand);
                    console.log('S3 upload completed successfully');
                    coverImageUrl = `https://${bucketName}.s3.amazonaws.com/${coverImageKey}`;
                    console.log('Cover image URL:', coverImageUrl);
                } catch (uploadError) {
                    console.error('Error uploading cover image:', uploadError);
                    throw new Error('Failed to upload cover image. Please try again.');
                }
            }

            // Update user role and create event data
            try {
                // Get user info from localStorage
                let name = '';
                const userProfileStr = localStorage.getItem('userProfile');
                if (userProfileStr) {
                    try {
                        const userProfile = JSON.parse(userProfileStr);
                        name = userProfile.name || '';
                    } catch (e) {
                        console.error('Error parsing user profile from localStorage', e);
                    }
                }
                
                const mobile = localStorage.getItem('userMobile') || '';
                console.log('User profile loaded:', { name, mobile });

                // Get existing user data
                const existingUser = await getUserByEmail(userEmail);
                console.log('Retrieved existing user data:', existingUser);
                let eventIds: string[] = [];
                
                if (existingUser?.createdEvents && Array.isArray(existingUser.createdEvents)) {
                    eventIds = [...existingUser.createdEvents];
                }
                
                eventIds.push(eventId);
                
                // Update user role and createdEvents
                await storeUserCredentials({
                    userId: userEmail,
                    email: userEmail,
                    name,
                    mobile,
                    role: 'organizer',
                    createdEvents: eventIds
                });
                
                setUserRole('organizer');

                // Create event data
                const eventData: EventData = {
                    id: eventId,
                    name: newEvent.name,
                    date: newEvent.date,
                    description: newEvent.description,
                    coverImage: coverImageUrl,
                    photoCount: 0,
                    videoCount: 0,
                    guestCount: 0,
                    userEmail,
                    organizerId: userEmail,
                    userId: userEmail,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    eventUrl: `${window.location.origin}/attendee-dashboard?eventId=${eventId}`
                };

                // Store event data
                console.log('Storing event data...');
                const success = await storeEventData(eventData);
                
                if (success) {
                    console.log('Event created successfully');
                    await loadEventStatistics();
                    await loadEvents();
                    setIsModalOpen(false);
                    setNewEvent({ id: '', name: '', date: '', description: '' });
                    setCoverImagePreview(null);
                    props.setShowNavbar(true);
                    
                    // Navigate directly to the upload images page
                    console.log('Navigating to upload images page:', `/upload-image?eventId=${eventId}`);
                    navigate(`/upload-image?eventId=${eventId}`);
                } else {
                    throw new Error('Failed to store event data');
                }
            } catch (error) {
                console.error('Error in event creation process:', error);
                throw error;
            }
        } catch (error: any) {
            console.error('Error creating event:', error);
            alert(error.message || 'Failed to create event. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (deleteConfirmation.eventId && deleteConfirmation.userEmail) {
            try {
                const success = await deleteEvent(deleteConfirmation.eventId, deleteConfirmation.userEmail);
                if (success) {
                    // After successful deletion from DynamoDB
                    loadEvents();
                    loadEventStatistics();
                    setDeleteConfirmation({isOpen: false, eventId: '', userEmail: ''});
                } else {
                    alert('Failed to delete event. Please try again.');
                }
            } catch (error) {
                console.error('Error deleting event:', error);
                alert('An error occurred while deleting the event.');
            }
        }
    };

    const handleDeleteClick = (eventId: string, userEmail: string) => {
        setDeleteConfirmation({isOpen: true, eventId, userEmail});
    };

    const handleCopyEventId = (eventId: string) => {
        navigator.clipboard.writeText(eventId);
        setCopiedEventId(eventId);
        setTimeout(() => setCopiedEventId(null), 2000);
    };

    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const userEmail = localStorage.getItem('userEmail');
                if (userEmail) {
                    // Get user data from DynamoDB
                    const userData = await getUserByEmail(userEmail);
                    if (!userData) {
                        const queriedUser = await queryUserByEmail(userEmail);
                        if (queriedUser) {
                            setUserProfile(queriedUser);
                        }
                    } else {
                        setUserProfile(userData);
                    }
                }
            } catch (error) {
                console.error('Error fetching user profile:', error);
            }
        };

        fetchUserProfile();
    }, []);

    // Add copy function
    const handleCopyCode = () => {
        if (userProfile?.organizationCode) {
            navigator.clipboard.writeText(userProfile.organizationCode);
            setCopiedCode(true);
            setTimeout(() => setCopiedCode(false), 2000);
        }
    };

    // Add this function in the EventDashboard component
    const handleUpdateEvent = async (eventId: string, updates: {name?: string; coverImage?: string}) => {
        try {
            const { bucketName } = await validateEnvVariables();
            const userEmail = localStorage.getItem('userEmail');
            if (!userEmail) {
                throw new Error('User not authenticated');
            }

            // Get existing event data
            const existingEvent = await getEventById(eventId);
            if (!existingEvent) {
                throw new Error('Event not found');
            }

            // If there's a new cover image, upload it to S3
            let coverImageUrl = updates.coverImage;
            if (updates.coverImage && updates.coverImage.startsWith('data:')) {
                const coverImageKey = `events/shared/${eventId}/cover.jpg`;
                
                // Convert base64 to buffer
                const base64Data = updates.coverImage.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');

                // Upload directly to S3 using PutObjectCommand
                const uploadCommand = new PutObjectCommand({
                    Bucket: bucketName,
                    Key: coverImageKey,
                    Body: buffer,
                    ContentType: 'image/jpeg',
                    ACL: 'public-read' as ObjectCannedACL
                });

                await (await s3ClientPromise).send(uploadCommand);
                coverImageUrl = `https://${bucketName}.s3.amazonaws.com/${coverImageKey}`;
            }

            // Update event data
            const updatedEvent = {
                ...existingEvent,
                ...(updates.name && { name: updates.name }),
                ...(coverImageUrl && { coverImage: coverImageUrl }),
                updatedAt: new Date().toISOString()
            };

            // Store updated event
            await storeEventData(updatedEvent);
            
            // Refresh events list
            await loadEvents();
            setEditMode(null);
            setEditedName('');

        } catch (error) {
            console.error('Error updating event:', error);
            alert('Failed to update event. Please try again.');
        }
    };


    // Add this function to handle direct file uploads to S3
    const uploadFileToS3 = async (file: File, key: string): Promise<string> => {
        try {
            const { bucketName } = await validateEnvVariables();
            // Convert File to arrayBuffer
            const fileBuffer = await file.arrayBuffer();
            
            // Upload directly to S3 using PutObjectCommand
            const uploadCommand = new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: new Uint8Array(fileBuffer),
                ContentType: file.type,
                ACL: 'public-read' as ObjectCannedACL
            });

            await (await s3ClientPromise).send(uploadCommand);
            return `https://${bucketName}.s3.amazonaws.com/${key}`;
        } catch (error) {
            console.error('Error uploading to S3:', error);
            throw error;
        }
    };

    // Update the handleEditCoverImage function
    // Update the handleEditCoverImage function
    const handleEditCoverImage = async (event: React.ChangeEvent<HTMLInputElement>, eventId: string) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const { bucketName } = await validateEnvVariables();
            try {
                // Show loading state
                setIsLoading(true);
                
                // Validate file size
                if (file.size > MAX_COVER_IMAGE_SIZE) {
                    alert(`File size exceeds the maximum limit of 500MB`);
                    return;
                }

                // Validate file type
                if (!file.type.startsWith('image/')) {
                    alert('Please upload a valid image file');
                    return;
                }
                
                // Detect orientation from the file before upload
                const detectOrientationFromFile = (f: File) => {
                    const img = document.createElement('img');
                    const url = URL.createObjectURL(f);
                    img.onload = () => {
                        const orientation = img.width >= img.height ? 'landscape' : 'portrait';
                        setImageOrientations(prev => ({
                            ...prev,
                            [eventId]: orientation
                        }));
                        URL.revokeObjectURL(url);
                    };
                    img.src = url;
                };
                
                detectOrientationFromFile(file);

                // Get existing event first
                const existingEvent = await getEventById(eventId);
                if (!existingEvent) {
                    throw new Error('Event not found');
                }

                // Create a unique key for the cover image
                const coverImageKey = `events/shared/${eventId}/cover.jpg`;

                // Convert File to arrayBuffer
                const fileBuffer = await file.arrayBuffer();
                
                // Upload directly to S3 using PutObjectCommand
                const uploadCommand = new PutObjectCommand({
                    Bucket: bucketName,
                    Key: coverImageKey,
                    Body: new Uint8Array(fileBuffer),
                    ContentType: file.type,
                    ACL: 'public-read' as ObjectCannedACL
                });

                await (await s3ClientPromise).send(uploadCommand);

                // Generate the S3 URL
                const coverImageUrl = `https://${bucketName}.s3.amazonaws.com/${coverImageKey}`;

                // Update event with new cover image URL
                const updatedEvent = {
                    ...existingEvent,
                    coverImage: coverImageUrl,
                    updatedAt: new Date().toISOString()
                };

                // Store updated event
                const success = await storeEventData(updatedEvent);
                
                if (!success) {
                    throw new Error('Failed to update event data');
                }

                // Refresh events list
                await loadEvents();

                // Show success message
                alert('Cover image updated successfully');

            } catch (error) {
                console.error('Error updating cover image:', error);
                alert('Failed to update cover image. Please try again.');
            } finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <div className={`relative bg-blue-45 flex flex-col pt-16 sm:pt-16 ${events.length === 0 ? 'h-[calc(100vh-70px)]' : 'min-h-screen'}`}>
            <div className="relative z-10 container mx-auto px-4 py-4 sm:py-6 flex-grow">
                {/* Mobile View Header */}
                <div className="sm:hidden space-y-4 mb-4">
                    <h1 className="text-2xl font-bold text-blue-900">Event Dashboard</h1>
                    <div className="flex gap-2">
                        {userProfile?.organizationCode && (
                            <div className="flex-1 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 shadow-sm px-2 py-2 rounded-lg">
                                <span className="text-xs text-gray-600 font-medium block">Org Code</span>
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-sm font-semibold text-blue-700">{userProfile.organizationCode}</span>
                                    <button
                                        onClick={handleCopyCode}
                                        className="text-blue-600 hover:text-blue-800 transition-colors p-1 hover:bg-blue-50 rounded-full"
                                    >
                                        {copiedCode ? (
                                            <CheckCircle className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={handleOpenCreateModal}
                            className="flex-1 flex items-center justify-center bg-gradient-to-r from-blue-600 to-blue-700 text-white py-2 px-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 text-sm font-semibold shadow-md"
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            Create
                        </button>
                    </div>
                </div>

                {/* Desktop View Header */}
                <div className="hidden sm:flex mb-6 flex-row justify-between items-center">
                    <h1 className="text-3xl font-bold text-blue-900">Event Dashboard</h1>
                    <div className="flex items-center gap-3">
                        {userProfile?.organizationCode && (
                            <div className="flex items-center bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 shadow-sm px-4 py-2 rounded-lg hover:shadow-md transition-shadow duration-200">
                                <div className="flex flex-col">
                                    <span className="text-xs text-gray-600 font-medium">Organization Code</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm font-semibold text-blue-700">{userProfile.organizationCode}</span>
                                        <button
                                            onClick={handleCopyCode}
                                            className="text-blue-600 hover:text-blue-800 transition-colors group relative"
                                        >
                                            {copiedCode ? (
                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                            ) : (
                                                <Copy className="h-4 w-4 group-hover:scale-110 transition-transform" />
                                            )}
                                            <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                {copiedCode ? "Copied!" : "Copy code"}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={handleOpenCreateModal}
                            className="flex items-center justify-center bg-gradient-to-r from-blue-600 to-blue-700 text-white py-2 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Event
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 px-1">
                    <div onClick={() => setShowAllEvents(!showAllEvents)} className="cursor-pointer transform hover:scale-105 transition-transform duration-200 w-[95%]">
                        <StatsCard
                            icon={<Image className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-900" />}
                            title="Total Events"
                            count={stats.eventCount}
                            bgColor="bg-gradient-to-br from-blue-100 to-blue-200"
                            titleColor="text-blue-900"
                        />
                    </div>
                    <div className="transform hover:scale-105 transition-transform duration-200 w-[95%]">
                        <StatsCard
                            icon={<Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-900" />}
                            title="Total Photos"
                            count={stats.photoCount}
                            bgColor="bg-gradient-to-br from-blue-200 to-blue-300"
                            titleColor="text-blue-900"
                        />
                    </div>
                </div>

                {/* Organization Info */}
                {userProfile?.organizationLogo && (
                    <div className="mb-8 p-6 bg-gradient-to-r from-white to-blue-50 rounded-lg shadow-md border border-blue-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                {userProfile?.organizationLogo && (
                                    <div className="relative h-16 w-16 rounded-full overflow-hidden border-2 border-blue-200 shadow-md">
                                        <img 
                                            src={userProfile.organizationLogo} 
                                            alt="Organization Logo" 
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                )}
                                <div>
                                    <span className="text-sm text-gray-500 font-medium">Organization Name</span>
                                    <h2 className="text-xl font-semibold text-blue-900">
                                        {userProfile.organizationName}
                                    </h2>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowQRCode(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <QrCode className="w-4 h-4" />
                                Show QR Code
                            </button>
                        </div>
                    </div>
)}
                    
                    {/* QR Code Modal */}
                    {showQRCode && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold text-blue-900">Organization QR Code</h3>
                                    <button
                                        onClick={() => setShowQRCode(false)}
                                        className="text-gray-500 hover:text-gray-700"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="flex flex-col items-center gap-4">
                                    <QRCodeSVG
                                        value={`${window.location.origin}/my-organizations?code=${userProfile.organizationCode}`}
                                        size={200}
                                        level="H"
                                        includeMargin
                                    />
                                    <div className="text-center space-y-3">
                                        <div>
                                            <p className="text-sm text-gray-600 mb-2">Organization Code:</p>
                                            <p className="font-mono text-lg font-semibold text-blue-700">{userProfile.organizationCode}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600 mb-2">Share this link:</p>
                                            <div className="flex items-center justify-center space-x-2">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={`${window.location.origin}/my-organizations?code=${userProfile.organizationCode}`}
                                                    className="text-sm bg-gray-100 border rounded px-3 py-2 w-64 text-gray-700"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(`${window.location.origin}/my-organizations?code=${userProfile.organizationCode}`);
                                                        setCopiedCode(true);
                                                        setTimeout(() => setCopiedCode(false), 2000);
                                                    }}
                                                    className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition-colors"
                                                >
                                                    {copiedCode ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                

                {/* Create Event Modal */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-md border border-blue-400 mx-auto w-full max-w-xs sm:max-w-sm overflow-auto max-h-[80vh]">
                            <div className="flex justify-between items-center p-3 border-b border-gray-200">
                                <h2 className="text-base font-bold text-blue-700">Create New Event</h2>
                                <button
                                    onClick={() => {
                                        setIsModalOpen(false);
                                        props.setShowNavbar(true);
                                    }}
                                    className="text-black hover:text-gray-700"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <form onSubmit={handleCreateEvent} className="p-3 space-y-2">
                                {coverImagePreview && (
                                    <div className="relative w-full h-24 mb-2">
                                        <img
                                            src={coverImagePreview}
                                            alt="Cover preview"
                                            className="w-full h-full object-cover rounded-lg"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCoverImagePreview(null);
                                                setNewEvent(prev => ({ ...prev, coverImage: undefined }));
                                            }}
                                            className="absolute top-1 right-1 p-1 bg-blue-500 text-white rounded-full hover:bg-blue-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                <div className="mb-2">
                                    <label className="block text-blue-900 text-xs mb-1" htmlFor="coverImage">
                                        Cover Image <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="file"
                                        id="coverImage"
                                        accept="image/*"
                                        onChange={handleCoverImageChange}
                                        className="w-full text-xs text-blue-900 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-blue-700 text-xs mb-1" htmlFor="eventName">
                                        Event Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        id="eventName"
                                        value={newEvent.name}
                                        onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                                        className="w-full border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-primary"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-blue-700 text-xs mb-1" htmlFor="eventDate">
                                        Event Date <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        id="eventDate"
                                        value={newEvent.date}
                                        onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                                        className="w-full border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-primary"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-blue-300 text-black py-1.5 px-3 rounded-lg hover:bg-secondary transition-colors duration-200 disabled:opacity-50 mt-3 text-xs"
                                >
                                    {isLoading ? 'Creating Event...' : 'Create Event'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                <div className="text-center mb-8"></div>

                {/* Delete Confirmation Modal */}
                {deleteConfirmation.isOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-sm w-full">
                            <h3 className="text-xl font-bold text-gray-800 mb-4">Confirm Delete</h3>
                            <p className="text-gray-600 mb-6">Are you sure you want to delete this event? This action cannot be undone.</p>
                            <div className="flex justify-end space-x-4">
                                <button
                                    onClick={() => setDeleteConfirmation({isOpen: false, eventId: '', userEmail: ''})}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors duration-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmDelete}
                                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors duration-200"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showAllEvents && events.length > 0 && (
                    <div className="mt-4 sm:mt-6">
                        <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-blue-900 mb-3 sm:mb-4">All Events</h2>
                        <select
                            className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value as 'name' | 'date')}
                        >
                            <option value="date">Sort by Date</option>
                            <option value="name">Sort by Name (A-Z)</option>
                        </select>
                    </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                            {Array.isArray(events) && sortedEvents.map((event) => (
                                <div key={event.id} className="bg-gradient-to-br from-white to-blue-50 rounded-lg shadow-md border border-blue-200 overflow-hidden transform hover:scale-102 hover:shadow-lg transition-all duration-200">
                                    {event.coverImage ? (
                                        <div className="relative w-full h-32 sm:h-40 overflow-hidden">
                                            {/* Full blurred background to fill the entire container */}
                                            <div 
                                                className="absolute inset-0 bg-center bg-cover filter blur-md opacity-40 scale-110"
                                                style={{ backgroundImage: `url(${event.coverImage})` }}
                                            ></div>
                                            
                                            {/* Image container with consistent sizing */}
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <img 
                                                    src={event.coverImage}
                                                    alt={event.name} 
                                                    className="object-contain max-h-full max-w-full hover:scale-105 transition-transform duration-500"
                                                    style={{ 
                                                        maxHeight: '100%', 
                                                        maxWidth: '100%',
                                                        boxShadow: '0 0 20px rgba(0, 0, 0, 0.1)'
                                                    }}
                                                    onLoad={(e) => {
                                                        // Detect orientation on image load
                                                        const img = e.currentTarget;
                                                        const orientation = img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait';
                                                        setImageOrientations(prev => ({
                                                            ...prev,
                                                            [event.id]: orientation
                                                        }));
                                                    }}
                                                />
                                            </div>
                                            
                                            <label className="absolute bottom-2 right-2 bg-blue-500 text-white p-1.5 rounded-full cursor-pointer hover:bg-blue-600 transition-colors z-10">
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => {
                                                        handleEditCoverImage(e, event.id);
                                                        e.target.value = ''; // Reset input
                                                    }}
                                                    disabled={isLoading}
                                                />
                                                {isLoading ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Camera className="w-4 h-4" />
                                                )}
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="relative w-full h-32 sm:h-40 bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                                            <label className="cursor-pointer flex items-center justify-center w-full h-full">
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => {
                                                        handleEditCoverImage(e, event.id);
                                                        e.target.value = ''; // Reset input
                                                    }}
                                                    disabled={isLoading}
                                                />
                                                {isLoading ? (
                                                    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                                                ) : (
                                                    <Camera className="w-6 h-6 text-blue-400" />
                                                )}
                                            </label>
                                        </div>
                                    )}
                                    <div className="p-2.5">
                                        {editMode?.eventId === event.id && editMode.type === 'name' ? (
                                            <form onSubmit={(e) => {
                                                e.preventDefault();
                                                handleUpdateEvent(event.id, { name: editedName });
                                            }}>
                                                <input
                                                    type="text"
                                                    value={editedName}
                                                    onChange={(e) => setEditedName(e.target.value)}
                                                    className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500"
                                                    autoFocus
                                                    onBlur={() => setEditMode(null)}
                                                />
                                            </form>
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-semibold text-blue-900 mb-1.5 line-clamp-1">{event.name}</h3>
                                                <button
                                                    onClick={() => {
                                                        setEditMode({ eventId: event.id, type: 'name' });
                                                        setEditedName(event.name);
                                                    }}
                                                    className="p-1 text-gray-500 hover:text-blue-600 rounded-full hover:bg-blue-50"
                                                >
                                                    <Edit className="w-3 h-3" />
                                                </button>
                                            </div>
                                        )}
                                        <div className="flex items-center mb-1.5 bg-blue-50 rounded-lg p-1">
                                            <span className="text-xs font-medium text-gray-600 mr-1">Code:</span>
                                            <div className="flex items-center flex-1">
                                                <span className="text-xs font-mono font-medium text-blue-700">{event.id}</span>
                                                <button 
                                                    onClick={() => handleCopyEventId(event.id)}
                                                    className="ml-1 text-blue-600 hover:text-blue-800 p-0.5 hover:bg-blue-100 rounded-full transition-colors group relative"
                                                    title="Copy event code"
                                                >
                                                    {copiedEventId === event.id ? (
                                                        <CheckCircle className="w-3 h-3 text-green-600" />
                                                    ) : (
                                                        <Copy className="w-3 h-3" />
                                                    )}
                                                    <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {copiedEventId === event.id ? "Copied!" : "Copy code"}
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-600 mb-1.5">
                                            <span className="font-medium">Date:</span> {new Date(event.date).toLocaleDateString()}
                                        </p>
                                        {event.description && (
                                            <p className="text-xs text-gray-500 mb-2 line-clamp-2">{event.description}</p>
                                        )}
                                        <div className="flex justify-end space-x-1.5">
                                            <Link
                                                to={`/view-event/${event.id}`}
                                                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-2 py-1 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 text-xs font-medium shadow-sm hover:shadow-md"
                                            >
                                                View
                                            </Link>
                                            <button
                                                onClick={() => handleDeleteClick(event.id, event.userEmail)}
                                                className="bg-white border border-gray-300 text-gray-700 px-2 py-1 rounded-lg hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-200 flex items-center text-xs font-medium shadow-sm hover:shadow-md group"
                                            >
                                                <Trash2 className="w-3 h-3 mr-1 group-hover:text-white" />
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EventDashboard;
