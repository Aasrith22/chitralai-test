import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill';
import rollupNodePolyFill from 'rollup-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode (e.g., .env.development, .env.production)
  // and .env as a fallback. process.cwd() is the project root.
  // The third argument '' means all env variables are loaded, regardless of VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        'lucide-react': 'lucide-react/dist/esm/lucide-react',
        buffer: 'buffer',
        process: 'rollup-plugin-node-polyfills/polyfills/process-es6',
        util: 'util',
        stream: 'stream-browserify',
        events: 'rollup-plugin-node-polyfills/polyfills/events',
        path: 'rollup-plugin-node-polyfills/polyfills/path',
        querystring: 'rollup-plugin-node-polyfills/polyfills/qs',
        punycode: 'rollup-plugin-node-polyfills/polyfills/punycode'
      }
    },
    optimizeDeps: {
      include: [
        'lucide-react',
        'buffer',
        'rollup-plugin-node-polyfills/polyfills/process-es6',
        'util',
        'stream-browserify'
      ],
      esbuildOptions: {
        define: {
          global: 'globalThis'
        },
        plugins: [
          NodeGlobalsPolyfillPlugin({
            process: true,
            buffer: true
          }),
          NodeModulesPolyfillPlugin()
        ]
      }
    },
    build: {
      rollupOptions: {
        plugins: [rollupNodePolyFill]
      }
    },
    define: {
      'process.env': {},
      'global': 'globalThis',
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(
        process.env.SHELL_VITE_GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID
      )
    },
    server: {
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  };
});
