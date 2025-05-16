import 'dotenv/config';
import express from 'express';
import AWS from 'aws-sdk';
import cors from 'cors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const app = express();
app.use(express.json());
app.use(cors());

const s3 = new AWS.S3({
  region: process.env.VITE_AWS_REGION,
  accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
});

const BUCKET = process.env.VITE_S3_BUCKET_NAME;

const dynamoDBClient = new DynamoDBClient({
  region: process.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const USERS_TABLE = 'Users';

app.get('/api/runtime-env', (req, res) => {
  const runtimeVariables = {
    VITE_AWS_REGION: process.env.VITE_AWS_REGION,
    VITE_S3_BUCKET_NAME: process.env.VITE_S3_BUCKET_NAME,
    VITE_AWS_ACCESS_KEY_ID: process.env.VITE_AWS_ACCESS_KEY_ID,
    VITE_AWS_SECRET_ACCESS_KEY: process.env.VITE_AWS_SECRET_ACCESS_KEY,
    // IMPORTANT: Add other NON-SENSITIVE environment variables here.
    // DO NOT add sensitive keys like AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY.
  };
  // Log to backend console for debugging
  console.log('[presign-server.js] /api/runtime-env preparing to send:');
  console.log('[presign-server.js] Region:', runtimeVariables.VITE_AWS_REGION);
  console.log('[presign-server.js] Bucket:', runtimeVariables.VITE_S3_BUCKET_NAME);
  console.log('[presign-server.js] Access Key ID (first 5 chars):', runtimeVariables.VITE_AWS_ACCESS_KEY_ID ? runtimeVariables.VITE_AWS_ACCESS_KEY_ID.substring(0,5) : 'MISSING');
  console.log('[presign-server.js] Secret Key provided:', runtimeVariables.VITE_AWS_SECRET_ACCESS_KEY ? 'Yes' : 'No_MISSING');

  res.json(runtimeVariables);
});

app.post('/api/users', async (req, res) => {
  const userData = req.body;
  if (!userData || !userData.userId) {
    return res.status(400).json({ error: 'Missing user data or userId' });
  }
  try {
    const params = {
      TableName: USERS_TABLE,
      Item: userData,
    };
    await docClient.send(new PutCommand(params));
    res.status(201).json({ message: 'User data stored successfully', userId: userData.userId });
  } catch (err) {
    console.error('Error storing user data in DynamoDB:', err);
    res.status(500).json({ error: 'Failed to store user data', details: err.message });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }
  try {
    const params = {
      TableName: USERS_TABLE,
      Key: { userId: userId },
    };
    const { Item } = await docClient.send(new GetCommand(params));
    if (Item) {
      res.json(Item);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (err) {
    console.error('Error retrieving user data from DynamoDB:', err);
    res.status(500).json({ error: 'Failed to retrieve user data', details: err.message });
  }
});

app.get('/api/users/search/by-email', async (req, res) => {
  const { email } = req.query;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email query parameter is required and must be a string' });
  }

  try {
    const params = {
      TableName: USERS_TABLE,
      KeyConditionExpression: 'email = :emailVal',
      ExpressionAttributeValues: {
        ':emailVal': email,
      },
      Limit: 1
    };

    const { Items } = await docClient.send(new QueryCommand(params));

    if (Items && Items.length > 0) {
      res.json(Items[0]);
    } else {
      res.status(404).json({ message: 'User not found with that email' });
    }
  } catch (err) {
    console.error('Error querying user by email in DynamoDB:', err);
    if (err.name === 'ValidationException') {
        return res.status(400).json({ error: 'Invalid query parameters or table/index configuration.', details: err.message });
    }
    res.status(500).json({ error: 'Failed to query user data', details: err.message });
  }
});

app.post('/api/presign', async (req, res) => {
  const { key, contentType } = req.body;
  if (!key || !contentType) {
    return res.status(400).json({ error: 'Missing key or contentType' });
  }
  try {
    const url = await s3.getSignedUrlPromise('putObject', {
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      Expires: 600
    });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to get organization details by code (from Users table - consider optimizing)
app.get('/api/organizations/by-code/:organizationCode', async (req, res) => {
  const { organizationCode } = req.params;

  if (!organizationCode) {
    return res.status(400).json({ error: 'Organization code is required' });
  }

  console.log(`[Backend] Querying organization by code: ${organizationCode}`);

  try {
    // WARNING: This uses a Scan operation, which is inefficient for large tables.
    // Consider a GSI on 'organizationCode' in the Users table or a separate 'Organizations' table.
    const params = {
      TableName: USERS_TABLE,
      FilterExpression: 'organizationCode = :orgCode',
      ExpressionAttributeValues: {
        ':orgCode': organizationCode,
      },
      // ProjectionExpression: 'organizationCode, organizationName, organizationLogo' // Optional: only fetch needed attributes
    };

    const { Items } = await docClient.send(new ScanCommand(params));

    if (Items && Items.length > 0) {
      const orgUser = Items[0]; // Taking the first user found with this org code
      console.log(`[Backend] Found user for org code ${organizationCode}:`, orgUser);
      res.json({
        organizationCode: orgUser.organizationCode,
        organizationName: orgUser.organizationName,
        organizationLogo: orgUser.organizationLogo,
      });
    } else {
      console.log(`[Backend] No user found for org code ${organizationCode}`);
      res.status(404).json({ message: 'Organization details not found for this code via Users table' });
    }
  } catch (err) {
    console.error('[Backend] Error scanning for organization by code:', err);
    res.status(500).json({ error: 'Failed to retrieve organization details', details: err.message });
  }
});

app.get('/api/google-client-id', (req, res) => {
  res.json({ clientId: process.env.VITE_GOOGLE_CLIENT_ID });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Presign backend running on http://localhost:${PORT}`);
});