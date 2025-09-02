/**
 * =================================================================================
 * Quick Definition - Background Service Worker
 * =================================================================================
 * This script handles all API communication and data processing.
 * 1. List            apiPromise = fetch(geminiUrl, fetchOpts)
              .then(res => {
                if (!res.ok) {
                  if (res.status === 401) {
                    throw new Error(`Gemini API authentication failed. Please verify your API key is correct and has not expired.`);
                  } else if (res.status === 403) {
                    throw new Error(`Gemini API access denied. Your API key may not have permission to access this service.`);
                  } else if (res.status === 429) {
                    throw new Error(`Gemini API rate limit exceeded. Please wait a moment and try again, or check your API quota.`);
                  } else if (res.status >= 500) {
                    throw new Error(`Gemini API server error (${res.status}). The service is temporarily unavailable, please try again later.`);
                  } else {
                    throw new Error(`Gemini API request failed with status ${res.status}: ${res.statusText}. Please check your internet connection and try again.`);
                  }
                }
                return res.json();
              })
              .then(data => {
                if (data.error) {
                  throw new Error(`Gemini AI error: ${data.error}. Please try a different word or check your API configuration.`);
                }
                return data;
              }),sts from the content script.
 * 2. Checks user settings to determine the dictionary source and display preferences.
 * 3. Fetches data from the appropriate API.
 * 4. Normalizes the data into a single, consistent format.
 * 5. Applies display preferences (scope, example count).
 * 6. Caches the final result and sends it back to the content script.
 */

// Import API configuration
import { API_URLS } from './config/api-config.js';

// --- Context Menu Setup ---

// Create the context menu on install/update
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
  // Do not create immediately; it will be created on-demand per-site in onShown
  // to ensure it doesn't appear on disabled sites.
    });
  } catch (e) {
    // Ignore errors if context menus not available in some environments
    console.warn('Context menu setup error:', e);
  }
});

// Keep a cached copy of enabled sites to drive context menu visibility
let enabledSitesCache = [];
let menuPresent = false;
const MENU_ID = 'definex-lookup';

function createLookupMenu() {
  if (menuPresent) return;
  try {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Look up “%s” with DefineX',
      contexts: ['selection']
    }, () => {
      if (!chrome.runtime.lastError) {
        menuPresent = true;
      }
    });
  } catch (_) { /* no-op */ }
}

function removeLookupMenu() {
  if (!menuPresent) return;
  try {
    chrome.contextMenus.remove(MENU_ID, () => {
      // If remove fails (e.g., already gone), reset flag anyway
      menuPresent = false;
    });
  } catch (_) { menuPresent = false; }
}

// Initialize cache on service worker startup
chrome.storage?.local.get(['enabledSites'], (res) => {
  enabledSitesCache = Array.isArray(res.enabledSites) ? res.enabledSites : [];
});

// Update cache whenever options change
chrome.storage?.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.enabledSites) {
    const newVal = changes.enabledSites.newValue;
    enabledSitesCache = Array.isArray(newVal) ? newVal : [];
    // Re-evaluate menu for current active tab when settings change
    try {
      chrome.tabs?.query?.({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (Array.isArray(tabs) && tabs[0]) updateMenuForTab(tabs[0]);
      });
    } catch (_) { /* no-op */ }
  }
});

// Helper to update menu based on a given tab
function updateMenuForTab(tab) {
  try {
    const url = tab?.url || '';
    let hostname = '';
    try {
      hostname = url ? new URL(url).hostname : '';
    } catch (_) {
      hostname = '';
    }
    const isEnabled = hostname && enabledSitesCache.includes(hostname);
    if (isEnabled) {
      createLookupMenu();
    } else {
      removeLookupMenu();
    }
  } catch (_) {
    removeLookupMenu();
  }
}

// On startup, sync menu for the active tab
try {
  chrome.tabs?.query?.({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (Array.isArray(tabs) && tabs[0]) updateMenuForTab(tabs[0]);
  });
  chrome.runtime?.onStartup?.addListener?.(() => {
    chrome.tabs?.query?.({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (Array.isArray(tabs) && tabs[0]) updateMenuForTab(tabs[0]);
    });
  });
} catch (_) { /* no-op */ }

// Update menu on tab activation and URL changes
try {
  chrome.tabs?.onActivated?.addListener?.(({ tabId }) => {
    chrome.tabs?.get?.(tabId, (tab) => updateMenuForTab(tab));
  });
  chrome.tabs?.onUpdated?.addListener?.((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      updateMenuForTab(tab);
    }
  });
} catch (_) { /* no-op */ }

// Handle context menu clicks
chrome.contextMenus && chrome.contextMenus.onClicked && chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info?.menuItemId === MENU_ID && info.selectionText && tab?.id) {
    // Forward selection to the content script to handle UI and lookup
    chrome.tabs.sendMessage(tab.id, {
      type: 'contextLookup',
      text: info.selectionText
    });
  }
});

// --- Data Normalization Functions ---

function normalizeMwData(mwData) {
  if (!mwData || mwData.length === 0 || typeof mwData[0] !== 'object') { return null; }
  const entry = mwData[0];
  const pronunciation = { lang: 'us', pron: '', url: '' };
  if (entry.hwi && entry.hwi.prs && entry.hwi.prs[0]) {
    pronunciation.pron = `/${entry.hwi.prs[0].mw}/`;
    if (entry.hwi.prs[0].sound) {
      const audioFile = entry.hwi.prs[0].sound.audio;
      const subdir = audioFile.startsWith("bix") ? "bix" : audioFile.startsWith("gg") ? "gg" : audioFile.match(/^_[0-9]/) ? "number" : audioFile.charAt(0);
      pronunciation.url = API_URLS.merriamAudio(subdir, audioFile);
    }
  }
  const definition = { pos: entry.fl || 'unknown', text: entry.shortdef[0] || 'No definition found.', example: [] };
  if (entry.suppl && entry.suppl.examples && entry.suppl.examples.length > 0) {
    const exampleText = entry.suppl.examples[0].t;
    definition.example.push({ text: exampleText.replace(/{it}|{\/it}/g, '') });
  } else if (entry.def && entry.def[0].sseq) {
    try { const firstSense = entry.def[0].sseq[0][0][1]; if (firstSense.dt && Array.isArray(firstSense.dt)) { const visExample = firstSense.dt.find(item => item[0] === 'vis'); if (visExample) { const exampleText = visExample[1][0].t.replace(/{wi}|{\/wi}/g, ''); definition.example.push({ text: exampleText }); } } } catch (e) { console.log("Could not parse 'vis' example from MW data:", e); }
  }
  return { word: entry.meta.id.split(':')[0], pos: [definition.pos], verbs: [], pronunciation: [pronunciation], definition: [definition] };
}

function normalizeGeminiData(aiData) {
  if (!aiData || !aiData.forms || aiData.forms.length === 0) {
    return null;
  }
  
  // Safely handle forms array
  const definitions = aiData.forms.map(form => {
    const firstDef = form.definitions && form.definitions.length > 0 ? form.definitions[0] : {};
    return {
      pos: form.partOfSpeech || 'unknown',
      text: firstDef.definition || 'No definition text found.',
      translation: firstDef.definitionTranslation || null, // Add translation support
      example: firstDef.examples ? firstDef.examples.map(ex => ({
        text: typeof ex === 'string' ? ex : (ex.text || ''),
        translation: typeof ex === 'object' ? ex.translation : null // Add translation support for examples
      })) : []
    };
  });
  
  // Safely handle pronunciation - provide default values if null/undefined
  const pronunciation = { 
    lang: 'us', 
    pron: (aiData.pronunciation && typeof aiData.pronunciation === 'string') ? aiData.pronunciation : '', 
    url: '' 
  };
  
  return {
    word: aiData.word || aiData.phrase || 'Unknown', // Handle both word and phrase properties
    translation: aiData.translation || null, // Add word/phrase translation
    pos: definitions.map(d => d.pos),
    verbs: [],
    pronunciation: [pronunciation],
    definition: definitions
  };
}

// --- Display Preferences Helper ---

function applyDisplayPreferences(data, settings) {
  const scope = settings.definitionScope || 'relevant';
  const count = settings.exampleCount !== undefined ? settings.exampleCount : 1;

  let definitionsToUse = [...data.definition];

  if (scope === 'relevant' && definitionsToUse.length > 1) {
    definitionsToUse = [definitionsToUse[0]];
  }

  const finalDefinitions = definitionsToUse.map(def => {
    const newDef = { ...def };
    if (newDef.example && newDef.example.length > count) {
      newDef.example = newDef.example.slice(0, count);
    }
    return newDef;
  });
  
  return { ...data, definition: finalDefinitions };
}

// --- Main Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getDefinition') {
    const word = message.word.toLowerCase();

    // --- FETCH user settings, now including geminiApiKey ---
    chrome.storage.local.get([
      'preferredSource',
      'mwApiKey',
      'geminiApiKey',           
      'elevenlabsApiKey',      
      'targetLanguage',
      'definitionScope',
      'exampleCount',
      'ttsEnabled'
    ], (settings) => {
      const source = settings.preferredSource || 'cambridge';
      const geminiKey = settings.geminiApiKey;    // <--- added
      const mwApiKey = settings.mwApiKey;
      const elevenlabsApiKey = settings.elevenlabsApiKey; // <--- added
      const targetLanguage = settings.targetLanguage || 'none';
      const cacheKey = `qdp_${source}_${word}_${settings.definitionScope}_${settings.exampleCount}_${targetLanguage}`;

      chrome.storage.local.get(cacheKey, (result) => {
        if (result[cacheKey]) {
          sendResponse({ status: 'success', data: result[cacheKey], ttsEnabled: settings.ttsEnabled, elevenlabsApiKey: elevenlabsApiKey });
          return;
        }

        let apiPromise;

        // Determine if this is a phrase (2–5 words) to optionally override source
        const words = word.split(/\s+/).filter(w => w);
        const isPhrase = words.length >= 2 && words.length <= 5;

        // Phrase fallback: use Gemini definition endpoint when available, regardless of preferred source
        if (isPhrase && geminiKey && geminiKey.trim() && source !== 'gemini') {
          const encodedWord = encodeURIComponent(word);
          const langParam = targetLanguage !== 'none' ? `?lang=${encodeURIComponent(targetLanguage)}` : '';
          const geminiUrl = API_URLS.gemini(word, langParam);
          const fetchOpts = { headers: { 'x-api-key': geminiKey.trim() } };
          apiPromise = fetch(geminiUrl, fetchOpts)
            .then(res => {
              if (!res.ok) {
                if (res.status === 401) {
                  throw new Error(`Gemini API authentication failed. Please verify your API key is correct and has not expired.`);
                } else if (res.status === 403) {
                  throw new Error(`Gemini API access denied. Your API key may not have permission to access this service.`);
                } else if (res.status === 429) {
                  throw new Error(`Gemini API rate limit exceeded. Please wait a moment and try again, or check your API quota.`);
                } else if (res.status >= 500) {
                  throw new Error(`Gemini API server error (${res.status}). The service is temporarily unavailable, please try again later.`);
                } else {
                  throw new Error(`Gemini API request failed with status ${res.status}: ${res.statusText}. Please check your internet connection and try again.`);
                }
              }
              return res.json();
            })
            .then(data => {
              if (data.error) {
                throw new Error(`Gemini AI error: ${data.error}. Please try a different word or check your API configuration.`);
              }
              return normalizeGeminiData(data);
            });
        } else if (source === 'gemini') {
          // --- REQUIRE geminiApiKey ---
          if (!geminiKey || !geminiKey.trim()) {
            sendResponse({ 
              status: 'error', 
              message: 'Gemini AI is selected as your preferred source, but no API key is configured. Please add your Gemini API key in the extension options to use AI-powered definitions and translations.' 
            });
            return;
          }

          const encodedWord = encodeURIComponent(word);
          const langParam = targetLanguage !== 'none' ? `?lang=${encodeURIComponent(targetLanguage)}` : '';
          const geminiUrl = API_URLS.gemini(word, langParam);
          const fetchOpts = { headers: { 'x-api-key': geminiKey.trim() } }; // <--- pass key

          const words = word.split(/\s+/).filter(w => w);
          const isPhrase = words.length > 1;

          if (isPhrase) {
            apiPromise = fetch(geminiUrl, fetchOpts)
              .then(res => {
                if (!res.ok) {
                  throw new Error(`Gemini API returned ${res.status}: ${res.statusText}`);
                }
                return res.json();
              })
              .then(data => {
                if (data.error) {
                  throw new Error(data.error);
                }
                return normalizeGeminiData(data);
              });
          } else {
            const cambridgeUrl = API_URLS.dictionary(word);
            apiPromise = Promise.all([
              fetch(geminiUrl, fetchOpts)
                .then(res => {
                  if (!res.ok) {
                    if (res.status === 401) {
                      throw new Error(`Gemini API authentication failed. Please verify your API key is correct and has not expired.`);
                    } else if (res.status === 403) {
                      throw new Error(`Gemini API access denied. Your API key may not have permission to access this service.`);
                    } else if (res.status === 429) {
                      throw new Error(`Gemini API rate limit exceeded. Please wait a moment and try again, or check your API quota.`);
                    } else if (res.status >= 500) {
                      throw new Error(`Gemini API server error (${res.status}). The service is temporarily unavailable, please try again later.`);
                    } else {
                      throw new Error(`Gemini API request failed with status ${res.status}: ${res.statusText}. Please check your internet connection and try again.`);
                    }
                  }
                  return res.json();
                })
                .then(data => {
                  if (data.error) {
                    throw new Error(`Gemini AI error: ${data.error}. Please try a different word or check your API configuration.`);
                  }
                  return data;
                }),
              fetch(cambridgeUrl).then(res => {
                if (!res.ok) {
                  console.warn(`Cambridge Dictionary API returned ${res.status}: ${res.statusText}`);
                  return res.json().catch(() => null);
                }
                return res.json().catch(() => null);
              })
            ]).then(([geminiData, cambridgeData]) => {
              const normalized = normalizeGeminiData(geminiData);
              if (normalized && cambridgeData?.pronunciation?.length) {
                const camPron = cambridgeData.pronunciation.find(p => p.url) || cambridgeData.pronunciation[0];
                if (camPron && normalized.pronunciation && normalized.pronunciation[0]) {
                  normalized.pronunciation[0].url ||= camPron.url;
                  normalized.pronunciation[0].pron ||= camPron.pron;
                }
              }
              return normalized;
            });
          }

        } else if (source === 'merriam-webster') {
          if (!mwApiKey) {
            sendResponse({ 
              status: 'error', 
              message: 'Merriam-Webster Dictionary is selected as your preferred source, but no API key is configured. Please add your Merriam-Webster API key in the extension options or switch to a different dictionary source.' 
            });
            return;
          }
          const apiUrl = API_URLS.merriamWebster(word, mwApiKey);
          apiPromise = fetch(apiUrl)
            .then(res => {
              if (!res.ok) {
                if (res.status === 401) {
                  throw new Error(`Merriam-Webster API authentication failed. Please verify your API key is correct and has not expired.`);
                } else if (res.status === 403) {
                  throw new Error(`Merriam-Webster API access denied. Your API key may not have permission to access this service.`);
                } else if (res.status === 429) {
                  throw new Error(`Merriam-Webster API rate limit exceeded. Please wait a moment and try again, or check your API quota.`);
                } else if (res.status >= 500) {
                  throw new Error(`Merriam-Webster API server error (${res.status}). The service is temporarily unavailable, please try again later.`);
                } else {
                  throw new Error(`Merriam-Webster API request failed with status ${res.status}: ${res.statusText}. Please check your internet connection and try again.`);
                }
              }
              return res.json();
            })
            .then(data => {
              if (Array.isArray(data) && data.length === 0) {
                throw new Error(`Word "${word}" not found in Merriam-Webster Dictionary. Please check the spelling or try a different dictionary source.`);
              }
              return normalizeMwData(data);
            });
        } else {
          const apiUrl = API_URLS.dictionary(word);
          apiPromise = fetch(apiUrl)
            .then(res => {
              if (!res.ok) {
                if (res.status === 404) {
                  if (word.length == 1) {
                    throw new Error(`Word "${word}" not found in Cambridge Dictionary. Please check the spelling or try a different word.`);
                  } else if (word.length > 1) {
                    throw new Error(`Phrase "${word}" not found in Cambridge Dictionary. Please consider using Gemini as the source.`);
                  }
                } else if (res.status >= 500) {
                  throw new Error(`Cambridge Dictionary API server error (${res.status}). The service is temporarily unavailable, please try again later.`);
                } else {
                  throw new Error(`Cambridge Dictionary API request failed with status ${res.status}: ${res.statusText}. Please check your internet connection and try again.`);
                }
              }
              return res.json();
            });
        }

        apiPromise.then(fullData => {
          if (!fullData || !fullData.word) {
            const errorMsg = isPhrase ? 
              `Unable to find definition for the phrase "${word}". This might be a specialized term or proper noun. Try selecting individual words instead.` :
              `Unable to find definition for "${word}". Please check the spelling, or the word might not be in the selected dictionary source.`;
            throw new Error(errorMsg);
          }
          
          const finalData = applyDisplayPreferences(fullData, settings);
          
          // Check if this is a single word and if TTS should be enabled as fallback
          const words = word.split(/\s+/).filter(w => w);
          const isSingleWord = words.length === 1;
          let enableTtsForWord = false;
          
          // Enable TTS for single words if:
          // 1. TTS is enabled in settings
          // 2. No audio URL is available from Cambridge/other sources
          if (isSingleWord && settings.ttsEnabled && elevenlabsApiKey) {
            const hasAudio = finalData.pronunciation && 
                            finalData.pronunciation.length > 0 && 
                            finalData.pronunciation[0].url && 
                            finalData.pronunciation[0].url.trim() !== '';
            
            if (!hasAudio) {
              enableTtsForWord = true;
            }
          }

          chrome.storage.local.set({ [cacheKey]: finalData });
          sendResponse({ 
            status: 'success', 
            data: finalData, 
            ttsEnabled: settings.ttsEnabled, 
            elevenlabsApiKey: elevenlabsApiKey,
            enableTtsForWord: enableTtsForWord // New flag for single word TTS
          });
        }).catch(err => {
          sendResponse({ status: 'error', message: err.message });
        });
      });
    });

    return true;
  }
  
  if (message.type === 'translateSentence') {
    const sentence = message.text;

    chrome.storage.local.get(['targetLanguage', 'ttsEnabled', 'elevenlabsApiKey', 'geminiApiKey'], (settings) => {
      const targetLanguage = settings.targetLanguage;
      const geminiKey = settings.geminiApiKey;
      
      // Check if no target language is set
      if (!targetLanguage || targetLanguage === 'none') {
        sendResponse({ status: 'noLanguage', message: 'Please select a target language in options setting to proceed' });
        return;
      }
      
      // Ensure Gemini API key is available for translation endpoint
      if (!geminiKey || !geminiKey.trim()) {
        sendResponse({ 
          status: 'error', 
          message: 'Translation requires Gemini AI, but no API key is configured. Please add your Gemini API key in the extension options to enable translation features.' 
        });
        return;
      }
      
      // Use a more robust encoding method that handles Unicode characters
      const encodedSentence = encodeURIComponent(sentence).replace(/[!'()*]/g, function(c) {
        return '%' + c.charCodeAt(0).toString(16);
      });
      const cacheKey = `qdp_sentence_${encodedSentence}_${targetLanguage}`;

      chrome.storage.local.get(cacheKey, (result) => {
        if (result[cacheKey]) {
          console.log(`Found sentence translation in cache.`);
          sendResponse({ status: 'success', data: result[cacheKey], ttsEnabled: settings.ttsEnabled || false, elevenlabsApiKey: settings.elevenlabsApiKey });
          return;
        }

        console.log(`Translating sentence: "${sentence}"`);
        const encodedSentence = encodeURIComponent(sentence);
        const langParam = `?lang=${encodeURIComponent(targetLanguage)}`;
        const translateUrl = API_URLS.translate(sentence, langParam);

        fetch(translateUrl, { headers: { 'x-api-key': geminiKey.trim() } })
          .then(res => {
            if (!res.ok) {
              if (res.status === 401) {
                throw new Error(`Translation failed: Gemini API authentication failed. Please verify your API key is correct and has not expired.`);
              } else if (res.status === 403) {
                throw new Error(`Translation failed: Gemini API access denied. Your API key may not have permission to access the translation service.`);
              } else if (res.status === 429) {
                throw new Error(`Translation failed: Gemini API rate limit exceeded. Please wait a moment and try again, or check your API quota.`);
              } else if (res.status >= 500) {
                throw new Error(`Translation failed: Gemini API server error (${res.status}). The translation service is temporarily unavailable, please try again later.`);
              } else {
                throw new Error(`Translation failed: API request returned status ${res.status}: ${res.statusText}. Please check your internet connection and try again.`);
              }
            }
            return res.json();
          })
          .then(data => {
            if (data.error) {
              if (data.error.includes('language')) {
                throw new Error(`Translation failed: The target language "${targetLanguage}" is not supported or invalid. Please select a different target language in the options.`);
              } else if (data.error.includes('quota') || data.error.includes('limit')) {
                throw new Error(`Translation failed: API quota exceeded. Please check your Gemini API usage limits and try again later.`);
              } else {
                throw new Error(`Translation failed: ${data.error}. Please try again or select a different target language.`);
              }
            }
            
            chrome.storage.local.set({ [cacheKey]: data });
            sendResponse({ status: 'success', data: data, ttsEnabled: settings.ttsEnabled || false, elevenlabsApiKey: settings.elevenlabsApiKey });
          })
          .catch(error => {
            console.error(`Translation Error for sentence:`, error);
            // Provide more specific error messages based on error type
            let userMessage = error.message;
            if (error.message.includes('fetch')) {
              userMessage = `Translation failed: Unable to connect to the translation service. Please check your internet connection and try again.`;
            } else if (error.message.includes('JSON')) {
              userMessage = `Translation failed: Invalid response from translation service. Please try again with a different sentence.`;
            } else if (!error.message.startsWith('Translation failed:')) {
              userMessage = `Translation failed: ${error.message}. Please try again or check your API configuration.`;
            }
            sendResponse({ status: 'error', message: userMessage });
          });
      });
    });

    return true;
  }
  
  if (message.type === 'saveWord') {
    const wordData = message.data || {};
    const text = (wordData.text || '').toString();
    const type = wordData.type || '';
    const pos = (wordData.partOfSpeech || '').toString();

    console.log('Background received saveWord:', { text, type, pos });

    if (!text || !type) {
      sendResponse?.({ status: 'error', message: 'Invalid data provided.' });
      return true;
    }

    chrome.storage.local.get(['savedWords'], (result) => {
      const savedWords = result.savedWords || [];
      console.log('Current saved words count:', savedWords.length);

      // De-duplicate by text + type + partOfSpeech
      const existingIndex = savedWords.findIndex(w => {
        const match = (
          (w.text || '').toLowerCase() === text.toLowerCase() &&
          (w.type || '') === type &&
          ((w.partOfSpeech || '') === pos)
        );
        if (match) {
          console.log('Found existing entry:', w);
        }
        return match;
      });

      console.log('Existing index:', existingIndex);

      if (existingIndex === -1) {
        savedWords.unshift(wordData);
        if (savedWords.length > 1000) savedWords.splice(1000);
        console.log('Adding new word to position 0, new count:', savedWords.length);
        chrome.storage.local.set({ savedWords }, () => {
          console.log('Word saved:', text, pos ? `(${pos})` : '');
          sendResponse?.({ status: 'success' });
        });
      } else {
        savedWords[existingIndex] = { ...savedWords[existingIndex], ...wordData };
        console.log('Updated existing word at index:', existingIndex);
        chrome.storage.local.set({ savedWords }, () => {
          console.log('Word updated:', text, pos ? `(${pos})` : '');
          sendResponse?.({ status: 'success' });
        });
      }
    });
    
    return true;
  }

  if (message.type === 'unsaveWord') {
    const { text, type, partOfSpeech } = message.data || {};
    if (!text || !type) {
      sendResponse?.({ 
        status: 'error', 
        message: 'Unable to save word: Invalid data provided. Please try again.' 
      });
      return true;
    }
    chrome.storage.local.get(['savedWords'], (result) => {
      const savedWords = result.savedWords || [];
      const newList = savedWords.filter((w) => {
        const sameText = (w.text || '').toLowerCase() === text.toLowerCase();
        const sameType = (w.type || '') === type;
        if (partOfSpeech !== undefined) {
          const samePos = (w.partOfSpeech || '') === (partOfSpeech || '');
          return !(sameText && sameType && samePos);
        }
        return !(sameText && sameType);
      });
      chrome.storage.local.set({ savedWords: newList }, () => {
        console.log('Word unsaved successfully:', text);
        sendResponse?.({ status: 'success' });
      });
    });
    return true;
  }
});