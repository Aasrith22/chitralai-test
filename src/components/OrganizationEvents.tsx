import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ImageIcon, ArrowLeft } from 'lucide-react';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { CompareFacesCommand } from '@aws-sdk/client-rekognition';
import { s3ClientPromise, rekognitionClientPromise, validateEnvVariables } from '../config/aws';
import { getEventsViaUserByOrgCode, storeAttendeeImageData, getAttendeeSelfieURL, getMatchedImages } from '../config/dynamodb';
import { UserContext } from '../App';

interface Event {
  id: string;
  name: string;
  date: string;
  coverImage: string;
  thumbnailUrl: string;
}

interface OrganizationEventsProps {
  organizationCode: string;
  organizationName: string;
  onBack: () => void;
}

const OrganizationEvents: React.FC<OrganizationEventsProps> = ({
  organizationCode,
  organizationName,
  onBack
}) => {
  const { userEmail } = useContext(UserContext);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const orgEvents = await getEventsViaUserByOrgCode(organizationCode);
        setEvents(orgEvents);
      } catch (error) {
        console.error('Error loading events:', error);
        setError('Failed to load events');
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, [organizationCode]);

  const handleViewPhotos = async (event: Event) => {
    if (!userEmail) {
      setError('Please sign in to view photos');
      return;
    }

    try {
      setProcessingStatus('Checking for your photos...');
      
      // First, check if we already have matched images for this user and event
      const existingMatches = await getMatchedImages(userEmail, event.id);
      
      if (existingMatches && existingMatches.matchedImages && existingMatches.matchedImages.length > 0) {
        // If we have existing matches, navigate directly to the photos page
        navigate(`/event-photos/${event.id}`);
        return;
      }

      // If no existing matches, proceed with face comparison
      setProcessingStatus('Finding your photos...');
      const selfieUrl = await getAttendeeSelfieURL(userEmail);
      
      if (!selfieUrl) {
        throw new Error('No selfie found. Please update your selfie first.');
      }

      // Extract the S3 key from the selfie URL
      const { bucketName } = await validateEnvVariables();
      let selfiePath = '';
      
      if (selfieUrl.startsWith(`https://${bucketName}.s3.amazonaws.com/`)) {
        selfiePath = selfieUrl.substring(`https://${bucketName}.s3.amazonaws.com/`.length);
      } else {
        throw new Error('Invalid selfie format. Please update your selfie first.');
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
        throw new Error('No images found in this event.');
      }
      
      // Compare faces in batches
      const batchSize = 70;
      const results: { url: string; similarity: number }[] = [];
      let processedCount = 0;
      let matchedCount = 0;
      
      for (let i = 0; i < allImageKeys.length; i += batchSize) {
        const batch = allImageKeys.slice(i, i + batchSize);
        const batchPromises = batch.map(async (targetKey) => {
          try {
            const compareCommand = new CompareFacesCommand({
              SourceImage: {
                S3Object: {
                  Bucket: bucketName,
                  Name: selfiePath
                }
              },
              TargetImage: {
                S3Object: {
                  Bucket: bucketName,
                  Name: targetKey
                }
              },
              SimilarityThreshold: 80
            });
            
            const compareResponse = await (await rekognitionClientPromise).send(compareCommand);
            
            if (compareResponse.FaceMatches && compareResponse.FaceMatches.length > 0) {
              const imageUrl = `https://${bucketName}.s3.amazonaws.com/${targetKey}`;
              const similarity = compareResponse.FaceMatches[0].Similarity || 0;
              return { url: imageUrl, similarity };
            }
            return null;
          } catch (error) {
            console.error('Error comparing faces:', error);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((result): result is { url: string; similarity: number } => result !== null);
        results.push(...validResults);
        
        processedCount += batch.length;
        matchedCount += validResults.length;
        setProcessingStatus(`Found ${matchedCount} photos (${Math.round((processedCount / allImageKeys.length) * 100)}% complete)...`);
      }
      
      // Store the matched images in DynamoDB
      await storeAttendeeImageData({
        userId: userEmail,
        eventId: event.id,
        eventName: event.name,
        coverImage: event.coverImage,
        selfieURL: selfieUrl,
        matchedImages: results.map(r => r.url),
        uploadedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });
      
      // Navigate to the photos page
      navigate(`/event-photos/${event.id}`);
      
    } catch (error: any) {
      console.error('Error processing photos:', error);
      setError(error.message || 'Failed to process photos');
    } finally {
      setProcessingStatus(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={onBack}
              className="flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Organizations
            </button>
            <h1 className="text-3xl font-bold text-gray-900">{organizationName} Events</h1>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8">
            {error}
          </div>
        )}

        {processingStatus && (
          <div className="bg-blue-50 text-blue-600 p-4 rounded-lg mb-8 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
            {processingStatus}
          </div>
        )}

        {events.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No events found for this organization</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
              >
                {/* Cover Image Container with Fixed Height */}
                <div className="relative h-40 sm:h-48 w-full overflow-hidden">
                  <img
                    src={event.thumbnailUrl}
                    alt={event.name}
                    className="absolute inset-0 w-full h-full object-cover transform hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                {/* Event Details Container */}
                <div className="p-3 sm:p-4">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1 line-clamp-2">
                    {event.name}
                  </h3>
                  <div className="flex flex-col space-y-2">
                    <p className="text-xs sm:text-sm text-gray-600 flex items-center">
                      <Calendar className="w-3 sm:w-4 h-3 sm:h-4 mr-1 sm:mr-1.5" />
                      {new Date(event.date).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                    
                    {/* View Photos Button */}
                    <button
                      onClick={() => handleViewPhotos(event)}
                      className="w-full mt-1 sm:mt-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                      disabled={!!processingStatus}
                    >
                      <ImageIcon className="w-3 sm:w-4 h-3 sm:h-4 mr-1 sm:mr-2" />
                      <span className="text-xs sm:text-sm font-medium">
                        {processingStatus ? 'Processing...' : 'View Photos'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrganizationEvents;
