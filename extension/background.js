/**
 * =================================================================================
 * Quick Definition - Background Service Worker
 * =================================================================================
 * This script handles all API communication and data processing.
 * 1. Listens for requests from the content script.
 * 2. Checks user settings to determine the dictionary source.
 * 3. Fetches data from the appropriate API.
 * 4. Normalizes the data into a single, consistent format.
 * 5. Caches the result and sends it back to the content script.
 */

// --- Data Normalization ---

/**
 * Normalizes the complex Merriam-Webster API response into our simple, standard format.
 * This ensures the content script can display data from any source without changes.
 * @param {Array} mwData - The raw data array from the MW API.
 * @returns {Object|null} - A standardized definition object, or null if invalid.
 */
function normalizeMwData(mwData) {
  // Handle cases where the word is not found (MW returns an array of string suggestions)
  if (!mwData || mwData.length === 0 || typeof mwData[0] !== 'object') {
    return null;
  }
  const entry = mwData[0];

  // --- Pronunciation and Audio ---
  const pronunciation = { lang: 'us', pron: '', url: '' };
  if (entry.hwi && entry.hwi.prs && entry.hwi.prs[0]) {
    pronunciation.pron = `/${entry.hwi.prs[0].mw}/`;

    if (entry.hwi.prs[0].sound) {
      const audioFile = entry.hwi.prs[0].sound.audio;
      // Determine audio subdirectory based on MW API rules
      const subdir = audioFile.startsWith("bix") ? "bix" :
                   audioFile.startsWith("gg") ? "gg" :
                   audioFile.match(/^_[0-9]/) ? "number" :
                   audioFile.charAt(0);
      pronunciation.url = `https://media.merriam-webster.com/audio/prons/en/us/wav/${subdir}/${audioFile}.wav`;
    }
  }

  // --- Definition, Part of Speech (POS), and Example ---
  const definition = {
    pos: entry.fl || 'unknown', // e.g., "adjective", "noun"
    text: entry.shortdef[0] || 'No definition found.',
    example: [] // Initialize as an empty array
  };

  // --- Example Sentence Extraction (Improved) ---
  // Priority 1: Check the top-level supplemental examples first (cleanest source).
  if (entry.suppl && entry.suppl.examples && entry.suppl.examples.length > 0) {
    const exampleText = entry.suppl.examples[0].t;
    // Clean formatting tags like {it} from the text
    definition.example.push({ text: exampleText.replace(/{it}|{\/it}/g, '') });

  // Priority 2: Fallback to digging inside the main definition for "vis" (verbal illustration).
  } else if (entry.def && entry.def[0].sseq) {
    try { // Use a try-catch because this structure can be missing parts
      const firstSense = entry.def[0].sseq[0][0][1];
      if (firstSense.dt && Array.isArray(firstSense.dt)) {
        const visExample = firstSense.dt.find(item => item[0] === 'vis');
        if (visExample) {
          // Clean formatting tags like {wi} from the text
          const exampleText = visExample[1][0].t.replace(/{wi}|{\/wi}/g, '');
          definition.example.push({ text: exampleText });
        }
      }
    } catch (e) {
      console.log("Could not parse 'vis' example from MW data:", e);
    }
  }

  // --- Final Standardized Object ---
  // This structure should match what the Cambridge API provides.
  return {
    word: entry.meta.id.split(':')[0], // Cleans "word:1" to "word"
    pos: [definition.pos],
    verbs: [], // MW doesn't provide verb conjugations, so send an empty array
    pronunciation: [pronunciation],
    definition: [definition] // An array containing our single definition object
  };
}


// --- Main Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getDefinition') {
    const word = message.word.toLowerCase();
    
    // Get user's preferred source and API key from storage
    chrome.storage.local.get(['preferredSource', 'mwApiKey'], (settings) => {
      const source = settings.preferredSource || 'cambridge';
      const mwApiKey = settings.mwApiKey;
      const cacheKey = `qdp_${source}_${word}`; // Make cache key source-specific

      // 1. Check cache first
      chrome.storage.local.get(cacheKey, (result) => {
        if (result[cacheKey]) {
          console.log(`Found "${word}" in cache for source: ${source}.`);
          sendResponse({ status: 'success', data: result[cacheKey] });
          return;
        }

        // 2. If not in cache, fetch from the selected source
        console.log(`Fetching "${word}" from API source: ${source}`);
        
        let apiPromise;
        if (source === 'merriam-webster') {
          if (!mwApiKey) {
            sendResponse({ status: 'error', message: 'Merriam-Webster API key is not set in options.' });
            return;
          }
          const apiUrl = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${mwApiKey}`;
          apiPromise = fetch(apiUrl)
            .then(res => res.json())
            .then(data => normalizeMwData(data)); // Normalize the complex data

        } else { // Default to Cambridge
          const apiUrl = `http://localhost:3000/api/dictionary/en/${word}`;
          apiPromise = fetch(apiUrl).then(res => res.json());
        }

        // 3. Handle the promise result
        apiPromise.then(data => {
          if (!data || !data.word) {
            throw new Error('Definition not found or API returned invalid format.');
          }
          // Cache the normalized data
          chrome.storage.local.set({ [cacheKey]: data });
          sendResponse({ status: 'success', data: data });
        }).catch(error => {
          console.error(`API Error for "${word}" from ${source}:`, error);
          sendResponse({ status: 'error', message: error.message });
        });
      });
    });

    return true; // This is crucial! It tells Chrome to wait for our async response.
  }
});