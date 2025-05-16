import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload } from '@aws-sdk/lib-storage';
import { s3ClientPromise, validateEnvVariables } from '../config/aws';
import { Upload as UploadIcon, X, Download, ArrowLeft, Copy, Loader2, Camera, ShieldAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getUserEvents, getEventById, updateEventData } from '../config/eventStorage';

// Add type declaration for directory upload attributes
declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const BATCH_SIZE = 10; // Increased for faster processing
const IMAGES_PER_PAGE = 20;
const MAX_PARALLEL_UPLOADS = 20; // Increased for faster parallel processing
const MAX_DIMENSION = 2048;
const UPLOAD_TIMEOUT = 300000; // 5 minutes timeout for large files
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 2000;
const MAX_RETRY_DELAY = 30000;
const JITTER_MAX = 1000;
const MEMORY_THRESHOLD = 0.8; // 80% memory usage threshold

// Add helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Helper function to add jitter to retry delay
const getRetryDelay = (retryCount: number): number => {
  const exponentialDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
  const delay = Math.min(exponentialDelay, MAX_RETRY_DELAY);
  const jitter = Math.random() * JITTER_MAX;
  return delay + jitter;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Add error type constants
const UPLOAD_ERROR_TYPES = {
  VALIDATION: 'VALIDATION_ERROR',
  NETWORK: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
  S3_ERROR: 'S3_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
} as const;

type UploadErrorType = typeof UPLOAD_ERROR_TYPES[keyof typeof UPLOAD_ERROR_TYPES];

interface UploadError {
  type: UploadErrorType;
  message: string;
  details?: any;
  timestamp: number;
}

// Add error tracking
const uploadErrorTracker = {
  errors: new Map<string, UploadError[]>(),
  
  addError(fileName: string, error: UploadError) {
    if (!this.errors.has(fileName)) {
      this.errors.set(fileName, []);
    }
    this.errors.get(fileName)?.push(error);
  },
  
  getErrors(fileName: string) {
    return this.errors.get(fileName) || [];
  },
  
  clearErrors(fileName: string) {
    this.errors.delete(fileName);
  }
};

// Add this helper function near the top
const pollForCompressedImage = async (bucketUrl: string, compressedKey: string, maxAttempts = 15, interval = 2000): Promise<string | null> => {
  // Skip compression check for now and return the original image URL
  return `${bucketUrl}/${compressedKey}`;
};

// Add this helper function for getting a pre-signed URL
const getPresignedUrl = async (key: string, contentType: string): Promise<string> => {
  const response = await fetch('/api/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, contentType })
  });
  if (!response.ok) throw new Error('Failed to get pre-signed URL');
  const data = await response.json();
  return data.url;
};

const UploadImage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [images, setImages] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [eventId, setEventId] = useState<string>('');
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [showQRModal, setShowQRModal] = useState(false);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [eventCode, setEventCode] = useState<string>('');
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authorizationMessage, setAuthorizationMessage] = useState<string>('');
  const [totalSize, setTotalSize] = useState<number>(0);
  const [uploadType, setUploadType] = useState<'folder' | 'photos'>('photos');

  // Add effect to handle post-login reload
  useEffect(() => {
    // Check if we just logged in by looking for a flag in sessionStorage
    const justLoggedIn = sessionStorage.getItem('justLoggedIn');
    const urlEventId = new URLSearchParams(window.location.search).get('eventId');
    
    if (justLoggedIn && urlEventId) {
      // Clear the flag
      sessionStorage.removeItem('justLoggedIn');
      // Reload the page to reinitialize everything
      window.location.reload();
    }
  }, []);

  // Function to check if the user is authorized to upload
  const checkAuthorization = useCallback(async (eventId: string) => {
    if (!eventId) {
      setIsAuthorized(null);
      setAuthorizationMessage('');
      return;
    }

    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      setIsAuthorized(false);
      setAuthorizationMessage('You need to log in to upload images.');
      // Store the current URL for post-login redirect
      localStorage.setItem('pendingAction', 'getPhotos');
      localStorage.setItem('pendingRedirectUrl', window.location.href);
      return;
    }

    try {
      const event = await getEventById(eventId);
      if (!event) {
        setIsAuthorized(false);
        setAuthorizationMessage('Event not found with the provided code.');
        return;
      }

      // Check if user is the event creator
      if (event.organizerId === userEmail || event.userEmail === userEmail) {
        setIsAuthorized(true);
        setAuthorizationMessage('You are authorized as the event creator.');
        return;
      }

      // Check if user's email is in the emailAccess list
      if (event.emailAccess && Array.isArray(event.emailAccess) && event.emailAccess.includes(userEmail)) {
        setIsAuthorized(true);
        setAuthorizationMessage('You are authorized to upload to this event.');
        return;
      }

      // Check if anyone can upload is enabled
      if (event.anyoneCanUpload) {
        setIsAuthorized(true);
        setAuthorizationMessage('This event allows anyone to upload photos.');
        return;
      }

      // User is not authorized
      setIsAuthorized(false);
      setAuthorizationMessage('You are not authorized to upload images to this event.');
    } catch (error) {
      console.error('Error checking authorization:', error);
      setIsAuthorized(false);
      setAuthorizationMessage('Error checking authorization. Please try again.');
    }
  }, []);

  // Function to check event code authorization
  const checkEventCodeAuthorization = useCallback(async (code: string) => {
    if (!code) return;

    try {
      const event = await getEventById(code);
      if (!event) {
        setIsAuthorized(false);
        setAuthorizationMessage('Event not found with the provided code.');
        return;
      }

      // Set the event details
      setSelectedEvent(code);
      setEventId(code);
      localStorage.setItem('currentEventId', code);
      
      // Check authorization
      await checkAuthorization(code);
    } catch (error) {
      console.error('Error checking event code:', error);
      setIsAuthorized(false);
      setAuthorizationMessage('Error checking event code. Please try again.');
    }
  }, [checkAuthorization]);

  // Handle scroll for pagination
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      setCurrentPage(prev => prev + 1);
    }
  }, []);

  useEffect(() => {
    const initializeComponent = async () => {
      // Check URL parameters first for eventId - do this before userEmail check
      const searchParams = new URLSearchParams(window.location.search);
      const urlEventId = searchParams.get('eventId');
      
      if (urlEventId) {
        console.log('EventId from URL params:', urlEventId);
        setEventCode(urlEventId);
        // Only check authorization if user is logged in
        const userEmail = localStorage.getItem('userEmail');
        if (userEmail) {
          checkEventCodeAuthorization(urlEventId);
        }
      }

      // Continue with user-specific initialization if logged in
      const userEmail = localStorage.getItem('userEmail');
      if (!userEmail) return;

      try {
        // Fetch user events
        const userEvents = await getUserEvents(userEmail);
        const eventsList = userEvents.map(event => ({
          id: event.id,
          name: event.name,
        }));
        setEvents(eventsList);

        // Extract eventId from state or localStorage if not already set from URL
        let targetEventId = urlEventId;
        
        if (!targetEventId) {
          // Check location state (from navigation)
          if (location.state?.eventId) {
            console.log('EventId from location state:', location.state.eventId);
            targetEventId = location.state.eventId;
          }
          // Check localStorage as last resort
          else {
            const storedEventId = localStorage.getItem('currentEventId');
            if (storedEventId) {
              console.log('EventId from localStorage:', storedEventId);
              targetEventId = storedEventId;
            }
          }
        }

        if (targetEventId) {
          // Find the event in the list to confirm it exists
          const eventExists = eventsList.some(event => event.id === targetEventId);
          
          if (eventExists) {
            setEventId(targetEventId);
            setSelectedEvent(targetEventId);
            console.log('Set selected event to:', targetEventId);
          } else {
            console.warn('Event ID from URL/state not found in user events:', targetEventId);
          }
        }
      } catch (error) {
        console.error('Error initializing UploadImage component:', error);
      }
    };

    initializeComponent();
  }, [location, checkEventCodeAuthorization]);

  // Find the current event name for display
  const getSelectedEventName = () => {
    const event = events.find(e => e.id === selectedEvent);
    return event ? event.name : 'Select an Event';
  };

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      
      // Validate files before proceeding
      const validFiles: File[] = [];
      const invalidFiles: { name: string; reason: string }[] = [];
      let newTotalSize = 0;
      
      for (const file of files) {
        const fileName = file.name.toLowerCase();
        const isValidType = file.type.startsWith('image/');
        const isValidSize = file.size <= MAX_FILE_SIZE;
        const isNotSelfie = !fileName.includes('selfie') && !fileName.includes('self');
        
        if (!isValidType) {
          invalidFiles.push({ name: file.name, reason: 'Not a valid image file' });
        } else if (!isValidSize) {
          invalidFiles.push({ name: file.name, reason: 'Exceeds the 200MB size limit' });
        } else if (!isNotSelfie) {
          invalidFiles.push({ name: file.name, reason: 'Selfie images are not allowed' });
        } else {
          // For folder uploads, preserve the folder structure
          if ('webkitRelativePath' in file) {
            // Remove the root folder name from the path
            const pathParts = (file as any).webkitRelativePath.split('/');
            pathParts.shift(); // Remove the root folder name
            const relativePath = pathParts.join('/');
            // Create new File object with the original name
            const fileWithPath = new File([file], file.name, { type: file.type });
            validFiles.push(fileWithPath);
          } else {
            validFiles.push(file);
          }
          newTotalSize += file.size;
        }
      }

      // Show error message for invalid files
      if (invalidFiles.length > 0) {
        const warningMessage = `${invalidFiles.length} file(s) were skipped:\n${
          invalidFiles.slice(0, 5).map(f => `- ${f.name}: ${f.reason}`).join('\n')
        }${invalidFiles.length > 5 ? `\n...and ${invalidFiles.length - 5} more` : ''}`;
        
        alert(warningMessage);
      }

      // Batch update images
      setImages(prev => [...prev, ...validFiles]);
      setTotalSize(prev => prev + newTotalSize);
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages(prev => {
      const removedFile = prev[index];
      setTotalSize(currentSize => currentSize - removedFile.size);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const clearAllFiles = useCallback(() => {
    setImages([]);
    setTotalSize(0);
  }, []);

  // Add memory management helper
  const checkMemoryUsage = async (): Promise<boolean> => {
    if ('performance' in window && 'memory' in performance) {
      const memory = (performance as any).memory;
      const usedHeap = memory.usedJSHeapSize;
      const totalHeap = memory.totalJSHeapSize;
      return usedHeap / totalHeap < MEMORY_THRESHOLD;
    }
    return true; // If memory API not available, assume OK
  };

  // Optimize uploadToS3 function with retry and error handling
  const uploadToS3WithRetry = async (
    file: File,
    fileName: string,
    retryCount = 0,
    lastError: Error | null = null
  ): Promise<string> => {
    try {
      // Validate file before attempting upload
      if (!file.type.startsWith('image/')) {
        const error: UploadError = {
          type: UPLOAD_ERROR_TYPES.VALIDATION,
          message: 'Not a valid image file',
          details: { fileType: file.type },
          timestamp: Date.now()
        };
        uploadErrorTracker.addError(fileName, error);
        throw new Error(error.message);
      }

      if (file.size > MAX_FILE_SIZE) {
        const error: UploadError = {
          type: UPLOAD_ERROR_TYPES.VALIDATION,
          message: 'Exceeds the 200MB size limit',
          details: { fileSize: file.size, maxSize: MAX_FILE_SIZE },
          timestamp: Date.now()
        };
        uploadErrorTracker.addError(fileName, error);
        throw new Error(error.message);
      }

      // If file size is large, increase timeout for this attempt
      const timeoutMultiplier = Math.min(retryCount + 1, 3);
      const currentTimeout = UPLOAD_TIMEOUT * timeoutMultiplier;

      const uploadPromise = uploadToS3(file, fileName).catch(error => {
        // Classify S3 errors
        const s3Error: UploadError = {
          type: UPLOAD_ERROR_TYPES.S3_ERROR,
          message: error.message || 'S3 upload failed',
          details: {
            code: error.code,
            statusCode: error.$metadata?.httpStatusCode,
            requestId: error.$metadata?.requestId
          },
          timestamp: Date.now()
        };
        uploadErrorTracker.addError(fileName, s3Error);
        throw error;
      });

      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => {
          const timeoutError: UploadError = {
            type: UPLOAD_ERROR_TYPES.TIMEOUT,
            message: 'Upload timeout',
            details: { timeout: currentTimeout },
            timestamp: Date.now()
          };
          uploadErrorTracker.addError(fileName, timeoutError);
          reject(new Error('Upload timeout'));
        }, currentTimeout);
      });

      return await Promise.race([uploadPromise, timeoutPromise]);
    } catch (error) {
      const currentError = error instanceof Error ? error : new Error('Unknown error');
      
      // Check if it's a network error
      if (currentError.message.includes('network') || currentError.message.includes('connection')) {
        const networkError: UploadError = {
          type: UPLOAD_ERROR_TYPES.NETWORK,
          message: currentError.message,
          details: { navigator: navigator.onLine },
          timestamp: Date.now()
        };
        uploadErrorTracker.addError(fileName, networkError);
      }

      // Log detailed error information
      console.error(`Upload attempt ${retryCount + 1} failed for ${fileName}:`, {
        error: currentError.message,
        retryCount,
        fileName,
        fileSize: formatFileSize(file.size),
        errorHistory: uploadErrorTracker.getErrors(fileName)
      });

      if (retryCount < MAX_RETRIES) {
        const delay = getRetryDelay(retryCount);
        console.log(`Retrying upload for ${fileName} after ${Math.round(delay/1000)}s (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        await sleep(delay);
        return uploadToS3WithRetry(file, fileName, retryCount + 1, currentError);
      }

      // If we've exhausted all retries, throw an error with complete history
      const finalError = new Error(`Upload failed after ${MAX_RETRIES} retries. Error history: ${
        uploadErrorTracker.getErrors(fileName)
          .map(err => `${err.type}: ${err.message}`)
          .join(', ')
      }`);
      throw finalError;
    }
  };

  // Enhance upload function with better error handling
  // Optimized upload queue with parallel processing and memory management
  const uploadToS3WithRetryQueue = async (files: File[]): Promise<string[]> => {
    const results: string[] = [];
    const failedUploads: { file: File; error: Error }[] = [];
    const uploadQueue = [...files];
    const inProgress = new Set<string>();
    const maxConcurrent = 5; // Limit concurrent uploads
    
    const processFile = async (file: File): Promise<string> => {
      const fileName = file.name;
      let retryCount = 0;
      
      while (retryCount < MAX_RETRIES) {
        try {
          // Validate and compress file
          if (!file.type.startsWith('image/')) {
            throw new Error('Not a valid image file');
          }
          
          if (file.size > MAX_FILE_SIZE) {
            throw new Error(`File size exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`);
          }
          
          // Compress image before upload
          const compressedBlob = await compressImage(file);
          const compressedFile = new File([compressedBlob], fileName, { type: file.type });
          
          // Upload with timeout
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Upload timeout')), UPLOAD_TIMEOUT);
          });
          
          const uploadPromise = uploadToS3(compressedFile, fileName);
          const result = await Promise.race([uploadPromise, timeoutPromise]);
          
          return result;
        } catch (error) {
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            throw error;
          }
          await sleep(getRetryDelay(retryCount));
        }
      }
      
      throw new Error(`Upload failed after ${MAX_RETRIES} retries`);
    };
    
    const processQueue = async () => {
      while (uploadQueue.length > 0 || inProgress.size > 0) {
        // Fill up concurrent slots
        while (uploadQueue.length > 0 && inProgress.size < maxConcurrent) {
          const file = uploadQueue.shift()!;
          const fileName = file.name;
          
          inProgress.add(fileName);
          processFile(file)
            .then(result => {
              results.push(result);
              setUploadProgress(prev => ({
                current: (prev?.current || 0) + 1,
                total: files.length
              }));
            })
            .catch(error => {
              failedUploads.push({ file, error });
              console.error(`Failed to upload ${fileName}:`, error);
            })
            .finally(() => {
              inProgress.delete(fileName);
            });
        }
        
        // Wait before checking queue again
        await sleep(100);
        
        // Check memory usage
        if ('performance' in window && 'memory' in performance) {
          const memory = (performance as any).memory;
          if (memory.usedJSHeapSize / memory.totalJSHeapSize > MEMORY_THRESHOLD) {
            await sleep(1000); // Wait for GC
          }
        }
      }
    };
    
    await processQueue();
    
    if (failedUploads.length > 0) {
      console.error(`${failedUploads.length} uploads failed:`, failedUploads);
    }
    
    return results;
  };

  // Enhanced batch upload function with memory management
  const uploadBatchWithRetryQueue = async (batch: File[], startIndex: number): Promise<(string | null)[]> => {
    const { bucketName } = await validateEnvVariables();
    const results: (string | null)[] = new Array(batch.length).fill(null);
    const failedUploads: { file: File; index: number }[] = [];

    // Process files in smaller chunks to manage memory
    const chunkSize = 5;
    for (let i = 0; i < batch.length; i += chunkSize) {
      const chunk = batch.slice(i, i + chunkSize);
      
      // Check memory usage before processing chunk
      const memoryOK = await checkMemoryUsage();
      if (!memoryOK) {
        // Wait for garbage collection
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const chunkResults = await Promise.allSettled(
        chunk.map(async (file, chunkIndex) => {
          const index = i + chunkIndex;
          try {
            // Get the original filename
            const originalFileName = file.name;
            // Split filename and extension
            const lastDotIndex = originalFileName.lastIndexOf('.');
            const nameWithoutExt = originalFileName.substring(0, lastDotIndex);
            const extension = originalFileName.substring(lastDotIndex);
            // Create safe filename while preserving extension and original name
            const safeFileName = nameWithoutExt.replace(/[^a-zA-Z0-9.-]/g, '_') + extension;
            const fileName = `${Date.now()}-${startIndex + index}-${safeFileName}`;
            console.log(`Uploading file: ${fileName} (Original: ${originalFileName})`);
            return await uploadToS3WithRetry(file, fileName);
          } catch (error) {
            console.error('Error processing file:', file.name, error);
            failedUploads.push({ file, index });
            return null;
          }
        })
      );

      // Process chunk results
      chunkResults.forEach((result, chunkIndex) => {
        const index = i + chunkIndex;
        if (result.status === 'fulfilled' && result.value) {
          results[index] = `https://${bucketName}.s3.amazonaws.com/${result.value}`;
        }
      });

      // Clear memory after each chunk
      if (global.gc) {
        global.gc();
      }
    }

    // Process failed uploads with exponential backoff
    let retryQueue = [...failedUploads];
    let retryAttempt = 0;
    
    while (retryQueue.length > 0 && retryAttempt < 3) {
      await sleep(getRetryDelay(retryAttempt));
      
      const currentQueue = [...retryQueue];
      retryQueue = [];

      for (const { file, index } of currentQueue) {
        try {
          const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const fileName = `${Date.now()}-retry${retryAttempt}-${index}-${safeFileName}`;
          const result = await uploadToS3WithRetry(file, fileName);
          results[index] = `https://${bucketName}.s3.amazonaws.com/${result}`;
        } catch (error) {
          retryQueue.push({ file, index });
        }
      }
      
      retryAttempt++;
    }

    return results;
  };

  // Optimize handleUpload function
  const handleUpload = useCallback(async () => {
    if (images.length === 0) {
      alert('Please select at least one image to upload.');
      return;
    }
    if (!selectedEvent) {
      alert('Please select or create an event before uploading images.');
      return;
    }

    setIsUploading(true);
    setUploadSuccess(false);
    
    const uploadStartTime = Date.now();
    let uploadedCount = 0;
    const totalCount = images.length;
    setUploadProgress({ current: 0, total: totalCount });

    try {
      // Process all files using the optimized upload queue
      const results = await uploadToS3WithRetryQueue(images);
      
      // Update event data
      if (results.length > 0) {
        const userEmail = localStorage.getItem('userEmail');
        if (userEmail) {
          try {
            const currentEvent = await getEventById(selectedEvent);
            if (currentEvent) {
              await updateEventData(selectedEvent, userEmail, {
                photoCount: (currentEvent.photoCount || 0) + results.length
              });
            }
          } catch (error) {
            console.error('Error updating photoCount:', error);
          }
        }
        
        setUploadedUrls(results);
        localStorage.setItem('currentEventId', selectedEvent);
        setEventId(selectedEvent);
        setUploadSuccess(true);
        setShowQRModal(true);

        // Show success message with upload stats
        const uploadTimeInSeconds = (Date.now() - uploadStartTime) / 1000;
        const uploadSpeedMBps = (totalSize / (1024 * 1024)) / uploadTimeInSeconds;
        console.log(`Upload completed: ${results.length} files, ${formatFileSize(totalSize)} in ${uploadTimeInSeconds.toFixed(1)}s (${uploadSpeedMBps.toFixed(2)} MB/s)`);
      }

      setImages([]);
      setTotalSize(0);
    } catch (error) {
      console.error('Upload process failed:', error);
      alert('Failed to complete the upload process. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [images, selectedEvent, totalSize]);

  const handleDownload = useCallback(async (url: string) => {
    try {
      const response = await fetch(url, {
        mode: 'cors',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        const errorMessage = `Failed to download image (${response.status}): ${response.statusText}`;
        console.error(errorMessage);
        alert(errorMessage);
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('image/')) {
        const errorMessage = 'Invalid image format received';
        console.error(errorMessage);
        alert(errorMessage);
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const fileName = decodeURIComponent(url.split('/').pop() || 'image.jpg');

      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(link.href);
      console.log(`Successfully downloaded: ${fileName}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while downloading the image';
      console.error('Error downloading image:', error);
      alert(errorMessage);
      throw error;
    }
  }, []);

  const handleDownloadAll = useCallback(async () => {
    const downloadPromises = uploadedUrls.map(url =>
      handleDownload(url).catch(error => ({ error, url }))
    );
    const results = await Promise.allSettled(downloadPromises);

    let successCount = 0;
    let failedUrls: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        failedUrls.push(uploadedUrls[index]);
      }
    });

    if (failedUrls.length === 0) {
      alert(`Successfully downloaded all ${successCount} images!`);
    } else {
      alert(`Downloaded ${successCount} images. Failed to download ${failedUrls.length} images. Please try again later.`);
    }
  }, [uploadedUrls, handleDownload]);

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/attendee-dashboard?eventId=${selectedEvent}`;
    navigator.clipboard.writeText(link);
    setShowCopySuccess(true);
    setTimeout(() => setShowCopySuccess(false), 2000);
  }, [selectedEvent]);

  const handleDownloadQR = useCallback(() => {
    try {
      const canvas = document.createElement('canvas');
      const svg = document.querySelector('.qr-modal svg');
      if (!svg) {
        throw new Error('QR code SVG element not found');
      }
      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            throw new Error('Could not create image blob');
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `selfie-upload-qr-${selectedEvent}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 'image/png');
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    } catch (error) {
      console.error('Error downloading QR code:', error);
      alert('Failed to download QR code. Please try again.');
    }
  }, [selectedEvent]);

  // Add event handler for the event code input
  const handleEventCodeSubmit = useCallback(async () => {
    if (!eventCode) {
      alert('Please enter an event code.');
      return;
    }

    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      // Store the current URL in localStorage for redirect after login
      localStorage.setItem('pendingRedirectUrl', window.location.href);
      // Set a flag to indicate we need to reload after login
      sessionStorage.setItem('justLoggedIn', 'true');
    }

    await checkEventCodeAuthorization(eventCode);
  }, [eventCode, checkEventCodeAuthorization]);

  // Check authorization when event is selected from dropdown
  useEffect(() => {
    if (selectedEvent) {
      checkAuthorization(selectedEvent);
    }
  }, [selectedEvent, checkAuthorization]);

  return (
    <div className="relative bg-grey-100 min-h-screen">
      {/* Add spacer div to push content below navbar */}
      <div className="h-14 sm:h-16 md:h-20"></div>
      
      <div className="container mx-auto px-4 py-2 relative z-10 mt-4">
        <video autoPlay loop muted className="fixed top-0 left-0 w-full h-full object-cover opacity-100 -z-10">
          <source src="tiny.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <div className="relative z-10 container mx-auto px-4 py-4">
          <div className="max-w-lg mx-auto bg-white p-3 sm:p-5 rounded-lg shadow-md border-4 border-blue-900">
            <div className="flex flex-col items-center justify-center mb-4 sm:mb-6 space-y-4">
              {/* Event selection dropdown */}
              <select
                value={selectedEvent}
                onChange={(e) => {
                  const newEventId = e.target.value;
                  setSelectedEvent(newEventId);
                  setEventId(newEventId);
                  if (newEventId) {
                    localStorage.setItem('currentEventId', newEventId);
                  }
                }}
                className="border border-blue-400 rounded-lg px-4 py-2 w-full max-w-md text-black focus:outline-none focus:border-blue-900 bg-white"
              >
                <option value="">Select an Event</option>
                {events.map(event => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>

              {/* Or text divider */}
              <div className="flex items-center w-full max-w-md">
                <div className="flex-grow h-px bg-gray-300"></div>
                <span className="px-4 text-gray-500 text-sm">OR</span>
                <div className="flex-grow h-px bg-gray-300"></div>
              </div>

              {/* Event code input */}
              <div className="flex flex-col sm:flex-row w-full max-w-md space-y-2 sm:space-y-0 sm:space-x-2">
                <input
                  type="text"
                  value={eventCode}
                  onChange={(e) => setEventCode(e.target.value)}
                  placeholder="Enter Event Code"
                  className="w-full border border-blue-400 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-blue-900 bg-white"
                />
                <button
                  onClick={handleEventCodeSubmit}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 font-medium min-w-[90px]"
                >
                  Access
                </button>
              </div>

              {/* Authorization status message */}
              {isAuthorized !== null && localStorage.getItem('userEmail') && (
                <div className={`w-full max-w-md p-3 rounded-lg text-sm ${
                  isAuthorized 
                    ? 'bg-green-100 text-green-800 border border-green-300' 
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}>
                  <div className="flex items-center space-x-2">
                    {isAuthorized 
                      ? <div className="bg-green-200 p-1 rounded-full"><Camera className="w-4 h-4 text-green-700" /></div>
                      : <div className="bg-red-200 p-1 rounded-full"><ShieldAlert className="w-4 h-4 text-red-700" /></div>
                    }
                    <span>{authorizationMessage}</span>
                  </div>
                </div>
              )}

              <h2 className="text-xl sm:text-2xl font-bold text-black text-center">Upload Images</h2>
            </div>
            <div className="space-y-4">
              {/* Only show upload section if authorized */}
              {!localStorage.getItem('userEmail') ? (
                <div className="text-center py-8">
                  <div className="bg-red-100 p-6 rounded-lg inline-flex flex-col items-center">
                    <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
                    <p className="text-red-700 mt-2">
                      You need to log in to upload images.
                    </p>
                  </div>
                </div>
              ) : isAuthorized === true ? (
                <>
                  <div className="space-y-4">
                    {/* Upload Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                      {/* Upload Photos Button */}
                      <div className="relative w-full sm:w-1/2">
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                          id="photo-upload"
                          disabled={!isAuthorized || isUploading}
                        />
                        <label
                          htmlFor="photo-upload"
                          className={`flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full cursor-pointer ${(!isAuthorized || isUploading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <UploadIcon className="w-5 h-5 mr-2" />
                          Upload Photos
                        </label>
                      </div>

                      {/* Upload Folder Button */}
                      <div className="relative w-full sm:w-1/2">
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                          id="folder-upload"
                          webkitdirectory=""
                          directory=""
                          disabled={!isAuthorized || isUploading}
                        />
                        <label
                          htmlFor="folder-upload"
                          className={`flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-400 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 w-full cursor-pointer ${(!isAuthorized || isUploading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <UploadIcon className="w-5 h-5 mr-2" />
                          Upload Folder
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Responsive file count and size display */}
                  {images.length > 0 && (
                    <div className="mt-4 bg-blue-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="sm:flex sm:items-center">
                            <span className="font-medium text-blue-600 text-sm block">
                              {images.length} file{images.length !== 1 ? 's' : ''} selected
                            </span>
                            <span className="hidden sm:block mx-2 text-gray-400">•</span>
                            <span className="text-blue-600 text-sm block mt-1 sm:mt-0">
                              Total size: {formatFileSize(totalSize)}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={clearAllFiles}
                          className="ml-3 whitespace-nowrap text-sm px-3 py-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors duration-200 flex-shrink-0"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleUpload}
                    disabled={isUploading || images.length === 0}
                    className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                      isUploading || images.length === 0 
                        ? 'bg-gray-400 cursor-not-allowed opacity-50' 
                        : 'bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                    } transition-colors duration-200`}
                  >
                    {isUploading ? (
                      <span className="flex items-center justify-center">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Uploading {uploadProgress?.current}/{uploadProgress?.total}...
                      </span>
                    ) : images.length === 0 ? (
                      'Select images to upload'
                    ) : (
                      `Upload ${images.length} Image${images.length > 1 ? 's' : ''}`
                    )}
                  </button>

                  {isUploading && uploadProgress && (
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  )}
                </>
              ) : isAuthorized === false ? (
                <div className="text-center py-8">
                  <div className="bg-red-100 p-6 rounded-lg inline-flex flex-col items-center">
                    <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
                    <h3 className="text-lg font-medium text-red-800">Access Denied</h3>
                    <p className="text-red-700 mt-2 max-w-md">
                      You don't have permission to upload images to this event. 
                      Please contact the event organizer to request access.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Please select an event or enter an event code to continue.
                </div>
              )}
            </div>
            
            {/* QR Modal and other existing components */}
            {showQRModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
                <div className="bg-blue-300 rounded-lg p-4 sm:p-6 max-w-sm w-full relative mx-auto mt-20 md:mt-0 mb-20 md:mb-0">
                  <div className="absolute top-2 right-2">
                    <button 
                      onClick={() => setShowQRModal(false)} 
                      className="bg-white rounded-full p-1 text-gray-500 hover:text-gray-700 shadow-md hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex flex-col items-center space-y-4 pt-6">                    
                    <h3 className="text-lg sm:text-xl font-semibold text-center">Share Event</h3>
                    <p className="text-sm text-blue-700 mb-2 text-center px-2">Share this QR code or link with others to let them find their photos</p>
                    <div className="qr-modal relative bg-white p-3 rounded-lg mx-auto flex justify-center">
                      <QRCodeSVG
                        value={`${window.location.origin}/attendee-dashboard?eventId=${selectedEvent}`}
                        size={180}
                        level="H"
                        includeMargin={true}
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                      />
                      <button
                        onClick={() => {
                          const canvas = document.createElement('canvas');
                          const qrCode = document.querySelector('.qr-modal svg');
                          if (!qrCode) return;
                          
                          const serializer = new XMLSerializer();
                          const svgStr = serializer.serializeToString(qrCode);
                          
                          const img = new Image();
                          img.src = 'data:image/svg+xml;base64,' + btoa(svgStr);
                          
                          img.onload = () => {
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return;
                            
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0);
                            
                            canvas.toBlob((blob) => {
                              if (!blob) return;
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `qr-code-${selectedEvent}.png`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }, 'image/png');
                          };
                        }}
                        className="absolute top-0 right-0 -mt-2 -mr-2 p-1 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors"
                        title="Download QR Code"
                      >
                        <Download className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                    <div className="w-full">
                      <div className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/attendee-dashboard?eventId=${selectedEvent}`}
                          className="flex-1 bg-transparent text-sm overflow-hidden text-ellipsis outline-none"
                        />
                        <button 
                          onClick={handleCopyLink} 
                          className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-1 flex-shrink-0"
                        >
                          <Copy className="w-4 h-4" />
                          Copy
                        </button>
                      </div>
                      {showCopySuccess && <p className="text-sm text-green-600 mt-1 text-center">Link copied to clipboard!</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadImage;

// Add image compression function
const compressImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
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
        const maxDimension = MAX_DIMENSION;

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
          0.8 // Compression quality (0.8 = 80%)
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

// Add uploadToS3 function before the UploadImage component
const uploadToS3 = async (file: File, fileName: string): Promise<string> => {
  const { bucketName } = await validateEnvVariables();
  const eventId = localStorage.getItem('currentEventId');
  if (!eventId) {
    throw new Error('No event ID found');
  }
  const key = `events/shared/${eventId}/images/${fileName}`;

  const upload = new Upload({
    client: await s3ClientPromise,
    params: {
      Bucket: bucketName,
      Key: key,
      Body: file,
      ContentType: file.type
    },
    queueSize: 4,
    partSize: 1024 * 1024 * 5, // 5MB per part
    leavePartsOnError: false
  });

  // Handle upload progress
  upload.on('httpUploadProgress', (progress) => {
    const loaded = progress.loaded || 0;
    const total = progress.total || file.size;
    const percentLoaded = Math.round((loaded * 100) / total);
    console.log(`Upload progress for ${fileName}: ${percentLoaded}%`);
  });

  await upload.done();
  return `https://${bucketName}.s3.amazonaws.com/${key}`;
};
