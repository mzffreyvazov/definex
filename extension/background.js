// --- Data Normalization ---

/**
 * Normalizes the complex Merriam-Webster API response into our simple, standard format.
 * @param {Array} mwData - The raw data array from the MW API.
 * @returns {Object|null} - A standardized definition object, or null if invalid.
 */
function normalizeMwData(mwData) {
  if (!mwData || mwData.length === 0 || typeof mwData[0] !== 'object') {
    // This happens if the word is not found and MW returns an array of suggestions (strings)
    return null;
  }
  const entry = mwData[0];

  // --- Pronunciation and Audio ---
  let pronunciation = { lang: 'us', pron: '', url: '' };
  if (entry.hwi && entry.hwi.prs && entry.hwi.prs[0]) {
    pronunciation.pron = `/${entry.hwi.prs[0].mw}/`;

    if (entry.hwi.prs[0].sound) {
      const audioFile = entry.hwi.prs[0].sound.audio;
      // Determine subdirectory based on MW API rules
      let subdir = audioFile.startsWith("bix") ? "bix" :
                   audioFile.startsWith("gg") ? "gg" :
                   audioFile.match(/^_[0-9]/) ? "number" :
                   audioFile.charAt(0);
      pronunciation.url = `https://media.merriam-webster.com/audio/prons/en/us/wav/${subdir}/${audioFile}.wav`;
    }
  }

  // --- Definition, POS, and Example ---
  const definition = {
    pos: entry.fl || 'unknown', // Part of speech (e.g., "adjective")
    text: entry.shortdef[0] || 'No definition found.',
    example: []
  };

  // Find the first available example text
  if (entry.def && entry.def[0].sseq) {
    // A deeply nested and complex way to find examples, we simplify
    const firstSense = entry.def[0].sseq[0][0][1];
    if (firstSense.dt && Array.isArray(firstSense.dt)) {
      const visExample = firstSense.dt.find(item => item[0] === 'vis');
      if (visExample) {
        // Clean up the example text: remove {wi} tags
        const exampleText = visExample[1][0].t.replace(/{wi}|{\/wi}/g, '');
        definition.example.push({ text: exampleText });
      }
    }
  }

  return {
    word: entry.meta.id.split(':')[0], // Clean up word (e.g., "voluminous:1" -> "voluminous")
    pronunciation: [pronunciation],
    definition: [definition]
  };
}


// --- Main Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getDefinition') {
    const word = message.word.toLowerCase();
    const cacheKey = `qdp_${word}`;

    // Get user's preferred source and API key from storage
    chrome.storage.local.get(['preferredSource', 'mwApiKey'], async (settings) => {
      const source = settings.preferredSource || 'cambridge';
      const mwApiKey = settings.mwApiKey;
      
      // 1. Check cache first regardless of source
      const cachedResult = await chrome.storage.local.get(cacheKey);
      if (cachedResult[cacheKey]) {
        console.log(`Found "${word}" in cache.`);
        sendResponse({ status: 'success', data: cachedResult[cacheKey] });
        return;
      }
      
      // 2. If not in cache, fetch from the selected source
      console.log(`Fetching "${word}" from API source: ${source}`);
      
      let promise;
      if (source === 'merriam-webster') {
        if (!mwApiKey) {
          sendResponse({ status: 'error', message: 'Merriam-Webster API key not set.' });
          return;
        }
        const apiUrl = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${mwApiKey}`;
        promise = fetch(apiUrl)
          .then(res => res.json())
          .then(data => normalizeMwData(data));

      } else { // Default to Cambridge
        const apiUrl = `http://localhost:3000/api/dictionary/en/${word}`;
        promise = fetch(apiUrl).then(res => res.json());
      }

      promise.then(data => {
        if (!data || !data.word) {
          throw new Error('Definition not found or invalid format.');
        }
        // Cache the normalized data
        chrome.storage.local.set({ [cacheKey]: data });
        sendResponse({ status: 'success', data: data });
      }).catch(error => {
        sendResponse({ status: 'error', message: error.message });
      });
    });

    return true; // Indicates an asynchronous response
  }
});