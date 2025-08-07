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
    
    wordsCount.textContent = `${savedWords.length} items saved`;
    
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
      // Create table structure
      wordsList.innerHTML = `
        <div class="words-table-container">
          <table class="words-table">
            <thead>
              <tr>
                <th class="text-col">Text</th>
                <th class="type-col">Content Type</th>
                <th class="pronunciation-col">Pronunciation</th>
                <th class="pos-col">Part of Speech</th>
                <th class="definition-col">Definition</th>
                <th class="translation-col">Translation</th>
                <th class="examples-col">Examples</th>
                <th class="date-col">Date Added</th>
              </tr>
            </thead>
            <tbody>
              ${savedWords.map(item => {
                const typeIcon = item.type === 'sentence' ? '📝' : item.type === 'phrase' ? '💬' : '📖';
                
                // Prepare definitions text
                let definitionsText = '';
                if (item.definitions && item.definitions.length > 0) {
                  definitionsText = item.definitions.map(def => def.text).join('; ');
                }
                
                // Prepare examples text
                let examplesText = '';
                if (item.definitions && item.definitions.length > 0) {
                  const allExamples = item.definitions.flatMap(def => def.examples || []);
                  examplesText = allExamples.map((ex, index) => `${index + 1}. ${ex.text}`).join('<br>');
                }
                
                // Handle key phrases for sentences
                if (item.keyPhrases && item.keyPhrases.length > 0) {
                  const keyPhrasesText = item.keyPhrases.map((phrase, index) => {
                    const startIndex = examplesText ? (item.definitions?.flatMap(def => def.examples || []).length || 0) : 0;
                    return `${startIndex + index + 1}. ${phrase.original} → ${phrase.translation}`;
                  }).join('<br>');
                  if (examplesText) {
                    examplesText += '<br>' + keyPhrasesText;
                  } else {
                    examplesText = keyPhrasesText;
                  }
                }
                
                return `
                  <tr class="word-row" data-type="${item.type}" data-id="${item.id}">
                    <td class="text-cell">
                      <div class="cell-content">
                        <span class="word-text">${item.text}</span>
                      </div>
                    </td>
                    <td class="type-cell">
                      <div class="cell-content">
                        <span class="type-badge">${item.type}</span>
                      </div>
                    </td>
                    <td class="pronunciation-cell">
                      <div class="cell-content">
                        ${item.pronunciation || '-'}
                      </div>
                    </td>
                    <td class="pos-cell">
                      <div class="cell-content">
                        ${item.partOfSpeech ? `<span class="pos-badge">${item.partOfSpeech}</span>` : '-'}
                      </div>
                    </td>
                    <td class="definition-cell">
                      <div class="cell-content" title="${definitionsText}">
                        ${definitionsText || '-'}
                      </div>
                    </td>
                    <td class="translation-cell">
                      <div class="cell-content" title="${item.translation || ''}">
                        ${item.translation || '-'}
                      </div>
                    </td>
                    <td class="examples-cell">
                      <div class="cell-content" title="${examplesText}">
                        ${examplesText || '-'}
                      </div>
                    </td>
                    <td class="date-cell">
                      <div class="cell-content">
                        ${new Date(item.savedAt).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Add functionality after loading the words (removed checkbox functionality)
  });
}

function removeWord(wordId) {
  chrome.storage.local.get(['savedWords'], function(result) {
    const savedWords = result.savedWords || [];
    const updatedWords = savedWords.filter(w => w.id !== wordId);
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
  // Show loading feedback
  const exportButton = document.querySelector('.export-card:first-child .btn');
  const originalText = exportButton.textContent;
  exportButton.textContent = 'Exporting...';
  exportButton.disabled = true;
  
  chrome.storage.local.get(['savedWords'], function(result) {
    try {
      const savedWords = result.savedWords || [];
      if (savedWords.length === 0) {
        showExportMessage('No words to export', 'warning');
        return;
      }
      
      // Create enhanced CSV header with more comprehensive columns
      const header = "Type,Text,Pronunciation,Part of Speech,Definition,Translation,Examples,Audio URL,Saved Date\n";
      
      // Process each saved item
      const csvRows = savedWords.map(item => {
        const type = item.type || 'unknown';
        const text = item.text || '';
        const pronunciation = item.pronunciation || '';
        const pos = item.partOfSpeech || '';
        
        // Combine all definitions with better formatting
        let definitions = '';
        let examples = '';
        let translations = '';
        
        if (item.definitions && item.definitions.length > 0) {
          definitions = item.definitions.map(def => def.text).join(' | ');
          
          // Collect examples from all definitions
          const allExamples = item.definitions
            .flatMap(def => def.examples || [])
            .map(ex => ex.text || ex)
            .filter(ex => ex && ex.trim())
            .join(' | ');
          examples = allExamples;
          
          // Collect translations from definitions
          const defTranslations = item.definitions
            .map(def => def.translation)
            .filter(trans => trans && trans.trim())
            .join(' | ');
          translations = defTranslations || item.translation || '';
        } else {
          translations = item.translation || '';
        }
        
        const audioUrl = item.audioUrl || '';
        const date = item.savedAt ? new Date(item.savedAt).toLocaleDateString() : new Date().toLocaleDateString();
        
        // Enhanced CSV escaping function
        const escapeCSV = (str) => {
          if (!str) return '""';
          const cleanStr = str.toString().replace(/"/g, '""');
          return `"${cleanStr}"`;
        };
        
        return [
          escapeCSV(type),
          escapeCSV(text),
          escapeCSV(pronunciation),
          escapeCSV(pos),
          escapeCSV(definitions),
          escapeCSV(translations),
          escapeCSV(examples),
          escapeCSV(audioUrl),
          escapeCSV(date)
        ].join(',');
      });
      
      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + header + csvRows.join("\n");
      
      // Create download with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `semantix_words_${timestamp}.csv`;
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showExportMessage(`Successfully exported ${savedWords.length} items to ${filename}`, 'success');
      
    } catch (error) {
      console.error('Error exporting CSV:', error);
      showExportMessage('Error occurred during export. Please try again.', 'error');
    } finally {
      // Restore button state
      exportButton.textContent = originalText;
      exportButton.disabled = false;
    }
  });
}

function exportAsJSON() {
  // Show loading feedback
  const exportButton = document.querySelector('.export-card:nth-child(2) .btn');
  const originalText = exportButton.textContent;
  exportButton.textContent = 'Exporting...';
  exportButton.disabled = true;
  
  chrome.storage.local.get(['savedWords'], function(result) {
    try {
      const savedWords = result.savedWords || [];
      if (savedWords.length === 0) {
        showExportMessage('No words to export', 'warning');
        return;
      }
      
      // Create download with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `semantix_words_${timestamp}.json`;
      
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(savedWords, null, 2));
      const link = document.createElement("a");
      link.setAttribute("href", dataStr);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showExportMessage(`Successfully exported ${savedWords.length} items to ${filename}`, 'success');
      
    } catch (error) {
      console.error('Error exporting JSON:', error);
      showExportMessage('Error occurred during export. Please try again.', 'error');
    } finally {
      // Restore button state
      exportButton.textContent = originalText;
      exportButton.disabled = false;
    }
  });
}

function exportSettings() {
  // Show loading feedback
  const exportButton = document.querySelector('.export-card:nth-child(3) .btn');
  const originalText = exportButton.textContent;
  exportButton.textContent = 'Exporting...';
  exportButton.disabled = true;
  
  chrome.storage.local.get(null, function(result) {
    try {
      // Filter out sensitive data and cached items for settings export
      const settingsToExport = {};
      const excludeKeys = ['savedWords', 'mwApiKey', 'geminiApiKey', 'elevenlabsApiKey'];
      
      Object.keys(result).forEach(key => {
        if (!excludeKeys.includes(key) && !key.startsWith('qdp_')) {
          settingsToExport[key] = result[key];
        }
      });
      
      // Add metadata
      settingsToExport._exportInfo = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        extension: 'Semantix'
      };
      
      // Create download with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `semantix_settings_${timestamp}.json`;
      
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settingsToExport, null, 2));
      const link = document.createElement("a");
      link.setAttribute("href", dataStr);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showExportMessage(`Successfully exported settings to ${filename}`, 'success');
      
    } catch (error) {
      console.error('Error exporting settings:', error);
      showExportMessage('Error occurred during export. Please try again.', 'error');
    } finally {
      // Restore button state
      exportButton.textContent = originalText;
      exportButton.disabled = false;
    }
  });
}

// Helper function to show export status messages
function showExportMessage(message, type = 'info') {
  // Create or update status element
  let statusEl = document.getElementById('export-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'export-status';
    statusEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      opacity: 0;
      transform: translateY(-10px);
      transition: all 0.3s ease;
    `;
    document.body.appendChild(statusEl);
  }
  
  // Set message and styling based on type
  statusEl.textContent = message;
  const colors = {
    success: { bg: '#10b981', text: '#ffffff' },
    error: { bg: '#ef4444', text: '#ffffff' },
    warning: { bg: '#f59e0b', text: '#ffffff' },
    info: { bg: '#3b82f6', text: '#ffffff' }
  };
  
  const color = colors[type] || colors.info;
  statusEl.style.backgroundColor = color.bg;
  statusEl.style.color = color.text;
  
  // Show the message
  setTimeout(() => {
    statusEl.style.opacity = '1';
    statusEl.style.transform = 'translateY(0)';
  }, 10);
  
  // Hide after 4 seconds
  setTimeout(() => {
    statusEl.style.opacity = '0';
    statusEl.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (statusEl.parentNode) {
        statusEl.parentNode.removeChild(statusEl);
      }
    }, 300);
  }, 4000);
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
      const wordRows = document.querySelectorAll('.word-row');
      
      wordRows.forEach(row => {
        const allText = row.textContent.toLowerCase();
        
        if (allText.includes(searchTerm)) {
          row.style.display = 'table-row';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }
});