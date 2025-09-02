// Import API configuration
import { API_URLS } from './config/api-config.js';

// Variable to track if we're in a right-click context
let isRightClickInProgress = false;

// Function to prevent selection clearing during right-clicks
function preventSelectionClear(event) {
    // Check if this is a right-click (button 2) or if we're in a right-click context
    if (event.button === 2 || isRightClickInProgress) {
        const selection = window.getSelection();
        
        // Only prevent default if there's an active selection
        if (selection && selection.toString().trim().length > 0) {
            event.preventDefault();
            event.stopPropagation();
            
            // Set flag to indicate right-click is in progress
            isRightClickInProgress = true;
            
            // Clear the flag after a short delay to handle the context menu
            setTimeout(() => {
                isRightClickInProgress = false;
            }, 100);
        }
    }
}

// Check if extension is enabled for this site before setting up event listeners
chrome.storage.local.get('enabledSites', (data) => {
    const enabledSites = data.enabledSites || [];
    const currentSite = window.location.hostname;

    if (enabledSites.includes(currentSite)) {
        // Only add event listeners if the site is enabled
        document.addEventListener('dblclick', handleSelection);
        document.addEventListener('mousedown', preventSelectionClear, true);
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
            document.addEventListener('mousedown', preventSelectionClear, true);
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
            document.removeEventListener('mousedown', preventSelectionClear, true);
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

  // Handle lookup from context menu
  if (message.type === 'contextLookup' && typeof message.text === 'string') {
    try {
      handleContextLookup(message.text);
    } catch (e) {
      console.error('Context lookup failed:', e);
      // Show error in popup if it exists, otherwise just log
      if (popup) {
        updatePopupContent(createErrorMessage(
          'Context Lookup Error',
          'Failed to process the selected text. Please try selecting the text again.',
          '🔍'
        ));
      }
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

// Helper function to create consistent error messages
function createErrorMessage(title, message, icon = '⚠️') {
  return `
    <div class="qdp-error" style="
      padding: 20px; 
      text-align: center; 
      font-family: 'Open Sans', sans-serif; 
      line-height: 1.5;
      border: 1px solid #ffcdd2;
      background: linear-gradient(135deg, #ffebee 0%, #fff 100%);
      border-radius: 8px;
      color: #333;
    ">
      <div style="
        font-size: 16px; 
        font-weight: 600; 
        color: #d32f2f; 
        margin-bottom: 12px;
      ">
        ${icon} ${title}
      </div>
      <div style="
        font-size: 14px; 
        color: #666;
        line-height: 1.4;
      ">
        ${message}
      </div>
    </div>
  `;
}

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

// Build skeleton loading HTML for the popup while we fetch data
function buildSkeletonPlaceholder(isSentence) {
  const definitionLines = isSentence
    ? '<div class="skeleton-line w-95"></div><div class="skeleton-line w-90"></div><div class="skeleton-line w-85"></div><div class="skeleton-line w-80"></div>'
    : '<div class="skeleton-line w-90"></div><div class="skeleton-line w-75"></div><div class="skeleton-line w-60"></div>';

  const translationHeader = isSentence
    ? '<div class="skeleton-translation"></div>'
    : '';

  return `
    <div class="qdp-skeleton">
      <div class="qdp-header">
        <div class="qdp-header-content">
          <div class="skeleton-word"></div>
          <div class="skeleton-pron"></div>
        </div>
        <div class="qdp-actions">
          <div class="skeleton-icon"></div>
          <div class="skeleton-icon"></div>
          <div class="skeleton-icon"></div>
        </div>
      </div>
      ${translationHeader}
      <div class="qdp-body">
        ${definitionLines}
      </div>
    </div>
  `;
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
  
  // Check if selection is valid and decide whether to translate or define
  chrome.storage.local.get(['preferredSource'], (settings) => {
    const source = settings.preferredSource || 'cambridge';

    // Tokenize and classify selection
    const words = selectedText.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    const isPhrase = wordCount >= 2 && wordCount <= 5;
    const isLongSentence = wordCount > 5;

    // Validation regexes (Unicode-aware)
    const SINGLE_WORD_REGEX = /^[\p{L}\p{M}][\p{L}\p{M}'’\-]*$/u;
    const PHRASE_REGEX = /^[\p{L}\p{M}\s'’\-.,!?()"“”‘’:;]+$/u;

    let isValidSelection = false;
    if (isLongSentence) {
      // Allow longer selections with a reasonable length cap
      isValidSelection = selectedText.length > 0 && selectedText.length <= 500;
    } else if (isPhrase) {
      // Allow 2–5 word phrases broadly; background decides which API to use
      // Keep a generous length cap to avoid huge selections
      isValidSelection = selectedText.length > 0 && selectedText.length <= 300;
    } else {
      // Single word: allow Unicode letters plus apostrophes/hyphens
      isValidSelection = SINGLE_WORD_REGEX.test(selectedText);
    }

    if (!isValidSelection) {
      return; // Don't show popup for invalid selections
    }

    // Remove existing popup if it exists
    clearPopupData();

    // Only treat long sentences as sentence-like; phrases use definition flow
    const isSentenceLike = isLongSentence;

    // Create a skeleton placeholder popup while fetching
    const skeleton = buildSkeletonPlaceholder(isSentenceLike);
    createPopup(mouseX, mouseY, skeleton, isSentenceLike);
    const skeletonShownAt = performance.now();

    // Send the selected text to the background script
    const messageType = isSentenceLike ? 'translateSentence' : 'getDefinition';
    const messageData = isSentenceLike
      ? { type: messageType, text: selectedText }
      : { type: messageType, word: selectedText };
      
    chrome.runtime.sendMessage(messageData, (response) => {
    // Render immediately when response arrives; do not enforce minimum skeleton time
    const showAfter = () => {
        if (chrome.runtime.lastError) {
          updatePopupContent(createErrorMessage(
            'Connection Error',
            'Cannot communicate with the extension background service. Please try refreshing the page or restarting your browser.',
            '🔌'
          ));
          return;
        }
        if (response.status === 'success') {
          const ttsEnabled = response.ttsEnabled || false;
          const enableTtsForWord = response.enableTtsForWord || false;
          const elevenlabsApiKey = response.elevenlabsApiKey || '';
          window.elevenlabsApiKey = elevenlabsApiKey;
          
          // Pre-cache audio files immediately when data is received
          if (!isSentenceLike) {
            precacheAudioFromData(response.data);
          }
          
          const content = isSentenceLike ? formatTranslationData(response.data, ttsEnabled) : formatData(response.data, ttsEnabled, enableTtsForWord);
          updatePopupContent(content);
        } else if (response.status === 'noLanguage') {
          updatePopupContent(`<div style="padding: 20px; text-align: center; font-family: 'Open Sans', sans-serif; line-height: 1.5;">
            <div style="font-size: 16px; font-weight: 600; color: #dc3545; margin-bottom: 12px;">⚠️ No Target Language Selected</div>
            <div style="font-size: 14px; color: #666;">${response.message}</div>
          </div>`);
        } else {
          // Create more informative error messages
          const errorTitle = isSentenceLike ? 'Translation Error' : 'Definition Error';
          const errorMessage = response.message || (isSentenceLike ? 'Translation failed.' : 'Definition not found.');
          
          updatePopupContent(createErrorMessage(errorTitle, errorMessage));
        }
      };
    // Show results as soon as they're ready (no extra delay)
    showAfter();
    });
  });
}

// Triggered by context menu; uses current selection position if available
function handleContextLookup(selectedText) {
  const selection = window.getSelection();
  let mouseX = 0;
  let mouseY = 0;

  // Prefer the current selection's bounding rect for positioning
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    selectionRange = range.cloneRange();
    mouseX = rect.right;
    mouseY = rect.bottom;
  } else {
    // Fallback to top-left if no range (will reposition on scroll/resize)
    mouseX = 20;
    mouseY = 20;
  }

  const text = (selectedText || '').trim();
  if (!text) return;

  // Remove existing popup
  clearPopupData();

  // Decide if this is sentence-like or definition-like (reuse logic)
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const isLongSentence = words.length > 5;
  const isSentenceLike = isLongSentence;

  // Show skeleton
  const skeleton = buildSkeletonPlaceholder(isSentenceLike);
  createPopup(mouseX, mouseY, skeleton, isSentenceLike);

  const messageType = isSentenceLike ? 'translateSentence' : 'getDefinition';
  const payload = isSentenceLike ? { type: messageType, text } : { type: messageType, word: text };

  chrome.runtime.sendMessage(payload, (response) => {
    if (chrome.runtime.lastError) {
      updatePopupContent(createErrorMessage(
        'Connection Error',
        'Cannot communicate with the extension background service. Please try refreshing the page or restarting your browser.',
        '🔌'
      ));
      return;
    }
    if (response.status === 'success') {
      const ttsEnabled = response.ttsEnabled || false;
      const enableTtsForWord = response.enableTtsForWord || false;
      const elevenlabsApiKey = response.elevenlabsApiKey || '';
      window.elevenlabsApiKey = elevenlabsApiKey;
      
      // Pre-cache audio files immediately when data is received (context lookup)
      if (!isSentenceLike) {
        precacheAudioFromData(response.data);
      }
      
      const content = isSentenceLike ? formatTranslationData(response.data, ttsEnabled) : formatData(response.data, ttsEnabled, enableTtsForWord);
      updatePopupContent(content);
    } else if (response.status === 'noLanguage') {
      updatePopupContent(`<div style="padding: 20px; text-align: center; font-family: 'Open Sans', sans-serif; line-height: 1.5;">
        <div style="font-size: 16px; font-weight: 600; color: #dc3545; margin-bottom: 12px;">⚠️ No Target Language Selected</div>
        <div style="font-size: 14px; color: #666;">${response.message}</div>
      </div>`);
    } else {
      // Create more informative error messages
      const errorTitle = isSentenceLike ? 'Translation Error' : 'Definition Error';
      const errorMessage = response.message || (isSentenceLike ? 'Translation failed.' : 'Definition not found.');
      
      updatePopupContent(createErrorMessage(errorTitle, errorMessage));
    }
  });
}

// Format the data from the API into clean HTML
function formatData(data, ttsEnabled = false, enableTtsForWord = false) {
  const word = data.word;
  const translation = data.translation; // Word/phrase translation
  const pronunciation = data.pronunciation.find(p => p.lang === 'us' && p.pron) || data.pronunciation.find(p => p.pron);
  const audioUrl = pronunciation ? pronunciation.url : null;

  // Check if this is a phrase (more than one word)
  const words = word.split(/\s+/).filter(w => w.length > 0);
  const isPhrase = words.length > 1;
  const isSingleWord = words.length === 1;

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
        ${audioUrl ? `<button id="qdp-audio-btn" class="qdp-icon-btn" title="Play pronunciation" data-audio-src="${audioUrl}">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M7.46968 1.05085C7.64122 1.13475 7.75 1.30904 7.75 1.5V13.5C7.75 13.691 7.64122 13.8653 7.46968 13.9492C7.29813 14.0331 7.09377 14.0119 6.94303 13.8947L3.2213 11H1.5C0.671571 11 0 10.3284 0 9.5V5.5C0 4.67158 0.671573 4 1.5 4H3.2213L6.94303 1.10533C7.09377 0.988085 7.29813 0.966945 7.46968 1.05085ZM6.75 2.52232L3.69983 4.89468C3.61206 4.96294 3.50405 5 3.39286 5H1.5C1.22386 5 1 5.22386 1 5.5V9.5C1 9.77615 1.22386 10 1.5 10H3.39286C3.50405 10 3.61206 10.0371 3.69983 10.1053L6.75 12.4777V2.52232ZM10.2784 3.84804C10.4623 3.72567 10.7106 3.77557 10.833 3.95949C12.2558 6.09798 12.2558 8.90199 10.833 11.0405C10.7106 11.2244 10.4623 11.2743 10.2784 11.1519C10.0944 11.0296 10.0445 10.7813 10.1669 10.5973C11.4111 8.72728 11.4111 6.27269 10.1669 4.40264C10.0445 4.21871 10.0944 3.97041 10.2784 3.84804ZM12.6785 1.43044C12.5356 1.2619 12.2832 1.24104 12.1147 1.38386C11.9462 1.52667 11.9253 1.77908 12.0681 1.94762C14.7773 5.14488 14.7773 9.85513 12.0681 13.0524C11.9253 13.2209 11.9462 13.4733 12.1147 13.6161C12.2832 13.759 12.5356 13.7381 12.6785 13.5696C15.6406 10.0739 15.6406 4.92612 12.6785 1.43044Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
          </svg>
        </button>` : ''}
        ${isPhrase && ttsEnabled ? `<button id="qdp-tts-phrase-btn" class="qdp-icon-btn" title="Play phrase with TTS" data-tts-text="${word}">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M7.46968 1.05085C7.64122 1.13475 7.75 1.30904 7.75 1.5V13.5C7.75 13.691 7.64122 13.8653 7.46968 13.9492C7.29813 14.0331 7.09377 14.0119 6.94303 13.8947L3.2213 11H1.5C0.671571 11 0 10.3284 0 9.5V5.5C0 4.67158 0.671573 4 1.5 4H3.2213L6.94303 1.10533C7.09377 0.988085 7.29813 0.966945 7.46968 1.05085ZM6.75 2.52232L3.69983 4.89468C3.61206 4.96294 3.50405 5 3.39286 5H1.5C1.22386 5 1 5.22386 1 5.5V9.5C1 9.77615 1.22386 10 1.5 10H3.39286C3.50405 10 3.61206 10.0371 3.69983 10.1053L6.75 12.4777V2.52232ZM10.2784 3.84804C10.4623 3.72567 10.7106 3.77557 10.833 3.95949C12.2558 6.09798 12.2558 8.90199 10.833 11.0405C10.7106 11.2244 10.4623 11.2743 10.2784 11.1519C10.0944 11.0296 10.0445 10.7813 10.1669 10.5973C11.4111 8.72728 11.4111 6.27269 10.1669 4.40264C10.0445 4.21871 10.0944 3.97041 10.2784 3.84804ZM12.6785 1.43044C12.5356 1.2619 12.2832 1.24104 12.1147 1.38386C11.9462 1.52667 11.9253 1.77908 12.0681 1.94762C14.7773 5.14488 14.7773 9.85513 12.0681 13.0524C11.9253 13.2209 11.9462 13.4733 12.1147 13.6161C12.2832 13.759 12.5356 13.7381 12.6785 13.5696C15.6406 10.0739 15.6406 4.92612 12.6785 1.43044Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
          </svg>
        </button>` : ''}
        ${isSingleWord && enableTtsForWord ? `<button id="qdp-tts-word-btn" class="qdp-icon-btn" title="Play word with TTS" data-tts-text="${word}">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M7.46968 1.05085C7.64122 1.13475 7.75 1.30904 7.75 1.5V13.5C7.75 13.691 7.64122 13.8653 7.46968 13.9492C7.29813 14.0331 7.09377 14.0119 6.94303 13.8947L3.2213 11H1.5C0.671571 11 0 10.3284 0 9.5V5.5C0 4.67158 0.671573 4 1.5 4H3.2213L6.94303 1.10533C7.09377 0.988085 7.29813 0.966945 7.46968 1.05085ZM6.75 2.52232L3.69983 4.89468C3.61206 4.96294 3.50405 5 3.39286 5H1.5C1.22386 5 1 5.22386 1 5.5V9.5C1 9.77615 1.22386 10 1.5 10H3.39286C3.50405 10 3.61206 10.0371 3.69983 10.1053L6.75 12.4777V2.52232ZM10.2784 3.84804C10.4623 3.72567 10.7106 3.77557 10.833 3.95949C12.2558 6.09798 12.2558 8.90199 10.833 11.0405C10.7106 11.2244 10.4623 11.2743 10.2784 11.1519C10.0944 11.0296 10.0445 10.7813 10.1669 10.5973C11.4111 8.72728 11.4111 6.27269 10.1669 4.40264C10.0445 4.21871 10.0944 3.97041 10.2784 3.84804ZM12.6785 1.43044C12.5356 1.2619 12.2832 1.24104 12.1147 1.38386C11.9462 1.52667 11.9253 1.77908 12.0681 1.94762C14.7773 5.14488 14.7773 9.85513 12.0681 13.0524C11.9253 13.2209 11.9462 13.4733 12.1147 13.6161C12.2832 13.759 12.5356 13.7381 12.6785 13.5696C15.6406 10.0739 15.6406 4.92612 12.6785 1.43044Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
          </svg>
        </button>` : ''}
        <button id="qdp-save-btn" class="qdp-icon-btn" title="Save word" data-word-data='${JSON.stringify(data).replace(/'/g, "&#39;")}'>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M3 2.5C3 2.22386 3.22386 2 3.5 2H11.5C11.7761 2 12 2.22386 12 2.5V13.5C12 13.6818 11.9014 13.8492 11.7424 13.9373C11.5834 14.0254 11.3891 14.0203 11.235 13.924L7.5 11.5896L3.765 13.924C3.61087 14.0203 3.41659 14.0254 3.25762 13.9373C3.09864 13.8492 3 13.6818 3 13.5V2.5ZM4 3V12.5979L6.97 10.7416C7.29427 10.539 7.70573 10.539 8.03 10.7416L11 12.5979V3H4Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
          </svg>
        </button>
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
            ${ttsEnabled ? `<button id="qdp-tts-original-btn" class="qdp-icon-btn" title="Play original sentence" data-tts-text="${data.originalSentence}">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M7.46968 1.05085C7.64122 1.13475 7.75 1.30904 7.75 1.5V13.5C7.75 13.691 7.64122 13.8653 7.46968 13.9492C7.29813 14.0331 7.09377 14.0119 6.94303 13.8947L3.2213 11H1.5C0.671571 11 0 10.3284 0 9.5V5.5C0 4.67158 0.671573 4 1.5 4H3.2213L6.94303 1.10533C7.09377 0.988085 7.29813 0.966945 7.46968 1.05085ZM6.75 2.52232L3.69983 4.89468C3.61206 4.96294 3.50405 5 3.39286 5H1.5C1.22386 5 1 5.22386 1 5.5V9.5C1 9.77615 1.22386 10 1.5 10H3.39286C3.50405 10 3.61206 10.0371 3.69983 10.1053L6.75 12.4777V2.52232ZM10.2784 3.84804C10.4623 3.72567 10.7106 3.77557 10.833 3.95949C12.2558 6.09798 12.2558 8.90199 10.833 11.0405C10.7106 11.2244 10.4623 11.2743 10.2784 11.1519C10.0944 11.0296 10.0445 10.7813 10.1669 10.5973C11.4111 8.72728 11.4111 6.27269 10.1669 4.40264C10.0445 4.21871 10.0944 3.97041 10.2784 3.84804ZM12.6785 1.43044C12.5356 1.2619 12.2832 1.24104 12.1147 1.38386C11.9462 1.52667 11.9253 1.77908 12.0681 1.94762C14.7773 5.14488 14.7773 9.85513 12.0681 13.0524C11.9253 13.2209 11.9462 13.4733 12.1147 13.6161C12.2832 13.759 12.5356 13.7381 12.6785 13.5696C15.6406 10.0739 15.6406 4.92612 12.6785 1.43044Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
              </svg>
            </button>` : ''}
            <button id="qdp-save-btn" class="qdp-icon-btn" title="Save sentence" data-sentence-data='${JSON.stringify(data).replace(/'/g, "&#39;")}'>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M3 2.5C3 2.22386 3.22386 2 3.5 2H11.5C11.7761 2 12 2.22386 12 2.5V13.5C12 13.6818 11.9014 13.8492 11.7424 13.9373C11.5834 14.0254 11.3891 14.0203 11.235 13.924L7.5 11.5896L3.765 13.924C3.61087 14.0203 3.41659 14.0254 3.25762 13.9373C3.09864 13.8492 3 13.6818 3 13.5V2.5ZM4 3V12.5979L6.97 10.7416C7.29427 10.539 7.70573 10.539 8.03 10.7416L11 12.5979V3H4Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
              </svg>
            </button>
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
    preloadAudio(); // Preload audio files for instant playback
  }
}

// Pre-cache audio files from word data immediately when received
function precacheAudioFromData(data) {
  if (data && data.pronunciation) {
    // Look for audio URLs in pronunciation data
    data.pronunciation.forEach(pron => {
      if (pron.url && pron.url.trim() && !audioCache.has(pron.url)) {
        // Start preloading the audio immediately
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = pron.url;
        
        // Cache when ready to play
        audio.addEventListener('canplaythrough', () => {
          cleanupAudioCache();
          audioCache.set(pron.url, audio);
          console.log('Pre-cached pronunciation audio:', pron.url);
        }, { once: true });
        
        // Start loading silently in background
        audio.load();
      }
    });
  }
}

// Preload audio files for instant playback
function preloadAudio() {
  const audioButton = document.getElementById('qdp-audio-btn');
  if (audioButton) {
    const audioSrc = audioButton.getAttribute('data-audio-src');
    if (audioSrc && !audioCache.has(audioSrc)) {
      // Only preload if not already cached (precacheAudioFromData might have already done this)
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = audioSrc;
      
      // Cache when ready
      audio.addEventListener('canplaythrough', () => {
        cleanupAudioCache();
        audioCache.set(audioSrc, audio);
        console.log('Preloaded pronunciation audio from popup:', audioSrc);
      }, { once: true });
      
      // Start loading
      audio.load();
    } else if (audioSrc && audioCache.has(audioSrc)) {
      console.log('Audio already cached:', audioSrc);
    }
  }
}

// Add event listeners to popup elements
function addPopupEventListeners() {
  const audioButton = document.getElementById('qdp-audio-btn');
  if(audioButton) {
      audioButton.addEventListener('click', playAudio);
  }
  
  // Add TTS event listeners
  const ttsPhraseBtns = document.querySelectorAll('#qdp-tts-phrase-btn, #qdp-tts-original-btn, #qdp-tts-word-btn');
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
    const button = event.currentTarget || event.target;
    const audioSrc = button.getAttribute('data-audio-src');
    if (audioSrc) {
        // Use audio URL as cache key
        const cacheKey = audioSrc;
        
        // Check if audio is already cached
        if (audioCache.has(cacheKey)) {
            const cachedAudio = audioCache.get(cacheKey);
            cachedAudio.currentTime = 0; // Reset to beginning
            cachedAudio.play().catch(error => {
                console.error('Cached pronunciation playback failed:', error);
                // Show user-friendly error message for audio playback failure
                if (error.name === 'NotAllowedError') {
                    alert('🔊 Audio playback blocked by browser. Please enable audio autoplay or click the audio button again.');
                } else if (error.name === 'NotSupportedError') {
                    alert('🔊 Audio format not supported by your browser. Please try a different browser or update your current one.');
                } else {
                    alert('🔊 Audio playback failed. Please check your internet connection and try again.');
                }
            });
            return;
        }
        
        // Create new audio object with preloading
        const audio = new Audio();
        audio.preload = 'auto'; // Enable preloading
        audio.src = audioSrc;
        
        // Cache the audio once it's loaded and ready to play
        audio.addEventListener('canplaythrough', () => {
            cleanupAudioCache(); // Check cache size before adding
            audioCache.set(cacheKey, audio);
        }, { once: true }); // Only fire once
        
        // Add error handling for audio loading/playback
        audio.addEventListener('error', (e) => {
            console.error('Audio loading/playback error:', e);
            const errorType = e.target.error?.code;
            let userMessage = '🔊 Audio playback failed. ';
            
            switch (errorType) {
                case MediaError.MEDIA_ERR_ABORTED:
                    userMessage += 'Playback was interrupted.';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    userMessage += 'Network error occurred while loading audio.';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    userMessage += 'Audio file is corrupted or unsupported.';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    userMessage += 'Audio format not supported by your browser.';
                    break;
                default:
                    userMessage += 'Please check your internet connection and try again.';
            }
            
            alert(userMessage);
        });
        
        // Start loading the audio and play when ready
        audio.load();
        audio.play().catch(error => {
            console.error('Pronunciation playback failed:', error);
            // Show user-friendly error message for audio playback failure
            if (error.name === 'NotAllowedError') {
                alert('🔊 Audio playback blocked by browser. Please enable audio autoplay for this site or click the audio button again after interacting with the page.');
            } else if (error.name === 'NotSupportedError') {
                alert('🔊 Audio format not supported by your browser. Please try a different browser or update your current one.');
            } else if (error.name === 'AbortError') {
                // User likely clicked again quickly, no need to show error
                console.log('Audio playback aborted (likely due to rapid clicking)');
            } else {
                alert('🔊 Audio playback failed. Please check your internet connection and try again.');
            }
        });
    }
}

function playTTS(event) {
    const button = event.currentTarget || event.target;
    const text = button.getAttribute('data-tts-text');
    
    if (text) {
        // Check word count to ensure it's a phrase or sentence
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        
        if (words.length < 2) {
            console.log('TTS is only available for phrases (2+ words), not individual words.');
            // Show a subtle notification to the user
            const button = event.currentTarget || event.target;
            const originalTitle = button.title;
            button.title = 'TTS is only available for phrases with 2+ words';
            setTimeout(() => {
                button.title = originalTitle;
            }, 3000);
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
        const ttsUrl = API_URLS.tts(text);
        
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
                    if (response.status === 401) {
                        throw new Error('TTS authentication failed. Please verify your ElevenLabs API key is correct and has not expired.');
                    } else if (response.status === 403) {
                        throw new Error('TTS access denied. Your ElevenLabs API key may not have permission to access the TTS service.');
                    } else if (response.status === 429) {
                        throw new Error('TTS rate limit exceeded. Please wait a moment and try again, or check your ElevenLabs API quota.');
                    } else if (response.status >= 500) {
                        throw new Error('TTS service temporarily unavailable. Please try again later.');
                    } else {
                        throw new Error(`TTS request failed (${response.status}). Please check your internet connection and try again.`);
                    }
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
                    console.error('TTS Audio playback error:', e);
                    const errorType = e.target.error?.code;
                    let userMessage = '🔊 Text-to-speech playback failed. ';
                    
                    switch (errorType) {
                        case MediaError.MEDIA_ERR_ABORTED:
                            userMessage += 'Playback was interrupted.';
                            break;
                        case MediaError.MEDIA_ERR_NETWORK:
                            userMessage += 'Network error occurred while playing TTS audio.';
                            break;
                        case MediaError.MEDIA_ERR_DECODE:
                            userMessage += 'TTS audio file is corrupted.';
                            break;
                        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                            userMessage += 'TTS audio format not supported by your browser.';
                            break;
                        default:
                            userMessage += 'Please try again.';
                    }
                    
                    alert(userMessage);
                });
                
                // Play the audio
                audio.play().catch(error => {
                    console.error('TTS playback failed:', error);
                    if (error.name === 'NotAllowedError') {
                        alert('🔊 Text-to-speech playback blocked by browser. Please enable audio autoplay for this site or click the TTS button again after interacting with the page.');
                    } else if (error.name === 'NotSupportedError') {
                        alert('🔊 TTS audio format not supported by your browser. Please try a different browser.');
                    } else {
                        alert('🔊 Text-to-speech playback failed. Please try again.');
                    }
                });
            })
            .catch(error => {
                console.error('TTS fetch failed:', error);
                // Provide specific error messages based on error type
                let userMessage = error.message;
                if (!userMessage.includes('TTS')) {
                    if (error.message.includes('fetch') || error.message.includes('network')) {
                        userMessage = '🔊 TTS service unavailable. Please check your internet connection and try again.';
                    } else if (error.message.includes('API key')) {
                        userMessage = `🔊 ${error.message}`;
                    } else {
                        userMessage = '🔊 Text-to-speech failed. Please try again or check your TTS settings.';
                    }
                }
                alert(userMessage);
            });
    }
}

function saveWord(event) {
    // Ensure the popup doesn't disappear due to bubbling
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    // Support clicks on SVG/path inside the button
    const button = event.currentTarget || event.target;
    const wordData = button.getAttribute('data-word-data');
    const sentenceData = button.getAttribute('data-sentence-data');

    const isAlreadySaved = button.classList.contains('qdp-saved');
    
    if (wordData) {
        // Toggle: if already saved, unsave and revert icon
        if (isAlreadySaved) {
            try {
                const data = JSON.parse(wordData);
                const text = data.word;
                const type = data.word.split(/\s+/).length > 1 ? 'phrase' : 'word';

                chrome.runtime.sendMessage({
                    type: 'unsaveWord',
                    data: { text, type }
                });

                // Revert to unfilled bookmark icon
                button.innerHTML = `
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M3 2.5C3 2.22386 3.22386 2 3.5 2H11.5C11.7761 2 12 2.22386 12 2.5V13.5C12 13.6818 11.9014 13.8492 11.7424 13.9373C11.5834 14.0254 11.3891 14.0203 11.235 13.924L7.5 11.5896L3.765 13.924C3.61087 14.0203 3.41659 14.0254 3.25762 13.9373C3.09864 13.8492 3 13.6818 3 13.5V2.5ZM4 3V12.5979L6.97 10.7416C7.29427 10.539 7.70573 10.539 8.03 10.7416L11 12.5979V3H4Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
                  </svg>`;
                button.title = 'Save word';
                button.setAttribute('aria-pressed', 'false');
                button.classList.remove('qdp-saved');
            } catch (error) {
                console.error('Error unsaving word:', error);
            }
            return;
        }
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
            
            // Update button to show saved state with filled bookmark icon
            button.innerHTML = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 2C3.22386 2 3 2.22386 3 2.5V13.5C3 13.6818 3.09864 13.8492 3.25762 13.9373C3.41659 14.0254 3.61087 14.0203 3.765 13.924L7.5 11.5896L11.235 13.924C11.3891 14.0203 11.5834 14.0254 11.7424 13.9373C11.9014 13.8492 12 13.6818 12 13.5V2.5C12 2.22386 11.7761 2 11.5 2H3.5Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path></svg>`;
            button.title = 'Saved!';
            button.setAttribute('aria-pressed', 'true');
            button.classList.add('qdp-saved');
            
        } catch (error) {
            console.error('Error saving word:', error);
            alert('📝 Failed to save word: Unable to parse word data. Please try selecting the word again.');
        }
    } else if (sentenceData) {
        if (isAlreadySaved) {
            try {
                const data = JSON.parse(sentenceData);
                const text = data.originalSentence;
                const type = 'sentence';

                chrome.runtime.sendMessage({
                    type: 'unsaveWord',
                    data: { text, type }
                });

                // Revert to unfilled bookmark icon
                button.innerHTML = `
                  <svg width=\"15\" height=\"15\" viewBox=\"0 0 15 15\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\">\n                    <path d=\"M3 2.5C3 2.22386 3.22386 2 3.5 2H11.5C11.7761 2 12 2.22386 12 2.5V13.5C12 13.6818 11.9014 13.8492 11.7424 13.9373C11.5834 14.0254 11.3891 14.0203 11.235 13.924L7.5 11.5896L3.765 13.924C3.61087 14.0203 3.41659 14.0254 3.25762 13.9373C3.09864 13.8492 3 13.6818 3 13.5V2.5ZM4 3V12.5979L6.97 10.7416C7.29427 10.539 7.70573 10.539 8.03 10.7416L11 12.5979V3H4Z\" fill=\"currentColor\" fill-rule=\"evenodd\" clip-rule=\"evenodd\"></path>\n                  </svg>`;
                button.title = 'Save sentence';
                button.setAttribute('aria-pressed', 'false');
                button.classList.remove('qdp-saved');
            } catch (error) {
                console.error('Error unsaving sentence:', error);
            }
            return;
        }
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
            
            // Update button to show saved state with filled bookmark icon
            button.innerHTML = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 2C3.22386 2 3 2.22386 3 2.5V13.5C3 13.6818 3.09864 13.8492 3.25762 13.9373C3.41659 14.0254 3.61087 14.0203 3.765 13.924L7.5 11.5896L11.235 13.924C11.3891 14.0203 11.5834 14.0254 11.7424 13.9373C11.9014 13.8492 12 13.6818 12 13.5V2.5C12 2.22386 11.7761 2 11.5 2H3.5Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path></svg>`;
            button.title = 'Saved!';
            button.setAttribute('aria-pressed', 'true');
            button.classList.add('qdp-saved');
            
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