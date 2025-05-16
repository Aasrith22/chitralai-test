import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { getRuntimeEnv } from '../services/runtimeEnv';

let s3ClientInstance: S3Client | null = null;
let rekognitionClientInstance: RekognitionClient | null = null;
let s3ClientInitializationPromise: Promise<S3Client> | null = null;
let rekognitionClientInitializationPromise: Promise<RekognitionClient> | null = null;

async function initializeS3Client(): Promise<S3Client> {
  if (s3ClientInstance) return s3ClientInstance;
  if (s3ClientInitializationPromise) return s3ClientInitializationPromise;

  s3ClientInitializationPromise = (async () => {
    const env = await getRuntimeEnv();
    if (!env.VITE_AWS_REGION || !env.VITE_AWS_ACCESS_KEY_ID || !env.VITE_AWS_SECRET_ACCESS_KEY || !env.VITE_S3_BUCKET_NAME) {
      console.error('[aws.tsx] Missing required environment variables for S3: AWS Region, Access Key ID, Secret Access Key, S3 Bucket Name');
      throw new Error('Missing required environment variables for S3');
    }
    console.log('[DEBUG] aws.tsx: Initializing S3 Client with:');
    console.log('[DEBUG] aws.tsx: Region:', env.VITE_AWS_REGION);
    console.log('[DEBUG] aws.tsx: S3 Bucket Name:', env.VITE_S3_BUCKET_NAME);
    console.log('[DEBUG] aws.tsx: Access Key ID (S3 - first 5 chars):', env.VITE_AWS_ACCESS_KEY_ID ? env.VITE_AWS_ACCESS_KEY_ID.substring(0, 5) : 'MISSING');
    console.log('[DEBUG] aws.tsx: Secret Access Key provided (S3):', env.VITE_AWS_SECRET_ACCESS_KEY ? 'Yes' : 'No_MISSING');

    s3ClientInstance = new S3Client({
      region: env.VITE_AWS_REGION,
      credentials: {
        accessKeyId: env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: env.VITE_AWS_SECRET_ACCESS_KEY
      },
      forcePathStyle: false
    });
    return s3ClientInstance;
  })();
  return s3ClientInitializationPromise;
}

async function initializeRekognitionClient(): Promise<RekognitionClient> {
  if (rekognitionClientInstance) return rekognitionClientInstance;
  if (rekognitionClientInitializationPromise) return rekognitionClientInitializationPromise;

  rekognitionClientInitializationPromise = (async () => {
    const env = await getRuntimeEnv();
    if (!env.VITE_AWS_REGION || !env.VITE_AWS_ACCESS_KEY_ID || !env.VITE_AWS_SECRET_ACCESS_KEY) {
      console.error('[aws.tsx] Missing required environment variables for Rekognition: AWS Region, Access Key ID, Secret Access Key');
      throw new Error('Missing required environment variables for Rekognition');
    }
    console.log('[DEBUG] aws.tsx: Initializing Rekognition Client with:');
    console.log('[DEBUG] aws.tsx: Region:', env.VITE_AWS_REGION);
    console.log('[DEBUG] aws.tsx: Access Key ID (Rekognition - first 5 chars):', env.VITE_AWS_ACCESS_KEY_ID ? env.VITE_AWS_ACCESS_KEY_ID.substring(0, 5) : 'MISSING');
    console.log('[DEBUG] aws.tsx: Secret Access Key provided (Rekognition):', env.VITE_AWS_SECRET_ACCESS_KEY ? 'Yes' : 'No_MISSING');

    rekognitionClientInstance = new RekognitionClient({
      region: env.VITE_AWS_REGION,
      credentials: {
        accessKeyId: env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: env.VITE_AWS_SECRET_ACCESS_KEY
      }
    });
    return rekognitionClientInstance;
  })();
  return rekognitionClientInitializationPromise;
}

export const s3ClientPromise = initializeS3Client();
export const rekognitionClientPromise = initializeRekognitionClient();

// Development mode check
export const isDevelopment = import.meta.env.DEV || false;

// Validate required environment variables
const validateEnvVariables = async () => {
    const env = await getRuntimeEnv();
    const requiredVars = {
        'AWS Access Key ID': env.VITE_AWS_ACCESS_KEY_ID,
        'AWS Secret Access Key': env.VITE_AWS_SECRET_ACCESS_KEY,
        'S3 Bucket Name': env.VITE_S3_BUCKET_NAME
    };

    const missingVars = Object.entries(requiredVars)
        .filter(([_, value]) => !value)
        .map(([name]) => name);

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return {
        accessKeyId: env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: env.VITE_AWS_SECRET_ACCESS_KEY,
        bucketName: env.VITE_S3_BUCKET_NAME
    };
};

// Helper function to ensure folder structure exists
export const ensureFolderStructure = async (userId: string) => {
    try {
        // Create the folder structure by creating a zero-byte object
        const { bucketName } = await validateEnvVariables();
        const folderKey = `users/${userId}/logo/`;
        const s3Client = await s3ClientPromise;
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: folderKey,
            Body: '',
            ContentLength: 0
        });

        await s3Client.send(command);
        console.log('Created folder structure:', folderKey);
        return true;
    } catch (error) {
        console.error('Error creating folder structure:', error);
        return false;
    }
};

// Helper function to generate organization logo path
export const getOrganizationLogoPath = (userId: string, filename: string): string => {
    // Ensure the path follows the exact structure: users/{userId}/logo/{originalFilename}
    return `users/${userId}/logo/${filename}`;
};

// Helper function to get full S3 URL for organization logo
export const getOrganizationLogoUrl = async (userId: string, filename: string): Promise<string> => {
    const { bucketName } = await validateEnvVariables();
    const s3Client = await s3ClientPromise;
    return `https://${bucketName}.s3.amazonaws.com/${getOrganizationLogoPath(userId, filename)}`;
};

// Helper function to get folder path for organization
export const getOrganizationFolderPath = (userId: string): string => {
    return `users/${userId}/logo/`;
};

export default s3ClientPromise;
export { validateEnvVariables };