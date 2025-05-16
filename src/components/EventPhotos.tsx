import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, Download, X, Share2, Facebook, Twitter, Link, Mail, Instagram, Linkedin, MessageCircle } from 'lucide-react';
import { getAttendeeImagesByUserAndEvent } from '../config/attendeeStorage';
import ProgressiveImage from './ProgressiveImage';
interface ShareMenuState {
  isOpen: boolean;
  imageUrl: string;
  position: {
    top: number;
    left: number;
  };
}

interface Event {
  eventId: string;
  eventName: string;
  eventDate: string;
  coverImage?: string;
}

interface MatchingImage {
  imageId: string;
  eventId: string;
  eventName: string;
  imageUrl: string;
  matchedDate: string;
}

const EventPhotos: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
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
          toggleHeaderFooter(true);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [shareMenu.isOpen]);

  // Toggle header and footer visibility
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
    const fetchEventPhotos = async () => {
      try {
        setLoading(true);
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) {
          navigate('/GoogleLogin');
          return;
        }

        // Get attendee images directly from the Attendee-imgs table for this specific event
        const attendeeData = await getAttendeeImagesByUserAndEvent(userEmail, eventId || '');
        
        if (!attendeeData) {
          console.log('No images found for this event');
          setImages([]);
          setLoading(false);
          return;
        }
        
        // Set event information from the Attendee-imgs table
        setEvent({
          eventId: attendeeData.eventId,
          eventName: attendeeData.eventName || `Event ${attendeeData.eventId}`,
          eventDate: attendeeData.uploadedAt,
          coverImage: attendeeData.coverImage
        });
        
        // Convert the matched images array to MatchingImage objects
        const eventImages = attendeeData.matchedImages.map(url => ({
          imageId: url.split('/').pop() || '',
          eventId: attendeeData.eventId,
          eventName: attendeeData.eventName || `Event ${attendeeData.eventId}`,
          imageUrl: url,
          matchedDate: attendeeData.uploadedAt
        }));

        setImages(eventImages);
      } catch (error) {
        console.error('Error fetching event photos:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEventPhotos();
  }, [eventId, navigate]);

  const handleDownload = async (url: string) => {
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
    <div className="min-h-screen bg-gray-50 pt-20 pb-6 px-4 sm:px-6 lg:px-8">
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
              onClick={() => handleShare('facebook', shareMenu.imageUrl)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Facebook className="h-6 w-6 text-blue-600" />
            </button>
            <button
              onClick={() => handleShare('instagram', shareMenu.imageUrl)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Instagram className="h-6 w-6 text-pink-600" />
            </button>
            <button
              onClick={() => handleShare('twitter', shareMenu.imageUrl)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Twitter className="h-6 w-6 text-blue-400" />
            </button>
            <button
              onClick={() => handleShare('linkedin', shareMenu.imageUrl)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Linkedin className="h-6 w-6 text-blue-700" />
            </button>
            <button
              onClick={() => handleShare('whatsapp', shareMenu.imageUrl)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <MessageCircle className="h-6 w-6 text-green-500" />
            </button>
            <button
              onClick={() => handleShare('email', shareMenu.imageUrl)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Mail className="h-6 w-6 text-gray-600" />
            </button>
            <button
              onClick={() => handleShare('copy', shareMenu.imageUrl)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors col-start-2"
            >
              <Link className="h-6 w-6 text-gray-600" />
            </button>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate('/attendee-dashboard')}
          className="flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </button>
        
        {loading ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading photos...</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-1">
                  {event?.eventName || 'Event Photos'}
                </h1>
                {event && (
                  <p className="text-gray-600">
                    {new Date(event.eventDate).toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                )}
              </div>
              
              {images.length > 0 && (
                <button
                  onClick={handleDownloadAll}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mt-4 md:mt-0 flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download All Photos
                </button>
              )}
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
                            const rect = e.currentTarget.getBoundingClientRect();
                            // Try native sharing first
                            if (typeof navigator.share === 'function') {
                              handleShare('', image.imageUrl, e);
                            } else {
                              // Fall back to custom share menu
                              setShareMenu({
                                isOpen: true,
                                imageUrl: image.imageUrl,
                                position: {
                                  top: rect.top - 200,
                                  left: rect.left - 200
                                }
                              });
                            }
                          }}
                          className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                          title="Share photo"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
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
                <p className="mt-2 text-gray-500">No photos found for this event</p>
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
          </>
        )}
      </div>
    </div>
  );
};

export default EventPhotos;
