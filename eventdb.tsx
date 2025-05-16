import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { googleAuthDocClientPromise } from './GoogleAuthConfig';

// Define the Events table name
const EVENTS_TABLE = 'Events';

let dbClient;
const initializeDbClient = async () => {
  if (!dbClient) {
    dbClient = await googleAuthDocClientPromise;
  }
  return dbClient;
};

export const storeEventData = async (eventData) => {
  try {
    const client = await initializeDbClient();
    // Make sure the table name exactly matches what's in your AWS console
    const tableName = EVENTS_TABLE;
    
    // Ensure you're connecting to the correct region
    const params = {
      TableName: tableName,
      Item: {
        // Make sure your primary key is included here
        ...eventData,
        // Ensure id is present as that's the primary key
        id: eventData.id || new Date().getTime().toString(),
        // Ensure organizerId is present for the GSI
        organizerId: eventData.organizerId || eventData.userEmail
      },
    };

    const command = new PutCommand(params);
    await client.send(command);
    console.log("Event data stored successfully");
    return true;
  } catch (error) {
    console.error("Error storing event data in DynamoDB:", error);
    return false;
  }
};

export const getAllEvents = async () => {
  const client = await initializeDbClient();
  // ... existing code ...
};

export const getEventById = async (eventId) => {
  const client = await initializeDbClient();
  // ... existing code ...
};

export const createEvent = async (eventData) => {
  const client = await initializeDbClient();
  // ... existing code ...
};

export const updateEvent = async (eventId, eventData) => {
  const client = await initializeDbClient();
  // ... existing code ...
};

export const deleteEvent = async (eventId) => {
  const client = await initializeDbClient();
  // ... existing code ...
}; 