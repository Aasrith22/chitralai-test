import React, { useState, useEffect } from 'react';
import { ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { s3ClientPromise, rekognitionClientPromise, validateEnvVariables } from '../config/aws';
import { DetectFacesCommand, CompareFacesCommand } from '@aws-sdk/client-rekognition';
import { Download, Trash2, Camera } from 'lucide-react';
import { getEventById, updateEventData } from '../config/eventStorage';
import ProgressiveImage from './ProgressiveImage';

interface EventImagesProps {
  eventId: string;
}

interface ProcessedImage {
  url: string;
  key: string;
  hasFace: boolean;
  faceCoordinates?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

const EventImages = ({ eventId }: EventImagesProps) => {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingStatus, setProcessingStatus] = useState('');
  const [deleting, setDeleting] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<ProcessedImage | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const IMAGES_PER_PAGE = 300;
  const [bucketName, setBucketName] = useState<string | undefined>();

  const fetchEventImages = async (pageNum = 1) => {
    try {
      setLoading(true);
      const { bucketName } = await validateEnvVariables();
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `events/shared/${eventId}/images/`,
        MaxKeys: IMAGES_PER_PAGE,
        StartAfter: pageNum > 1 ? `events/shared/${eventId}/images/${(pageNum - 1) * IMAGES_PER_PAGE}` : undefined
      });
  
      const result = await (await s3ClientPromise).send(listCommand);
      if (!result.Contents) {
        setHasMore(false);
        return;
      }
  
      const imageItems = result.Contents
        .filter(item => item.Key && item.Key.match(/\.(jpg|jpeg|png)$/i))
        .map(item => ({
          url: `https://${bucketName}.s3.amazonaws.com/${item.Key}`,
          key: item.Key || '',
          hasFace: false
        }));
  
      setImages(prev => pageNum === 1 ? imageItems : [...prev, ...imageItems]);
      setHasMore(imageItems.length === IMAGES_PER_PAGE);
      setProcessingStatus('');
    } catch (error) {
      console.error('Error fetching event images:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
      fetchEventImages(page + 1);
    }
  };

  const handleDownload = async (image: ProcessedImage) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = image.key.split('/').pop() || 'image';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  const handleDelete = async (image: ProcessedImage) => {
    try {
      setDeleting(prev => [...prev, image.key]);
      const { bucketName } = await validateEnvVariables();
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: image.key
      });
      await (await s3ClientPromise).send(deleteCommand);
      setImages(prev => prev.filter(img => img.key !== image.key));
      
      // Also update the photoCount in DynamoDB (decrement by 1)
      const userEmail = localStorage.getItem('userEmail');
      if (userEmail) {
        const currentEvent = await getEventById(eventId);
        if (currentEvent && currentEvent.photoCount > 0) {
          await updateEventData(eventId, userEmail, {
            photoCount: currentEvent.photoCount - 1
          });
        }
      }
    } catch (error) {
      console.error('Error deleting image:', error);
    } finally {
      setDeleting(prev => prev.filter(key => key !== image.key));
    }
  };
  
  // Image compression utility
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
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
  
    setProcessingStatus('Preparing images for upload...');
    const files = Array.from(e.target.files);
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      setProcessingStatus('Error: User not authenticated');
      return;
    }
  
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Compress image before upload
        const compressedFile = await compressImage(file);
        const { bucketName } = await validateEnvVariables();
        const key = `events/${eventId}/images/${Date.now()}-${file.name}`;
        
        setProcessingStatus(`Uploading image ${i + 1} of ${files.length}...`);
        
        const upload = new Upload({
          client: await s3ClientPromise,
          params: {
            Bucket: bucketName,
            Key: key,
            Body: compressedFile,
            ContentType: file.type,
            CacheControl: 'max-age=31536000' // Cache for 1 year
          },
          queueSize: 4,
          partSize: 1024 * 1024 * 5,
          leavePartsOnError: false
        });
  
        await upload.done();
      }
      
      // Update the photoCount in DynamoDB
      const currentEvent = await getEventById(eventId);
      if (currentEvent) {
        await updateEventData(eventId, userEmail, {
          photoCount: (currentEvent.photoCount || 0) + files.length
        });
      }
  
      // Refresh only the latest page of images
      await fetchEventImages(page);
      setProcessingStatus('Upload complete!');
      setTimeout(() => setProcessingStatus(''), 2000);
    } catch (error) {
      console.error('Error uploading images:', error);
      setProcessingStatus('Error uploading images. Please try again.');
    }
  };

  useEffect(() => {
    fetchEventImages();
  }, [eventId]);

  useEffect(() => {
    const fetchBucketName = async () => {
      const env = await validateEnvVariables();
      setBucketName(env.bucketName);
    };
    fetchBucketName();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-gray-50 rounded-lg">
        <div className="text-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading event images...</p>
        </div>
      </div>
    );
  }

  const ImageGrid = () => {
    if (bucketName === undefined) {
      return <div>Loading image resources...</div>;
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {images.map((image, index) => (
          <div key={image.key} className="relative group">
            <ProgressiveImage
              compressedSrc={`https://${bucketName}.s3.amazonaws.com/compressed/${eventId}/${image.key.split('/').pop()}`}
              originalSrc={image.url}
              alt={`Event photo ${index + 1}`}
              className="w-full h-32 sm:h-48 object-cover rounded-lg shadow-md transition-transform duration-200 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-200 rounded-lg flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
              <button
                onClick={() => handleDownload(image)}
                className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors duration-200"
                title="Download image"
              >
                <Download className="w-4 h-4 text-gray-700" />
              </button>
              <button
                onClick={() => handleDelete(image)}
                className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors duration-200"
                disabled={deleting.includes(image.key)}
                title="Delete image"
              >
                <Trash2 className="w-4 h-4 text-blue-500" />
              </button>
            </div>
            {deleting.includes(image.key) && (
              <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Event Photos</h2>
        <label className="cursor-pointer bg-primary text-white py-2 px-3 sm:px-4 rounded-lg hover:bg-secondary transition-colors duration-200 flex items-center text-sm sm:text-base whitespace-nowrap w-full sm:w-auto justify-center">
          <Camera className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          Upload Photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
        </label>
      </div>
      {processingStatus && (
        <div className="bg-blue-50 text-blue-700 p-3 rounded-lg mb-4">
          {processingStatus}
        </div>
      )}
      <ImageGrid />
      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={loadMore}
            disabled={loading}
            className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-secondary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
};

export default EventImages;