// Source descriptions for each option
const sourceDescriptions = {
  'cambridge': 'Fast and reliable definitions from Cambridge Dictionary via local server. Single words only.',
  'merriam-webster': 'Authoritative definitions from America\'s most trusted dictionary. Single words only. Requires API key.',
  'gemini': 'AI-powered definitions from Google Gemini. Requires API key. Supports single words, phrases & sentences.'
};

// Show/hide API key sections and translation section based on selected source
function updateSourceUI() {
  const source = document.getElementById('source').value;
  const mwApiSection = document.getElementById('mw-api-section');
  const geminiApiSection = document.getElementById('gemini-api-section');
  const translationSection = document.getElementById('translation-section');
  const description = document.getElementById('source-description');
  
  description.textContent = sourceDescriptions[source];
  
  // MW key
  if (source === 'merriam-webster') mwApiSection.classList.remove('hidden');
  else mwApiSection.classList.add('hidden');
  
  // Gemini key
  if (source === 'gemini') geminiApiSection.classList.remove('hidden');
  else geminiApiSection.classList.add('hidden');
  
  // Translation only for Gemini
  if (source === 'gemini') translationSection.classList.remove('hidden');
  else translationSection.classList.add('hidden');
}

// Show/hide ElevenLabs API section based on TTS enabled status
function updateTTSUI() {
  const ttsEnabled = document.getElementById('tts-enabled').checked;
  const elevenlabsSection = document.getElementById('elevenlabs-api-section');
  
  if (ttsEnabled) elevenlabsSection.classList.remove('hidden');
  else elevenlabsSection.classList.add('hidden');
}

// Function to mask API key for display (show dots instead of actual key)
function maskApiKey(key) {
  if (!key || key.length === 0) return '';
  if (key.length <= 8) return '•'.repeat(key.length);
  return key.substring(0, 4) + '•'.repeat(key.length - 8) + key.substring(key.length - 4);
}

// Function to unmask API key (restore original for editing)
function unmaskApiKey(key, originalKey) {
  // If the key contains bullets, it's masked, return original
  if (key.includes('•')) return originalKey;
  // Otherwise, it's been edited, return the new key
  return key;
}

// Store original keys for masking/unmasking
let originalKeys = {
  mwApiKey: '',
  geminiApiKey: '',
  elevenlabsApiKey: ''
};

// Navigation functionality
function initializeNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const contentSections = document.querySelectorAll('.content-section');

  navItems.forEach(item => {
    item.addEventListener('click', function() {
      const targetSection = this.getAttribute('data-section');
      
      // Update active nav item
      navItems.forEach(nav => nav.classList.remove('active'));
      this.classList.add('active');
      
      // Show target section
      contentSections.forEach(section => section.classList.remove('active'));
      document.getElementById(targetSection).classList.add('active');
    });
  });
}

// Saves options to chrome.storage
function save_options() {
  const source = document.getElementById('source').value;
  const mwKey = unmaskApiKey(document.getElementById('mw-key').value, originalKeys.mwApiKey);
  const geminiKey = unmaskApiKey(document.getElementById('gemini-key').value, originalKeys.geminiApiKey);
  const elevenlabsKey = unmaskApiKey(document.getElementById('elevenlabs-key').value, originalKeys.elevenlabsApiKey);
  const targetLanguage = document.getElementById('target-language').value;
  const definitionScope = document.getElementById('definition-scope').value;
  const exampleCount = parseInt(document.getElementById('example-count').value, 10);
  const ttsEnabled = document.getElementById('tts-enabled').checked;

  // Validate Merriam-Webster key
  if (source === 'merriam-webster' && !mwKey.trim()) {
    const status = document.getElementById('status');
    status.textContent = 'Please enter a Merriam-Webster API key.';
    status.style.color = '#dc3545';
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 3000);
    return;
  }
  // Validate Gemini key
  if (source === 'gemini' && !geminiKey.trim()) {
    const status = document.getElementById('status');
    status.textContent = 'Please enter a Gemini AI API key.';
    status.style.color = '#dc3545';
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 3000);
    return;
  }
  // Validate ElevenLabs key when TTS is enabled
  if (ttsEnabled && !elevenlabsKey.trim()) {
    const status = document.getElementById('status');
    status.textContent = 'Please enter an ElevenLabs API key to enable TTS.';
    status.style.color = '#dc3545';
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 3000);
    return;
  }

  chrome.storage.local.set({
    preferredSource: source,
    mwApiKey: mwKey,
    geminiApiKey: geminiKey,
    elevenlabsApiKey: elevenlabsKey,
    targetLanguage: targetLanguage,
    definitionScope: definitionScope,
    exampleCount: exampleCount,
    ttsEnabled: ttsEnabled
  }, function() {
    // Update original keys for masking
    originalKeys.mwApiKey = mwKey;
    originalKeys.geminiApiKey = geminiKey;
    originalKeys.elevenlabsApiKey = elevenlabsKey;
    
    // Re-mask the displayed values
    if (mwKey) document.getElementById('mw-key').value = maskApiKey(mwKey);
    if (geminiKey) document.getElementById('gemini-key').value = maskApiKey(geminiKey);
    if (elevenlabsKey) document.getElementById('elevenlabs-key').value = maskApiKey(elevenlabsKey);
    
    const status = document.getElementById('status');
    status.textContent = 'Settings saved!';
    status.style.color = '#28a745';
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 2000);
  });
}

// Restores select box and input field state using stored preferences
function restore_options() {
  chrome.storage.local.get({
    preferredSource: 'cambridge',
    mwApiKey: '',
    geminiApiKey: '',
    elevenlabsApiKey: '',
    targetLanguage: 'none',
    definitionScope: 'relevant',
    exampleCount: 1,
    ttsEnabled: false
  }, function(items) {
    // Store original keys
    originalKeys.mwApiKey = items.mwApiKey;
    originalKeys.geminiApiKey = items.geminiApiKey;
    originalKeys.elevenlabsApiKey = items.elevenlabsApiKey;
    
    document.getElementById('source').value = items.preferredSource;
    // Display masked versions of API keys
    document.getElementById('mw-key').value = items.mwApiKey ? maskApiKey(items.mwApiKey) : '';
    document.getElementById('gemini-key').value = items.geminiApiKey ? maskApiKey(items.geminiApiKey) : '';
    document.getElementById('elevenlabs-key').value = items.elevenlabsApiKey ? maskApiKey(items.elevenlabsApiKey) : '';
    document.getElementById('target-language').value = items.targetLanguage;
    document.getElementById('definition-scope').value = items.definitionScope;
    document.getElementById('example-count').value = items.exampleCount;
    document.getElementById('tts-enabled').checked = items.ttsEnabled;
    
    updateSourceUI();
    updateTTSUI();
  });
}

// Initialize saved words functionality
function initializeSavedWords() {
  // This would load and display saved words
  // For now, it's just a placeholder
  loadSavedWords();
}

function loadSavedWords() {
  chrome.storage.local.get(['savedWords'], function(result) {
    const savedWords = result.savedWords || [];
    const wordsList = document.getElementById('wordsList');
    const wordsCount = document.querySelector('.words-count');
    
    wordsCount.textContent = `${savedWords.length} words saved`;
    
    if (savedWords.length === 0) {
      wordsList.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
          </svg>
          <h3>No saved words yet</h3>
          <p>Words you look up will appear here for future reference</p>
        </div>
      `;
    } else {
      wordsList.innerHTML = savedWords.map(word => `
        <div class="word-item">
          <div class="word-info">
            <h4>${word.word}</h4>
            <div class="word-definition">${word.definition}</div>
            <div class="word-date">${new Date(word.timestamp).toLocaleDateString()}</div>
          </div>
          <div class="word-actions">
            <button class="btn btn-danger" onclick="removeWord('${word.word}')">Remove</button>
          </div>
        </div>
      `).join('');
    }
  });
}

function removeWord(word) {
  chrome.storage.local.get(['savedWords'], function(result) {
    const savedWords = result.savedWords || [];
    const updatedWords = savedWords.filter(w => w.word !== word);
    chrome.storage.local.set({ savedWords: updatedWords }, function() {
      loadSavedWords();
    });
  });
}

// Initialize export functionality
function initializeExport() {
  // Add event listeners for export buttons
  const exportButtons = document.querySelectorAll('.export-card .btn');
  exportButtons.forEach((button, index) => {
    button.addEventListener('click', function() {
      switch(index) {
        case 0: exportAsCSV(); break;
        case 1: exportAsJSON(); break;
        case 2: exportSettings(); break;
      }
    });
  });
}

function exportAsCSV() {
  chrome.storage.local.get(['savedWords'], function(result) {
    const savedWords = result.savedWords || [];
    if (savedWords.length === 0) {
      alert('No words to export');
      return;
    }
    
    const csvContent = "data:text/csv;charset=utf-8,"
      + "Word,Definition,Date\n"
      + savedWords.map(word => 
          `"${word.word}","${word.definition}","${new Date(word.timestamp).toLocaleDateString()}"`
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "semantix_words.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

function exportAsJSON() {
  chrome.storage.local.get(['savedWords'], function(result) {
    const savedWords = result.savedWords || [];
    if (savedWords.length === 0) {
      alert('No words to export');
      return;
    }
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(savedWords, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", "semantix_words.json");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

function exportSettings() {
  chrome.storage.local.get(null, function(result) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", "semantix_settings.json");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  // Initialize all components
  initializeNavigation();
  restore_options();
  initializeSavedWords();
  initializeExport();
  
  // Set up event listeners
  document.getElementById('source').addEventListener('change', updateSourceUI);
  document.getElementById('tts-enabled').addEventListener('change', updateTTSUI);
  
  // Add focus/blur events for API key masking
  const mwKeyField = document.getElementById('mw-key');
  const geminiKeyField = document.getElementById('gemini-key');
  const elevenlabsKeyField = document.getElementById('elevenlabs-key');
  
  // MW API Key events
  mwKeyField.addEventListener('focus', function() {
    if (this.value.includes('•')) {
      this.value = originalKeys.mwApiKey;
    }
  });
  
  mwKeyField.addEventListener('blur', function() {
    if (this.value && !this.value.includes('•')) {
      originalKeys.mwApiKey = this.value;
      this.value = maskApiKey(this.value);
    }
  });
  
  // Gemini API Key events
  geminiKeyField.addEventListener('focus', function() {
    if (this.value.includes('•')) {
      this.value = originalKeys.geminiApiKey;
    }
  });
  
  geminiKeyField.addEventListener('blur', function() {
    if (this.value && !this.value.includes('•')) {
      originalKeys.geminiApiKey = this.value;
      this.value = maskApiKey(this.value);
    }
  });
  
  // ElevenLabs API Key events
  elevenlabsKeyField.addEventListener('focus', function() {
    if (this.value.includes('•')) {
      this.value = originalKeys.elevenlabsApiKey;
    }
  });
  
  elevenlabsKeyField.addEventListener('blur', function() {
    if (this.value && !this.value.includes('•')) {
      originalKeys.elevenlabsApiKey = this.value;
      this.value = maskApiKey(this.value);
    }
  });

  // Form submission
  document.getElementById('optionsForm').addEventListener('submit', function(e) {
    e.preventDefault();
    save_options();
  });

  // Search functionality for saved words
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const searchTerm = this.value.toLowerCase();
      const wordItems = document.querySelectorAll('.word-item');
      
      wordItems.forEach(item => {
        const word = item.querySelector('h4').textContent.toLowerCase();
        const definition = item.querySelector('.word-definition').textContent.toLowerCase();
        
        if (word.includes(searchTerm) || definition.includes(searchTerm)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    });
  }
});