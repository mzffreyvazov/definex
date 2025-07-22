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
  
  if (selectedText.length > 0 && /^[a-zA-Z]+$/.test(selectedText)) {
    // Remove existing popup if it exists
    removePopup();
    
    // Get the current source setting to show in loading message
    chrome.storage.local.get(['preferredSource'], (settings) => {
      const source = settings.preferredSource || 'cambridge';
      const sourceDisplayName = getSourceDisplayName(source);
      
      let loadingMessage;
      if (source === 'gemini') {
        loadingMessage = `<span style="font-family: 'Open Sans', sans-serif;">Loading definition for "<strong>${selectedText}</strong>" from <em>${sourceDisplayName}</em> with audio from <em>Cambridge</em>...</span>`;
      } else {
        loadingMessage = `<span style="font-family: 'Open Sans', sans-serif;">Loading definition for "<strong>${selectedText}</strong>" from <em>${sourceDisplayName}</em>...</span>`;
      }
      
      // Create a placeholder popup while fetching
      createPopup(event.clientX, event.clientY, loadingMessage);
    });
    
    // Send the selected word to the background script
    chrome.runtime.sendMessage({ type: 'getDefinition', word: selectedText }, (response) => {
      if (chrome.runtime.lastError) {
        // Handle potential errors like the background script not being ready
        updatePopupContent('Error: Could not connect to the extension.');
        return;
      }

      if (response.status === 'success') {
        const content = formatData(response.data);
        updatePopupContent(content);
      } else {
        updatePopupContent(`Error: ${response.message || 'Definition not found.'}`);
      }
    });
  }
}

// Format the data from the API into clean HTML
// Format the data from the API into clean HTML
function formatData(data) {
  const word = data.word;
  const pronunciation = data.pronunciation.find(p => p.lang === 'us' && p.pron) || data.pronunciation.find(p => p.pron);
  const audioUrl = pronunciation ? pronunciation.url : null;

  // Start with the header
  const headerHTML = `
    <div class="qdp-header">
      <span class="qdp-word">${word}</span>
      <span class="qdp-pron">${pronunciation ? pronunciation.pron : ''}</span>
      ${audioUrl ? `<button id="qdp-audio-btn" title="Play pronunciation" data-audio-src="${audioUrl}">🔊</button>` : ''}
    </div>
  `;

  // Generate HTML for each definition block
  const definitionsHTML = data.definition.map(def => {
    // Generate HTML for each example within this definition
    const examplesHTML = def.example.map(ex => 
      `<div class="qdp-example">e.g., "<em>${ex.text}</em>"</div>`
    ).join('');

    return `
      <div class="qdp-definition-block">
        <div class="qdp-definition">
          <span class="qdp-pos">${def.pos}</span>
          ${def.text}
        </div>
        ${examplesHTML}
      </div>
    `;
  }).join('');

  return headerHTML + `<div class="qdp-body">${definitionsHTML}</div>`;
}

// Create and display the popup on the page
function createPopup(x, y, content) {
  popup = document.createElement('div');
  popup.id = 'quick-def-popup';
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