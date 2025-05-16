interface AppRuntimeEnv {
  VITE_AWS_REGION?: string;
  VITE_S3_BUCKET_NAME?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  VITE_AWS_ACCESS_KEY_ID?: string;
  VITE_AWS_SECRET_ACCESS_KEY?: string;
  // Define other environment variables that the frontend will fetch
}

let runtimeEnv: AppRuntimeEnv | null = null;
let fetchPromise: Promise<AppRuntimeEnv> | null = null;

async function fetchRuntimeEnvFromServer(): Promise<AppRuntimeEnv> {
  if (runtimeEnv) {
    return runtimeEnv;
  }
  if (fetchPromise) {
    return fetchPromise;
  }

  // Use the API endpoint which will be proxied appropriately
  const apiEndpoint = '/api/runtime-env';

  fetchPromise = fetch(apiEndpoint)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch runtime environment variables: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      // Validate required environment variables
      const requiredVars = [
        'VITE_AWS_REGION',
        'VITE_S3_BUCKET_NAME',
        'VITE_GOOGLE_CLIENT_ID',
        'VITE_AWS_ACCESS_KEY_ID',
        'VITE_AWS_SECRET_ACCESS_KEY'
      ];
      const missingVars = requiredVars.filter(varName => !data[varName]);
      
      if (missingVars.length > 0) {
        console.error('Missing required environment variables:', missingVars);
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }

      runtimeEnv = data as AppRuntimeEnv;
      return runtimeEnv!;
    })
    .catch(error => {
      console.error("Error fetching runtime environment variables:", error);
      throw error;
    })
    .finally(() => {
      fetchPromise = null;
    });
  return fetchPromise;
}

/**
 * Returns a promise that resolves with the runtime environment variables.
 * Fetches from the server on first call and caches the result.
 */
export async function getRuntimeEnv(): Promise<AppRuntimeEnv> {
  try {
    return await fetchRuntimeEnvFromServer();
  } catch (error) {
    console.error('Failed to get runtime environment:', error);
    throw error;
  }
}

/**
 * Optional: A utility function to get a specific environment variable.
 * Returns a promise that resolves with the value of the specified key.
 */
export async function getEnvVar(key: keyof AppRuntimeEnv): Promise<string | undefined> {
  const env = await getRuntimeEnv();
  return env[key];
}

// It's generally better to explicitly initialize or call getRuntimeEnv()
// early in your application's lifecycle (e.g., in your main.tsx or App.tsx)
// rather than triggering the fetch on module import here. 