import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClientPromise } from './dynamodb';

// Table name for storing events
export const EVENTS_TABLE = 'Events';

// Interface for event data
export interface EventData {
    id: string;
    name: string;
    date: string;
    description?: string;
    photoCount: number;
    videoCount: number;
    guestCount: number;
    userEmail: string;
    createdAt: string;
    updatedAt: string;
    coverImage?: string;
    organizationCode?: string;
}

// Function to store event data
export const storeEventData = async (eventData: Omit<EventData, 'createdAt' | 'updatedAt'>) => {
    const timestamp = new Date().toISOString();
    
    // Get user data to fetch organization code
    try {
        const { getUserByEmail } = await import('./dynamodb');
        const userData = await getUserByEmail(eventData.userEmail);
        
        const command = new PutCommand({
            TableName: EVENTS_TABLE,
            Item: {
                ...eventData,
                organizationCode: userData?.organizationCode || null,
                createdAt: timestamp,
                updatedAt: timestamp
            }
        });

        await (await docClientPromise).send(command);
        return true;
    } catch (error) {
        console.error('Error storing event data:', error);
        return false;
    }
};

// Function to get user's events
export const getUserEvents = async (userEmail: string) => {
    const command = new QueryCommand({
        TableName: EVENTS_TABLE,
        KeyConditionExpression: 'userEmail = :userEmail',
        ExpressionAttributeValues: {
            ':userEmail': userEmail
        }
    });

    try {
        const response = await (await docClientPromise).send(command);
        return response.Items as EventData[];
    } catch (error) {
        console.error('Error getting user events:', error);
        return [];
    }
};

// Function to get event statistics
export const getEventStatistics = async (userEmail: string) => {
    const events = await getUserEvents(userEmail);
    return events.reduce((stats, event) => ({
        eventCount: stats.eventCount + 1,
        photoCount: stats.photoCount + (event.photoCount || 0),
        videoCount: stats.videoCount + (event.videoCount || 0),
        guestCount: stats.guestCount + (event.guestCount || 0)
    }), {
        eventCount: 0,
        photoCount: 0,
        videoCount: 0,
        guestCount: 0
    });
};

// Function to delete an event
export const deleteEvent = async (eventId: string, userEmail: string): Promise<boolean> => {
    try {
        const command = new DeleteCommand({
            TableName: EVENTS_TABLE,
            Key: {
                userEmail: userEmail,
                id: eventId
            }
        });

        await (await docClientPromise).send(command);
        return true;
    } catch (error) {
        console.error('Error deleting event:', error);
        return false;
    }
};

// Function to get an event by ID
export const getEventById = async (eventId: string): Promise<EventData | null> => {
    try {
        // First we need to scan to find the event since we don't have the userEmail
        const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
        
        const command = new ScanCommand({
            TableName: EVENTS_TABLE,
            FilterExpression: 'id = :id',
            ExpressionAttributeValues: {
                ':id': eventId
            },
            Limit: 1
        });

        const response = await (await docClientPromise).send(command);
        return (response.Items?.[0] as EventData) || null;
    } catch (error) {
        console.error('Error getting event by ID:', error);
        return null;
    }
};