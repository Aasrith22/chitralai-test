import { docClientPromise } from './dynamodb';
import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Table name for storing attendee images and matching details
export const ATTENDEE_IMGS_TABLE = 'Attendee-imgs';

// Interface for attendee image data
export interface AttendeeImageData {
  userId: string;
  eventId: string;
  eventName?: string;
  coverImage?: string;
  selfieURL: string;
  matchedImages: string[];
  uploadedAt: string;
  lastUpdated: string;
}

/**
 * Stores or updates an attendee's image data including selfie and matched images
 * @param data The attendee image data to store
 * @returns Boolean indicating success/failure
 */
export const storeAttendeeImageData = async (data: AttendeeImageData): Promise<boolean> => {
  try {
    // Check if a record already exists for this user and event
    const existingData = await getAttendeeImagesByUserAndEvent(data.userId, data.eventId);
    
    if (existingData) {
      console.log('Existing record found, updating:', existingData);
      
      // Merge the existing matched images with new ones to avoid duplicates
      const allMatchedImages = new Set([...existingData.matchedImages, ...data.matchedImages]);
      
      // Update the record
      const updateCommand = new UpdateCommand({
        TableName: ATTENDEE_IMGS_TABLE,
        Key: {
          userId: data.userId,
          eventId: data.eventId
        },
        UpdateExpression: 'SET selfieURL = :selfieURL, matchedImages = :matchedImages, lastUpdated = :lastUpdated, eventName = :eventName, coverImage = :coverImage',
        ExpressionAttributeValues: {
          ':selfieURL': data.selfieURL,
          ':matchedImages': Array.from(allMatchedImages),
          ':lastUpdated': new Date().toISOString(),
          ':eventName': data.eventName || existingData.eventName,
          ':coverImage': data.coverImage || existingData.coverImage
        }
      });
      
      await (await docClientPromise).send(updateCommand);
      return true;
    }
    
    // If no existing record, create a new one
    const command = new PutCommand({
      TableName: ATTENDEE_IMGS_TABLE,
      Item: {
        userId: data.userId,
        eventId: data.eventId,
        eventName: data.eventName,
        coverImage: data.coverImage,
        selfieURL: data.selfieURL,
        matchedImages: data.matchedImages,
        uploadedAt: data.uploadedAt,
        lastUpdated: data.lastUpdated
      }
    });
    
    await (await docClientPromise).send(command);
    return true;
  } catch (error) {
    console.error('Error storing attendee image data:', error);
    return false;
  }
};

/**
 * Gets all image data for a specific attendee and event
 * @param userId The unique identifier for the user
 * @param eventId The event code/id
 * @returns The attendee image data or null if not found
 */
export const getAttendeeImagesByUserAndEvent = async (userId: string, eventId: string): Promise<AttendeeImageData | null> => {
  try {
    const command = new GetCommand({
      TableName: ATTENDEE_IMGS_TABLE,
      Key: {
        userId: userId,
        eventId: eventId
      }
    });
    
    const response = await (await docClientPromise).send(command);
    return response.Item as AttendeeImageData || null;
  } catch (error) {
    console.error('Error getting attendee image data:', error);
    return null;
  }
};

/**
 * Gets all image data for a specific attendee across all events
 * @param userId The unique identifier for the user
 * @returns An array of attendee image data
 */
export const getAllAttendeeImagesByUser = async (userId: string): Promise<AttendeeImageData[]> => {
  try {
    const command = new QueryCommand({
      TableName: ATTENDEE_IMGS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });
    
    const response = await (await docClientPromise).send(command);
    return response.Items as AttendeeImageData[] || [];
  } catch (error) {
    console.error('Error querying attendee image data:', error);
    return [];
  }
};

/**
 * Gets all image data for a specific event across all attendees
 * @param eventId The event code/id
 * @returns An array of attendee image data
 */
export const getAllAttendeeImagesByEvent = async (eventId: string): Promise<AttendeeImageData[]> => {
  try {
    // For this query, we need a GSI (Global Secondary Index) on eventId
    // Assuming there's a GSI named 'EventIndex'
    const command = new QueryCommand({
      TableName: ATTENDEE_IMGS_TABLE,
      IndexName: 'EventIndex',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      }
    });
    
    const response = await (await docClientPromise).send(command);
    return response.Items as AttendeeImageData[] || [];
  } catch (error) {
    console.error('Error querying attendee image data by event:', error);
    return [];
  }
};

/**
 * Gets distinct events attended by a user
 * @param userId The unique identifier for the user
 * @returns An array of event IDs the user has attended
 */
export const getDistinctAttendedEvents = async (userId: string): Promise<string[]> => {
  try {
    const attendeeData = await getAllAttendeeImagesByUser(userId);
    
    // Extract unique event IDs
    const uniqueEventIds = new Set<string>();
    attendeeData.forEach(data => {
      uniqueEventIds.add(data.eventId);
    });
    
    return Array.from(uniqueEventIds);
  } catch (error) {
    console.error('Error getting distinct attended events:', error);
    return [];
  }
};

/**
 * Gets statistics about a user's attended events
 * @param userId The unique identifier for the user
 * @returns Statistics object with counts of events, images, etc.
 */
export const getAttendeeStatistics = async (userId: string): Promise<{
  totalEvents: number;
  totalImages: number;
  firstEventDate: string | null;
  latestEventDate: string | null;
}> => {
  try {
    const attendeeData = await getAllAttendeeImagesByUser(userId);
    
    if (attendeeData.length === 0) {
      return {
        totalEvents: 0,
        totalImages: 0,
        firstEventDate: null,
        latestEventDate: null
      };
    }
    
    // Count unique events
    const uniqueEventIds = new Set<string>();
    let totalImageCount = 0;
    let dates: string[] = [];
    
    attendeeData.forEach(data => {
      // Don't count entries with eventId 'default'
      if (data.eventId !== 'default') {
        uniqueEventIds.add(data.eventId);
        totalImageCount += data.matchedImages.length;
        dates.push(data.uploadedAt);
      }
    });
    
    // Sort dates
    dates.sort();
    
    return {
      totalEvents: uniqueEventIds.size,
      totalImages: totalImageCount,
      firstEventDate: dates[0],
      latestEventDate: dates[dates.length - 1]
    };
  } catch (error) {
    console.error('Error getting attendee statistics:', error);
    return {
      totalEvents: 0,
      totalImages: 0,
      firstEventDate: null,
      latestEventDate: null
    };
  }
};

/**
 * Updates a user's selfie URL across all their events in the database
 * @param userId The unique identifier for the user
 * @param newSelfieURL The new selfie URL to be used
 * @returns Boolean indicating success/failure
 */
export const updateUserSelfieURL = async (userId: string, newSelfieURL: string): Promise<boolean> => {
  try {
    // Get all events for this user
    const attendeeData = await getAllAttendeeImagesByUser(userId);
    
    if (attendeeData.length === 0) {
      console.log('No events found for this user to update selfie');
      return false;
    }
    
    // Update each event record with the new selfie URL
    const updatePromises = attendeeData.map(async (data) => {
      const updateCommand = new UpdateCommand({
        TableName: ATTENDEE_IMGS_TABLE,
        Key: {
          userId: userId,
          eventId: data.eventId
        },
        UpdateExpression: 'SET selfieURL = :selfieURL, lastUpdated = :lastUpdated',
        ExpressionAttributeValues: {
          ':selfieURL': newSelfieURL,
          ':lastUpdated': new Date().toISOString()
        }
      });
      
      return (await docClientPromise).send(updateCommand);
    });
    
    // Execute all updates in parallel
    await Promise.all(updatePromises);
    console.log(`Successfully updated selfie URL for user ${userId} across ${attendeeData.length} events`);
    
    return true;
  } catch (error) {
    console.error('Error updating user selfie URL:', error);
    return false;
  }
};

/**
 * Stores a user's default selfie URL in a special record that doesn't belong to any specific event
 * This is useful for users who haven't attended any events yet but want to set their selfie
 * @param userId The unique identifier for the user
 * @param selfieURL The selfie URL to store
 * @returns Boolean indicating success/failure
 */
export const storeUserDefaultSelfie = async (userId: string, selfieURL: string): Promise<boolean> => {
  try {
    // Use a special 'default' event ID for the user's default selfie
    const command = new PutCommand({
      TableName: ATTENDEE_IMGS_TABLE,
      Item: {
        userId: userId,
        eventId: 'default',
        eventName: 'Default Profile',
        coverImage: null,
        selfieURL: selfieURL,
        matchedImages: [],
        uploadedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    });
    
    await (await docClientPromise).send(command);
    return true;
  } catch (error) {
    console.error('Error storing user default selfie:', error);
    return false;
  }
};

/**
 * Gets a user's default selfie URL
 * @param userId The unique identifier for the user
 * @returns The selfie URL or null if not found
 */
export const getUserDefaultSelfie = async (userId: string): Promise<string | null> => {
  try {
    const command = new GetCommand({
      TableName: ATTENDEE_IMGS_TABLE,
      Key: {
        userId: userId,
        eventId: 'default'
      }
    });
    
    const response = await (await docClientPromise).send(command);
    return response.Item?.selfieURL || null;
  } catch (error) {
    console.error('Error getting user default selfie:', error);
    return null;
  }
}; 
