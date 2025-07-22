let popup = null;

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
        const content = isSentence ? formatTranslationData(response.data) : formatData(response.data);
        updatePopupContent(content);
      } else {
        updatePopupContent(`Error: ${response.message || (isSentence ? 'Translation failed.' : 'Definition not found.')}`);
      }
    });
  });
}

// Format the data from the API into clean HTML
function formatData(data) {
  const word = data.word;
  const translation = data.translation; // Word/phrase translation
  const pronunciation = data.pronunciation.find(p => p.lang === 'us' && p.pron) || data.pronunciation.find(p => p.pron);
  const audioUrl = pronunciation ? pronunciation.url : null;

  // Start with the header, including translation if available
  let headerHTML = `
    <div class="qdp-header">
      <span class="qdp-word">${word}</span>
      <span class="qdp-pron">${pronunciation ? pronunciation.pron : ''}</span>
      ${audioUrl ? `<button id="qdp-audio-btn" title="Play pronunciation" data-audio-src="${audioUrl}">🔊</button>` : ''}
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
function formatTranslationData(data) {
  let html = `
    <div class="qdp-sentence-header">
      <div class="qdp-sentence-original">
        <span class="qdp-sentence-label">Original:</span>
        <div class="qdp-sentence-text">"${data.originalSentence}"</div>
      </div>
      <div class="qdp-sentence-translation">
        <span class="qdp-sentence-label">Translation (${data.targetLanguage}):</span>
        <div class="qdp-sentence-text">"${data.translation}"</div>
      </div>
    </div>
  `;

  // Add context if available
  if (data.context) {
    html += `
      <div class="qdp-sentence-context">
        <span class="qdp-sentence-context-label">Context:</span>
        <div class="qdp-sentence-context-text">${data.context}</div>
      </div>
    `;
  }

  // Add literal translation if available and different
  if (data.literalTranslation && data.literalTranslation !== data.translation) {
    html += `
      <div class="qdp-sentence-literal">
        <span class="qdp-sentence-literal-label">Literal:</span>
        <div class="qdp-sentence-literal-text">"${data.literalTranslation}"</div>
      </div>
    `;
  }

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
        <span class="qdp-key-phrases-label">Key Phrases:</span>
        <div class="qdp-key-phrases-list">${keyPhrasesHTML}</div>
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
}

// Update the content of the existing popup
function updatePopupContent(content) {
  if (popup) {
    popup.innerHTML = content;
    const audioButton = document.getElementById('qdp-audio-btn');
    if(audioButton) {
        audioButton.addEventListener('click', playAudio);
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