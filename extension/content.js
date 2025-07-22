let popup = null;

// Audio cache for TTS
const audioCache = new Map();
const MAX_CACHE_SIZE = 50; // Limit cache to 50 audio files

// Function to clean up cache when it gets too large
function cleanupAudioCache() {
  if (audioCache.size >= MAX_CACHE_SIZE) {
    // Remove the oldest entries (first 10)
    const keysToDelete = Array.from(audioCache.keys()).slice(0, 10);
    keysToDelete.forEach(key => {
      const audio = audioCache.get(key);
      if (audio) {
        audio.src = ''; // Release audio resource
      }
      audioCache.delete(key);
    });
    console.log(`Cleaned up ${keysToDelete.length} cached audio files`);
  }
}

// Helper function to get display name for source
function getSourceDisplayName(source) {
  switch (source) {
    case 'cambridge':
      return 'Cambridge Dictionary';
    case 'merriam-webster':
      return 'Merriam-Webster';
    case 'gemini':
      return 'Gemini AI';
    default:
      return 'Cambridge Dictionary';
  }
}

// Listen for double-clicks on the page
document.addEventListener('dblclick', handleSelection);

function handleSelection(event) {
  const selectedText = window.getSelection().toString().trim();
  
  // Check if selection is valid based on the source
  chrome.storage.local.get(['preferredSource'], (settings) => {
    const source = settings.preferredSource || 'cambridge';
    
    let isValidSelection = false;
    const words = selectedText.split(/\s+/).filter(word => word.length > 0);
    const isSentence = words.length > 5; // More than 5 words = sentence
    
    if (isSentence) {
      // For sentences: allow any text with basic validation
      isValidSelection = selectedText.length > 0 && selectedText.length <= 500; // Reasonable length limit
    } else if (source === 'gemini') {
      // For Gemini: allow phrases up to 5 words (letters, spaces, hyphens, apostrophes)
      isValidSelection = words.length >= 1 && words.length <= 5 && 
                       /^[a-zA-Z\s'-]+$/.test(selectedText);
    } else {
      // For other sources: only single words
      isValidSelection = selectedText.length > 0 && /^[a-zA-Z]+$/.test(selectedText);
    }
    
    if (!isValidSelection) {
      return; // Don't show popup for invalid selections
    }
    
    // Remove existing popup if it exists
    removePopup();
    
    const sourceDisplayName = getSourceDisplayName(source);
    
    let loadingMessage;
    if (isSentence) {
      loadingMessage = `<span style="font-family: 'Open Sans', sans-serif;">Translating sentence "<strong>${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}</strong>" with <em>Gemini AI</em>...</span>`;
    } else if (source === 'gemini') {
      // Check if it's a single word or phrase for loading message
      const isPhrase = words.length > 1;
      
      if (isPhrase) {
        loadingMessage = `<span style="font-family: 'Open Sans', sans-serif;">Loading definition for "<strong>${selectedText}</strong>" from <em>${sourceDisplayName}</em>...</span>`;
      } else {
        loadingMessage = `<span style="font-family: 'Open Sans', sans-serif;">Loading definition for "<strong>${selectedText}</strong>" from <em>${sourceDisplayName}</em> with audio from <em>Cambridge</em>...</span>`;
      }
    } else {
      loadingMessage = `<span style="font-family: 'Open Sans', sans-serif;">Loading definition for "<strong>${selectedText}</strong>" from <em>${sourceDisplayName}</em>...</span>`;
    }
    
    // Create a placeholder popup while fetching
    createPopup(event.clientX, event.clientY, loadingMessage, isSentence);
    
    // Send the selected text to the background script
    const messageType = isSentence ? 'translateSentence' : 'getDefinition';
    const messageData = isSentence 
      ? { type: messageType, text: selectedText }
      : { type: messageType, word: selectedText };
      
    chrome.runtime.sendMessage(messageData, (response) => {
      if (chrome.runtime.lastError) {
        // Handle potential errors like the background script not being ready
        updatePopupContent('Error: Could not connect to the extension.');
        return;
      }

      if (response.status === 'success') {
        const ttsEnabled = response.ttsEnabled || false;
        const content = isSentence ? formatTranslationData(response.data, ttsEnabled) : formatData(response.data, ttsEnabled);
        updatePopupContent(content);
      } else {
        updatePopupContent(`Error: ${response.message || (isSentence ? 'Translation failed.' : 'Definition not found.')}`);
      }
    });
  });
}

// Format the data from the API into clean HTML
function formatData(data, ttsEnabled = false) {
  const word = data.word;
  const translation = data.translation; // Word/phrase translation
  const pronunciation = data.pronunciation.find(p => p.lang === 'us' && p.pron) || data.pronunciation.find(p => p.pron);
  const audioUrl = pronunciation ? pronunciation.url : null;

  // Check if this is a phrase (more than one word)
  const words = word.split(/\s+/).filter(w => w.length > 0);
  const isPhrase = words.length > 1;

  // Start with the header, including translation if available
  let headerHTML = `
    <div class="qdp-header">
      <span class="qdp-word">${word}</span>
      <span class="qdp-pron">${pronunciation ? pronunciation.pron : ''}</span>
      ${audioUrl ? `<button id="qdp-audio-btn" title="Play pronunciation" data-audio-src="${audioUrl}">🔊</button>` : ''}
      ${isPhrase && ttsEnabled ? `<button id="qdp-tts-phrase-btn" title="Play phrase with TTS" data-tts-text="${word}">🔊</button>` : ''}
    </div>
  `;

  // Add translation header if available
  if (translation) {
    headerHTML += `
      <div class="qdp-translation-header">
        <span class="qdp-translation-label">Translation:</span>
        <span class="qdp-word-translation">${translation}</span>
      </div>
    `;
  }

  // Generate HTML for each definition block
  const definitionsHTML = data.definition.map(def => {
    // Generate HTML for each example within this definition
    const examplesHTML = def.example.map(ex => {
      let exampleHTML = `<div class="qdp-example">e.g., "<em>${ex.text}</em>"`;
      
      // Add translation if available
      if (ex.translation) {
        exampleHTML += `<div class="qdp-example-translation"> <em>${ex.translation}</em></div>`;
      }
      exampleHTML += `</div>`;
      return exampleHTML;
    }).join('');

    // Build definition block with translation if available
    let definitionHTML = `
      <div class="qdp-definition-block">
        <div class="qdp-definition">
          <span class="qdp-pos">${def.pos}</span>
          ${def.text}
        </div>
    `;
    
    // Add definition translation if available
    if (def.translation) {
      definitionHTML += `
        <div class="qdp-definition-translation">
          <span class="qdp-translation-label">Definition:</span> ${def.translation}
        </div>
      `;
    }
    
    definitionHTML += `${examplesHTML}</div>`;
    return definitionHTML;
  }).join('');

  return headerHTML + `<div class="qdp-body">${definitionsHTML}</div>`;
}

// Format translation data for sentences
function formatTranslationData(data, ttsEnabled = false) {
  let html = `
    <div class="qdp-sentence-header">
      <div class="qdp-sentence-original">
        <span class="qdp-sentence-label">Original:</span>
        <div class="qdp-sentence-text">"${data.originalSentence}"
          ${ttsEnabled ? `<button id="qdp-tts-original-btn" title="Play original sentence" data-tts-text="${data.originalSentence}">🔊</button>` : ''}
        </div>
      </div>
      <div class="qdp-sentence-translation">
        <span class="qdp-sentence-label">Translation (${data.targetLanguage}):</span>
        <div class="qdp-sentence-text">"${data.translation}"</div>
      </div>
    </div>
  `;

  // Add key phrases if available
  if (data.keyPhrases && data.keyPhrases.length > 0) {
    const keyPhrasesHTML = data.keyPhrases.map(phrase => `
      <div class="qdp-key-phrase">
        <span class="qdp-key-phrase-original">"${phrase.original}"</span>
        <span class="qdp-key-phrase-arrow">→</span>
        <span class="qdp-key-phrase-translation">"${phrase.translation}"</span>
        ${phrase.explanation ? `<div class="qdp-key-phrase-explanation">${phrase.explanation}</div>` : ''}
      </div>
    `).join('');

    html += `
      <div class="qdp-key-phrases">
        <div class="qdp-key-phrases-header" id="qdp-key-phrases-header">
          <span class="qdp-key-phrases-label">Key Phrases</span>
          <span class="qdp-toggle-icon" id="qdp-toggle-icon">▶</span>
        </div>
        <div class="qdp-key-phrases-list" id="qdp-key-phrases-content" style="display: none;">${keyPhrasesHTML}</div>
      </div>
    `;
  }

  return html;
}

// Create and display the popup on the page
function createPopup(x, y, content, isSentence = false) {
  popup = document.createElement('div');
  popup.id = 'quick-def-popup';
  
  // Add sentence class for larger width
  if (isSentence) {
    popup.classList.add('qdp-sentence-mode');
  }
  
  popup.style.left = `${x + window.scrollX}px`;
  popup.style.top = `${y + window.scrollY + 15}px`; // Position below the cursor
  popup.innerHTML = content;
  document.body.appendChild(popup);
  
  // Add listener for the audio button if it was created
  const audioButton = document.getElementById('qdp-audio-btn');
  if(audioButton) {
      audioButton.addEventListener('click', playAudio);
  }
  
  // Add TTS event listeners
  const ttsPhraseBtns = document.querySelectorAll('#qdp-tts-phrase-btn, #qdp-tts-original-btn');
  ttsPhraseBtns.forEach(btn => {
    btn.addEventListener('click', playTTS);
  });
  
  // Add key phrases toggle listener
  const keyPhrasesHeader = document.getElementById('qdp-key-phrases-header');
  if (keyPhrasesHeader) {
    keyPhrasesHeader.addEventListener('click', toggleKeyPhrases);
  }
}

// Update the content of the existing popup
function updatePopupContent(content) {
  if (popup) {
    popup.innerHTML = content;
    const audioButton = document.getElementById('qdp-audio-btn');
    if(audioButton) {
        audioButton.addEventListener('click', playAudio);
    }
    
    // Add TTS event listeners
    const ttsPhraseBtns = document.querySelectorAll('#qdp-tts-phrase-btn, #qdp-tts-original-btn');
    ttsPhraseBtns.forEach(btn => {
      btn.addEventListener('click', playTTS);
    });
    
    // Add key phrases toggle listener
    const keyPhrasesHeader = document.getElementById('qdp-key-phrases-header');
    if (keyPhrasesHeader) {
      keyPhrasesHeader.addEventListener('click', toggleKeyPhrases);
    }
  }
}

function playAudio(event) {
    const audioSrc = event.target.getAttribute('data-audio-src');
    if (audioSrc) {
        const audio = new Audio(audioSrc);
        audio.play();
    }
}

function playTTS(event) {
    const text = event.target.getAttribute('data-tts-text');
    if (text) {
        // Check word count to ensure it's a phrase or sentence
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length < 2) {
            console.log('TTS is only available for phrases (2+ words), not individual words.');
            return;
        }
        
        console.log(`Playing TTS for: "${text}"`);
        
        // Check if audio is already cached
        const cacheKey = text.toLowerCase().trim();
        if (audioCache.has(cacheKey)) {
            console.log('Playing cached audio');
            const cachedAudio = audioCache.get(cacheKey);
            cachedAudio.currentTime = 0; // Reset to beginning
            cachedAudio.play().catch(error => {
                console.error('Cached TTS playback failed:', error);
            });
            return;
        }
        
        // Create TTS audio URL
        const encodedText = encodeURIComponent(text);
        const ttsUrl = `http://localhost:3000/api/tts/${encodedText}`;
        
        console.log(`TTS URL: ${ttsUrl}`);
        console.log('Fetching new audio and caching it');
        
        // Create and cache audio
        const audio = new Audio(ttsUrl);
        
        // Cache the audio once it's loaded
        audio.addEventListener('canplaythrough', () => {
            cleanupAudioCache(); // Check cache size before adding
            audioCache.set(cacheKey, audio);
            console.log(`Audio cached for: "${text}" (Cache size: ${audioCache.size})`);
        });
        
        // Play the audio
        audio.play().catch(error => {
            console.error('TTS playback failed:', error);
        });
    }
}

// Toggle function for key phrases section
function toggleKeyPhrases() {
    console.log('toggleKeyPhrases called');
    const content = document.getElementById('qdp-key-phrases-content');
    const icon = document.getElementById('qdp-toggle-icon');
    
    console.log('Content element:', content);
    console.log('Icon element:', icon);
    
    if (content && icon) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
            console.log('Expanded key phrases');
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
            console.log('Collapsed key phrases');
        }
    } else {
        console.log('Could not find content or icon elements');
    }
}

// Make toggleKeyPhrases available globally
window.toggleKeyPhrases = toggleKeyPhrases;

// Remove the popup from the page
function removePopup() {
  if (popup) {
    popup.remove();
    popup = null;
  }
}

// Close the popup if user clicks anywhere else on the page
document.addEventListener('click', (event) => {
  if (popup && !popup.contains(event.target)) {
    removePopup();
  }
});