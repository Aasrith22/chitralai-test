import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getRuntimeEnv } from './src/services/runtimeEnv';

// Make sure the region matches where your table is created
const region = "ap-south-1"; // Replace with your actual region

// Create an asynchronous function to initialize the DynamoDBDocumentClient
async function initializeGoogleAuthDocClient() {
  try {
    const { VITE_AWS_ACCESS_KEY_ID, VITE_AWS_SECRET_ACCESS_KEY } = await getRuntimeEnv();

    if (!VITE_AWS_ACCESS_KEY_ID || !VITE_AWS_SECRET_ACCESS_KEY) {
      throw new Error('Missing AWS credentials in runtime environment');
    }

    const client = new DynamoDBClient({
      region: region,
      credentials: {
        accessKeyId: VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: VITE_AWS_SECRET_ACCESS_KEY,
      },
    });

    // Create a document client for easier interaction with DynamoDB
    return DynamoDBDocumentClient.from(client);
  } catch (error) {
    console.error("Error initializing GoogleAuth DocClient:", error);
    // Propagate the error or return a rejected promise
    throw error; 
  }
}

// Export the promise
export const googleAuthDocClientPromise = initializeGoogleAuthDocClient(); 