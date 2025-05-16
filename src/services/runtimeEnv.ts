interface AppRuntimeEnv {
  VITE_AWS_REGION?: string;
  VITE_S3_BUCKET_NAME?: string;
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

  // Assuming your presign-server.js is running on port 3001 and accessible.
  // Adjust the URL if your backend server is hosted elsewhere during development/production.
  const backendUrl = import.meta.env.DEV ? 'http://localhost:3001' : ''; // Adjust for production

  fetchPromise = fetch(`${backendUrl}/api/runtime-env`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch runtime environment variables: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      runtimeEnv = data as AppRuntimeEnv;
      return runtimeEnv!;
    })
    .catch(error => {
      console.error("Error fetching runtime environment variables:", error);
      // Fallback to an empty object or default configuration on error
      runtimeEnv = {}; 
      return runtimeEnv;
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
  return runtimeEnv ? Promise.resolve(runtimeEnv) : fetchRuntimeEnvFromServer();
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