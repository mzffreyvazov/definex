/**
 * =================================================================================
 * API Configuration for Chrome Extension
 * =================================================================================
 * This file centralizes all API endpoints and allows easy switching between
 * local development and production environments.
 * 
 * TO SWITCH ENVIRONMENTS:
 * Change the USE_LOCAL_API constant below to true/false
 */

// 🎯 MAIN TOGGLE: Change this to switch environments
const USE_LOCAL_API = false; // Set to true for local development, false for production

// Environment configurations
const API_CONFIG = {
  local: {
    base: 'http://localhost:3000', // Adjust port as needed for your local server
    endpoints: {
      gemini: '/api/gemini',
      dictionary: '/api/dictionary/en',
      translate: '/api/translate',
      tts: '/api/tts'
    }
  },
  production: {
    base: 'http://209.38.36.112',
    endpoints: {
      gemini: '/api/gemini',
      dictionary: '/api/dictionary/en',
      translate: '/api/translate',
      tts: '/api/tts'
    }
  }
};

// External APIs (these don't change based on environment)
const EXTERNAL_APIS = {
  merriamWebster: 'https://www.dictionaryapi.com/api/v3/references/collegiate/json',
  merriamAudio: 'https://media.merriam-webster.com/audio/prons/en/us/wav'
};

// Get current environment config
const currentConfig = USE_LOCAL_API ? API_CONFIG.local : API_CONFIG.production;

/**
 * API URL Builder - Use these functions instead of hardcoded URLs
 */
const API_URLS = {
  // Gemini AI endpoints
  gemini: (word, langParam = '') => `${currentConfig.base}${currentConfig.endpoints.gemini}/${encodeURIComponent(word)}${langParam}`,
  
  // Dictionary endpoints
  dictionary: (word) => `${currentConfig.base}${currentConfig.endpoints.dictionary}/${encodeURIComponent(word)}`,
  
  // Translation endpoints
  translate: (text, langParam) => `${currentConfig.base}${currentConfig.endpoints.translate}/${encodeURIComponent(text)}${langParam}`,
  
  // Text-to-Speech endpoints
  tts: (text) => `${currentConfig.base}${currentConfig.endpoints.tts}/${encodeURIComponent(text)}`,
  
  // External API URLs (unchanged)
  merriamWebster: (word, apiKey) => `${EXTERNAL_APIS.merriamWebster}/${word}?key=${apiKey}`,
  merriamAudio: (subdir, audioFile) => `${EXTERNAL_APIS.merriamAudio}/${subdir}/${audioFile}.wav`
};

// Export as ES modules for Vite/modern Chrome extensions
export { API_URLS, USE_LOCAL_API, currentConfig as API_CONFIG };
