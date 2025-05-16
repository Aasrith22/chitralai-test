import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image as ImageIcon, ArrowLeft, Download, X, Share2, Facebook, Twitter, Link, Mail, Instagram, Linkedin, MessageCircle } from 'lucide-react';
import ProgressiveImage from './ProgressiveImage';

interface ShareMenuState {
  isOpen: boolean;
  imageUrl: string;
  position: {
    top: number;
    left: number;
  };
}
import { getAllAttendeeImagesByUser } from '../config/attendeeStorage';

interface MatchingImage {
  imageId: string;
  eventId: string;
  eventName: string;
  imageUrl: string;
  matchedDate: string;
}

const MyPhotos: React.FC = () => {
  const navigate = useNavigate();
  const [images, setImages] = useState<MatchingImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<MatchingImage | null>(null);
  const [shareMenu, setShareMenu] = useState<ShareMenuState>({
    isOpen: false,
    imageUrl: '',
    position: { top: 0, left: 0 }
  });

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

  useEffect(() => {
    const fetchUserPhotos = async () => {
      try {
        setLoading(true);
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) {
          navigate('/GoogleLogin');
          return;
        }

        // Get all attendee images
        const attendeeImageData = await getAllAttendeeImagesByUser(userEmail);
        
        // Extract all images
        const allImages: MatchingImage[] = [];
        
        // Process each attendee-event entry sequentially to get event details
        for (const data of attendeeImageData) {
          // Get event details from the events database
          const { getEventById } = await import('../config/eventStorage');
          const eventDetails = await getEventById(data.eventId);
          
          // Default event name and date if details not found
          const eventName = eventDetails?.name || `Event ${data.eventId}`;
          
          // Add all matched images to the images list
          data.matchedImages.forEach(imageUrl => {
            allImages.push({
              imageId: imageUrl.split('/').pop() || '',
              eventId: data.eventId,
              eventName: eventName,
              imageUrl: imageUrl,
              matchedDate: data.uploadedAt
            });
          });
        }

        // Sort images by date (newest first)
        allImages.sort((a, b) => new Date(b.matchedDate).getTime() - new Date(a.matchedDate).getTime());
        
        setImages(allImages);
      } catch (error) {
        console.error('Error fetching user photos:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserPhotos();
  }, [navigate]);

  const handleDownload = async (url: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    try {
      // Fetch the image with appropriate headers
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
      for (const image of images) {
        await handleDownload(image.imageUrl);
        // Add a small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Error downloading all images:', error);
      alert('Some downloads may have failed. Please try downloading individual photos.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading photos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-6 px-4 sm:px-6 lg:px-8">
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
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate('/attendee-dashboard')}
            className="text-blue-600 hover:text-blue-800 flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </button>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Photos</h1>
              <p className="mt-2 text-gray-600">
                All your photos from all events
              </p>
            </div>
            {images.length > 0 && (
              <button
                onClick={handleDownloadAll}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="h-4 w-4 mr-2" />
                Download All
              </button>
            )}
          </div>
        </div>

        {images.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((image) => (
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
                    alt={`Photo from ${image.eventName}`}
                    className="object-cover w-full h-full"
                  />
                  <div className="absolute top-2 right-2 flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(image.imageUrl);
                      }}
                      className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                      title="Download photo"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <ImageIcon className="h-12 w-12 text-gray-400 mx-auto" />
            <p className="mt-2 text-gray-500">No photos found</p>
            <p className="mt-2 text-sm text-gray-500">Enter an event code in the dashboard to find your photos</p>
          </div>
        )}
        
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
                    handleDownload(selectedImage.imageUrl, e);
                  }}
                  className="p-2 rounded-full bg-black/10 text-white hover:bg-black/70 transition-colors duration-200 flex items-center gap-2"
                >
                  <Download className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPhotos;
