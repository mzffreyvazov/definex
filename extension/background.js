/**
 * =================================================================================
 * Quick Definition - Background Service Worker
 * =================================================================================
 */

// --- Data Normalization Functions ---

function normalizeMwData(mwData) {
  // ... (Your existing normalizeMwData function) ...
  // This function is still needed, so keep it here.
  if (!mwData || mwData.length === 0 || typeof mwData[0] !== 'object') {return null;}
  const entry = mwData[0];
  const pronunciation = { lang: 'us', pron: '', url: '' };
  if (entry.hwi && entry.hwi.prs && entry.hwi.prs[0]) {
    pronunciation.pron = `/${entry.hwi.prs[0].mw}/`;
    if (entry.hwi.prs[0].sound) {
      const audioFile = entry.hwi.prs[0].sound.audio;
      const subdir = audioFile.startsWith("bix") ? "bix" : audioFile.startsWith("gg") ? "gg" : audioFile.match(/^_[0-9]/) ? "number" : audioFile.charAt(0);
      pronunciation.url = `https://media.merriam-webster.com/audio/prons/en/us/wav/${subdir}/${audioFile}.wav`;
    }
  }
  const definition = { pos: entry.fl || 'unknown', text: entry.shortdef[0] || 'No definition found.', example: [] };
  if (entry.suppl && entry.suppl.examples && entry.suppl.examples.length > 0) {
    const exampleText = entry.suppl.examples[0].t;
    definition.example.push({ text: exampleText.replace(/{it}|{\/it}/g, '') });
  } else if (entry.def && entry.def[0].sseq) {
    try { const firstSense = entry.def[0].sseq[0][0][1]; if (firstSense.dt && Array.isArray(firstSense.dt)) { const visExample = firstSense.dt.find(item => item[0] === 'vis'); if (visExample) { const exampleText = visExample[1][0].t.replace(/{wi}|{\/wi}/g, ''); definition.example.push({ text: exampleText });}}} catch (e) {console.log("Could not parse 'vis' example from MW data:", e);}
  }
  return { word: entry.meta.id.split(':')[0], pos: [definition.pos], verbs: [], pronunciation: [pronunciation], definition: [definition] };
}

/**
 * Normalizes the Gemini API response into our simple, standard format.
 * Since the AI can return multiple definitions, we will just pick the first one for simplicity.
 */
function normalizeGeminiData(aiData) {
  if (!aiData || !aiData.forms || aiData.forms.length === 0) {
    return null;
  }
  const firstForm = aiData.forms[0];
  const firstDefinition = firstForm.definitions[0];

  const pronunciation = {
    lang: 'us',
    pron: aiData.pronunciation || '',
    url: '' // Gemini doesn't provide audio URLs, so this is empty.
  };

  const definition = {
    pos: firstForm.partOfSpeech || 'unknown',
    text: firstDefinition.definition || 'No definition text found.',
    // Map the array of example strings to an array of objects
    example: firstDefinition.examples ? firstDefinition.examples.map(ex => ({ text: ex })) : []
  };
  
  // We only show one example in the UI, but we'll take the first if available.
  if (definition.example.length > 0) {
    definition.example = [definition.example[0]];
  }

  return {
    word: aiData.word,
    pos: [definition.pos],
    verbs: [],
    pronunciation: [pronunciation],
    definition: [definition]
  };
}

// --- Main Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getDefinition') {
    const word = message.word.toLowerCase();
    
    chrome.storage.local.get(['preferredSource', 'mwApiKey'], (settings) => {
      const source = settings.preferredSource || 'cambridge';
      const mwApiKey = settings.mwApiKey;
      const cacheKey = `qdp_${source}_${word}`;

      chrome.storage.local.get(cacheKey, (result) => {
        if (result[cacheKey]) {
          console.log(`Found "${word}" in cache for source: ${source}.`);
          sendResponse({ status: 'success', data: result[cacheKey] });
          return;
        }

        console.log(`Fetching "${word}" from API source: ${source}`);
        
        let apiPromise;

        if (source === 'gemini') {
          // For Gemini, fetch from both Gemini AI and Cambridge simultaneously
          const geminiUrl = `http://localhost:3000/api/gemini/${word}`;
          const cambridgeUrl = `http://localhost:3000/api/dictionary/en/${word}`;
          
          apiPromise = Promise.all([
            fetch(geminiUrl).then(res => res.json()),
            fetch(cambridgeUrl).then(res => res.json())
          ]).then(([geminiData, cambridgeData]) => {
            const normalizedGemini = normalizeGeminiData(geminiData);
            if (!normalizedGemini) {
              throw new Error('Gemini AI definition not found or invalid format.');
            }
            
            // Extract audio from Cambridge data if available
            if (cambridgeData && cambridgeData.pronunciation && cambridgeData.pronunciation.length > 0) {
              const cambridgePron = cambridgeData.pronunciation.find(p => p.url) || cambridgeData.pronunciation[0];
              if (cambridgePron && cambridgePron.url) {
                // Replace Gemini's empty audio URL with Cambridge's audio
                normalizedGemini.pronunciation[0].url = cambridgePron.url;
                // Also update pronunciation text if Gemini doesn't have it
                if (!normalizedGemini.pronunciation[0].pron && cambridgePron.pron) {
                  normalizedGemini.pronunciation[0].pron = cambridgePron.pron;
                }
              }
            }
            
            return normalizedGemini;
          });
        
        } else if (source === 'merriam-webster') {
          if (!mwApiKey) {
            sendResponse({ status: 'error', message: 'Merriam-Webster API key is not set.' });
            return;
          }
          const apiUrl = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${mwApiKey}`;
          apiPromise = fetch(apiUrl)
            .then(res => res.json())
            .then(data => normalizeMwData(data));

        } else { // Default to Cambridge
          const apiUrl = `http://localhost:3000/api/dictionary/en/${word}`;
          apiPromise = fetch(apiUrl).then(res => res.json());
        }

        apiPromise.then(data => {
          if (!data || !data.word) {
            throw new Error('Definition not found or API returned invalid format.');
          }
          chrome.storage.local.set({ [cacheKey]: data });
          sendResponse({ status: 'success', data: data });
        }).catch(error => {
          console.error(`API Error for "${word}" from ${source}:`, error);
          sendResponse({ status: 'error', message: error.message });
        });
      });
    });

    return true;
  }
});