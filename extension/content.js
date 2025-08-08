// Check if extension is enabled for this site before setting up event listeners
chrome.storage.local.get('enabledSites', (data) => {
    const enabledSites = data.enabledSites || [];
    const currentSite = window.location.hostname;

    if (enabledSites.includes(currentSite)) {
        // Only add event listeners if the site is enabled
        document.addEventListener('dblclick', handleSelection);
        window.addEventListener('scroll', updatePopupPosition, { passive: true });
        window.addEventListener('resize', updatePopupPosition, { passive: true });
        document.addEventListener('click', (event) => {
            if (popup && !popup.contains(event.target)) {
                clearPopupData();
            }
        });
    }
});

// Listen for site toggle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'siteToggle') {
        if (message.enabled) {
            // Enable the extension on this site
            document.addEventListener('dblclick', handleSelection);
            window.addEventListener('scroll', updatePopupPosition, { passive: true });
            window.addEventListener('resize', updatePopupPosition, { passive: true });
            document.addEventListener('click', (event) => {
                if (popup && !popup.contains(event.target)) {
                    clearPopupData();
                }
            });
        } else {
            // Disable the extension on this site
            document.removeEventListener('dblclick', handleSelection);
            window.removeEventListener('scroll', updatePopupPosition);
            window.removeEventListener('resize', updatePopupPosition);
            document.removeEventListener('click', (event) => {
                if (popup && !popup.contains(event.target)) {
                    clearPopupData();
                }
            });
            // Clear any existing popup
            clearPopupData();
        }
    }
});

let popup = null;
let selectionRange = null; // Store the selection range for sticky positioning
let popupContent = null; // Store the popup content to recreate when scrolling back
let isSentenceMode = false; // Track if current popup is in sentence mode

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

function handleSelection(event) {
  // Prevent default behavior that might interfere
  event.preventDefault();
  
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  // Get the position of the selected text instead of mouse coordinates
  let mouseX = event.clientX;
  let mouseY = event.clientY;
  
  // If we have a selection, use its position
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Store the selection range for sticky positioning
    selectionRange = range.cloneRange();
    
    // Use the end of the selection for popup positioning
    mouseX = rect.right;
    mouseY = rect.bottom;
  }
  
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
    clearPopupData();
    
    const sourceDisplayName = getSourceDisplayName(source);
    
    let loadingMessage;
    if (isSentence) {
      loadingMessage = `<span style="font-family: 'Open Sans', sans-serif;">Translating sentence "<strong>${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}</strong>" with Gemini AI...</span>`;
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
    createPopup(mouseX, mouseY, loadingMessage, isSentence);
    
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
        const elevenlabsApiKey = response.elevenlabsApiKey || '';
        
        // Store ElevenLabs API key globally for TTS usage
        window.elevenlabsApiKey = elevenlabsApiKey;
        
        const content = isSentence ? formatTranslationData(response.data, ttsEnabled) : formatData(response.data, ttsEnabled);
        updatePopupContent(content);
      } else if (response.status === 'noLanguage') {
        // Show message to configure target language in options
        updatePopupContent(`<div style="padding: 20px; text-align: center; font-family: 'Open Sans', sans-serif; line-height: 1.5;">
          <div style="font-size: 16px; font-weight: 600; color: #dc3545; margin-bottom: 12px;">⚠️ No Target Language Selected</div>
          <div style="font-size: 14px; color: #666;">${response.message}</div>
        </div>`);
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
      <div class="qdp-header-content">
        <div class="qdp-header-main">
          <span class="qdp-word">${word}</span>
          <span class="qdp-pron">${pronunciation ? pronunciation.pron : ''}</span>
        </div>
      </div>
      <div class="qdp-actions">
        ${audioUrl ? `<button id="qdp-audio-btn" title="Play pronunciation" data-audio-src="${audioUrl}">🔊</button>` : ''}
        ${isPhrase && ttsEnabled ? `<button id="qdp-tts-phrase-btn" title="Play phrase with TTS" data-tts-text="${word}">🔊</button>` : ''}
        <button id="qdp-save-btn" title="Save word" data-word-data='${JSON.stringify(data).replace(/'/g, "&#39;")}'>📖</button>
      </div>
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
      let exampleHTML = `<div class="qdp-example">${ex.text}`;
      
      // Add translation if available
      if (ex.translation) {
        exampleHTML += `<div class="qdp-example-translation">${ex.translation}</div>`;
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
        <div class="qdp-sentence-text">${data.originalSentence}
          <div class="qdp-actions">
            ${ttsEnabled ? `<button id="qdp-tts-original-btn" title="Play original sentence" data-tts-text="${data.originalSentence}">🔊</button>` : ''}
            <button id="qdp-save-btn" title="Save sentence" data-sentence-data='${JSON.stringify(data).replace(/'/g, "&#39;")}'>📖</button>
          </div>
        </div>
      </div>
      <div class="qdp-sentence-translation">
        <span class="qdp-sentence-label">Translation (${data.targetLanguage}):</span>
        <div class="qdp-sentence-text">${data.translation}</div>
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
  
  // Store popup content and mode for persistence
  popupContent = content;
  isSentenceMode = isSentence;
  
  // Add sentence class for larger width
  if (isSentence) {
    popup.classList.add('qdp-sentence-mode');
  }
  
  popup.innerHTML = content;
  document.body.appendChild(popup);
  
  // Position popup with better cross-site compatibility
  positionPopup(x, y, popup);
  
  // Add event listeners
  addPopupEventListeners();
}

// Update the content of the existing popup
function updatePopupContent(content) {
  if (popup) {
    popup.innerHTML = content;
    popupContent = content; // Update stored content
    addPopupEventListeners();
  }
}

// Add event listeners to popup elements
function addPopupEventListeners() {
  const audioButton = document.getElementById('qdp-audio-btn');
  if(audioButton) {
      audioButton.addEventListener('click', playAudio);
  }
  
  // Add TTS event listeners
  const ttsPhraseBtns = document.querySelectorAll('#qdp-tts-phrase-btn, #qdp-tts-original-btn');
  ttsPhraseBtns.forEach(btn => {
    btn.addEventListener('click', playTTS);
  });
  
  // Add save button event listener
  const saveButton = document.getElementById('qdp-save-btn');
  if (saveButton) {
    saveButton.addEventListener('click', saveWord);
  }
  
  // Add key phrases toggle listener
  const keyPhrasesHeader = document.getElementById('qdp-key-phrases-header');
  if (keyPhrasesHeader) {
    keyPhrasesHeader.addEventListener('click', toggleKeyPhrases);
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
        
        // Check if audio is already cached
        const cacheKey = text.toLowerCase().trim();
        if (audioCache.has(cacheKey)) {
            const cachedAudio = audioCache.get(cacheKey);
            cachedAudio.currentTime = 0; // Reset to beginning
            cachedAudio.play().catch(error => {
                console.error('Cached TTS playback failed:', error);
            });
            return;
        }
        
        // Create TTS audio URL
        const encodedText = encodeURIComponent(text);
        const ttsUrl = `https://semantix.onrender.com/api/tts/${encodedText}`;
        
        // Prepare headers with ElevenLabs API key if available
        const headers = {};
        if (window.elevenlabsApiKey && window.elevenlabsApiKey.trim()) {
            headers['x-elevenlabs-api-key'] = window.elevenlabsApiKey.trim();
        }
        
        // Fetch audio with API key
        fetch(ttsUrl, { 
            method: 'GET',
            headers: headers,
            mode: 'cors'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`TTS request failed: ${response.status} ${response.statusText}`);
                }
                return response.blob();
            })
            .then(blob => {
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);
                
                // Cache the audio once it's loaded
                audio.addEventListener('canplaythrough', () => {
                    cleanupAudioCache(); // Check cache size before adding
                    audioCache.set(cacheKey, audio);
                });
                
                // Add error handling for audio playback
                audio.addEventListener('error', (e) => {
                    console.error('Audio playback error:', e);
                });
                
                // Play the audio
                audio.play().catch(error => {
                    console.error('TTS playback failed:', error);
                });
            })
            .catch(error => {
                console.error('TTS fetch failed:', error);
            });
    }
}

function saveWord(event) {
    const wordData = event.target.getAttribute('data-word-data');
    const sentenceData = event.target.getAttribute('data-sentence-data');
    
    if (wordData) {
        // Handle word/phrase saving
        try {
            const data = JSON.parse(wordData);
            const saveData = {
                id: Date.now() + Math.random(), // Unique ID
                text: data.word,
                type: data.word.split(/\s+/).length > 1 ? 'phrase' : 'word',
                partOfSpeech: data.pos ? data.pos.join(', ') : '',
                definitions: data.definition.map(def => ({
                    text: def.text,
                    translation: def.translation || null,
                    examples: def.example.map(ex => ({
                        text: ex.text,
                        translation: ex.translation || null
                    }))
                })),
                translation: data.translation || null,
                pronunciation: data.pronunciation && data.pronunciation[0] ? data.pronunciation[0].pron : '',
                audioUrl: data.pronunciation && data.pronunciation[0] ? data.pronunciation[0].url : '',
                savedAt: new Date().toISOString()
            };
            
            // Send to background script to save
            chrome.runtime.sendMessage({
                type: 'saveWord',
                data: saveData
            });
            
            // Update button to show saved state
            event.target.innerHTML = '✓';
            event.target.title = 'Saved!';
            event.target.style.color = '#059669';
            setTimeout(() => {
                event.target.innerHTML = '📖';
                event.target.title = 'Save word';
                event.target.style.color = '';
            }, 2000);
            
        } catch (error) {
            console.error('Error saving word:', error);
        }
    } else if (sentenceData) {
        // Handle sentence saving
        try {
            const data = JSON.parse(sentenceData);
            const saveData = {
                id: Date.now() + Math.random(), // Unique ID
                text: data.originalSentence,
                type: 'sentence',
                partOfSpeech: '',
                definitions: [],
                translation: data.translation || null,
                targetLanguage: data.targetLanguage || '',
                keyPhrases: data.keyPhrases || [],
                savedAt: new Date().toISOString()
            };
            
            // Send to background script to save
            chrome.runtime.sendMessage({
                type: 'saveWord',
                data: saveData
            });
            
            // Update button to show saved state
            event.target.innerHTML = '✓';
            event.target.title = 'Saved!';
            event.target.style.color = '#059669';
            setTimeout(() => {
                event.target.innerHTML = '📖';
                event.target.title = 'Save sentence';
                event.target.style.color = '';
            }, 2000);
            
        } catch (error) {
            console.error('Error saving sentence:', error);
        }
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

// Position popup with sticky positioning relative to selected text
function positionPopup(mouseX, mouseY, popupElement) {
  // Get viewport dimensions
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Get popup dimensions (after it's added to DOM)
  const popupRect = popupElement.getBoundingClientRect();
  const popupWidth = popupRect.width;
  const popupHeight = popupRect.height;
  
  // Get scroll positions to calculate absolute position
  const scrollX = window.pageXOffset || window.scrollX || document.documentElement.scrollLeft || 0;
  const scrollY = window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0;
  
  // Calculate absolute position relative to document (not viewport)
  let left = mouseX + scrollX;
  let top = mouseY + scrollY + 15; // 15px below the selection
  
  // Adjust horizontal position if popup would go off screen
  if (mouseX + popupWidth > viewportWidth) {
    // Position to the left of cursor instead
    left = mouseX + scrollX - popupWidth - 10;
    // Ensure it doesn't go off the left edge
    if (left < scrollX) {
      left = scrollX + 10;
    }
  }
  
  // Adjust vertical position if popup would go off screen
  if (mouseY + popupHeight + 15 > viewportHeight) {
    // Position above cursor instead
    top = mouseY + scrollY - popupHeight - 10;
    // Ensure it doesn't go off the top edge
    if (top < scrollY) {
      top = scrollY + 10;
    }
  }
  
  // Apply absolute positioning for document-relative positioning
  popupElement.style.position = 'absolute';
  popupElement.style.left = `${Math.max(0, left)}px`;
  popupElement.style.top = `${Math.max(0, top)}px`;
  
  // Ensure popup is visible and above other content
  popupElement.style.zIndex = '2147483647'; // Maximum z-index
  popupElement.style.pointerEvents = 'auto';
  
  // Force a reflow to ensure positioning is applied
  popupElement.offsetHeight;
}

// Remove the popup from the page
function removePopup() {
  if (popup) {
    popup.remove();
    popup = null;
    // Don't clear selectionRange, popupContent, or isSentenceMode here
    // so we can recreate the popup when scrolling back
  }
}

// Completely clear popup data (for new selections or manual dismissal)
function clearPopupData() {
  removePopup();
  selectionRange = null;
  popupContent = null;
  isSentenceMode = false;
}

// Update popup position based on selection range (for sticky behavior)
function updatePopupPosition() {
  if (selectionRange && popupContent) {
    try {
      const rect = selectionRange.getBoundingClientRect();
      
      // Check if the selected text is still visible in the viewport
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // If the selection is completely out of view, hide the popup
      if (rect.bottom < 0 || rect.top > viewportHeight || 
          rect.right < 0 || rect.left > viewportWidth) {
        if (popup) {
          console.log('Selection scrolled out of view, hiding popup');
          removePopup(); // This only removes the DOM element, keeps data
        }
        return;
      }
      
      // If selection is visible but popup doesn't exist, recreate it
      if (!popup) {
        console.log('Selection scrolled back into view, recreating popup');
        createPopup(rect.right, rect.bottom, popupContent, isSentenceMode);
        return;
      }
      
      // If selection is visible and popup exists, just reposition it
      positionPopup(rect.right, rect.bottom, popup);
    } catch (error) {
      // If the range is no longer valid (e.g., DOM changed), clear all data
      console.log('Selection range no longer valid, clearing popup data');
      clearPopupData();
    }
  }
}

// Note: Event listeners are conditionally added at the beginning of the file
// based on whether the site is enabled in the extension settings