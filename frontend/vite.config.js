import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        host: '127.0.0.1',
        open: true,
        proxy: {
            // All /api requests are forwarded to the Python backend
            // This means Fyers can redirect to http://127.0.0.1:3000/api/fyers/callback
            // and Vite will proxy it to the backend on port 8000
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
            }
        }
    }
})
