let popup = null;

// Listen for double-clicks on the page
document.addEventListener('dblclick', handleSelection);

function handleSelection(event) {
  const selectedText = window.getSelection().toString().trim();
  
  if (selectedText.length > 0 && /^[a-zA-Z]+$/.test(selectedText)) {
    // Remove existing popup if it exists
    removePopup();
    
    // Create a placeholder popup while fetching
    createPopup(event.clientX, event.clientY, `<span>Loading definition for "<strong>${selectedText}</strong>"...</span>`);
    
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
  // Let's try to get a US pronunciation first, then fall back to any other
  const pronunciation = data.pronunciation.find(p => p.lang === 'us' && p.pron) || data.pronunciation.find(p => p.pron);
  const definition = data.definition[0]; // Get the first definition block
  const example = definition.example[0]; // Get the first example

  const audioUrl = pronunciation ? pronunciation.url : null;
  const partOfSpeech = definition.pos; // <-- Get the part of speech from the definition

  return `
    <div class="qdp-header">
      <span class="qdp-word">${word}</span>
      <span class="qdp-pron">${pronunciation ? pronunciation.pron : ''}</span>
      ${audioUrl ? `<button id="qdp-audio-btn" title="Play pronunciation" data-audio-src="${audioUrl}">🔊</button>` : ''}
    </div>
    <div class="qdp-body">
      <div class="qdp-definition">
        <span class="qdp-pos">${partOfSpeech}</span>
        ${definition.text}
      </div>
      ${example ? `<div class="qdp-example">e.g., "<em>${example.text}</em>"</div>` : ''}
    </div>
  `;
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