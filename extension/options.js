// Source descriptions for each option
const sourceDescriptions = {
  'cambridge': 'Fast and reliable definitions from Cambridge Dictionary via local server. Single words only.',
  'merriam-webster': 'Authoritative definitions from America\'s most trusted dictionary. Single words only. Requires API key.',
  'gemini': 'AI-powered definitions from Google Gemini. Requires API key. Supports single words, phrases & sentences.'
};

// Show/hide API key sections and translation section based on selected source
function updateSourceUI() {
  const source = document.getElementById('source').value;
  const apiSection = document.getElementById('mw-api-section');
  const geminiSection = document.getElementById('gemini-api-section');
  const translationSection = document.getElementById('translation-section');
  const description = document.getElementById('source-description');
  
  description.textContent = sourceDescriptions[source];
  
  // MW key
  if (source === 'merriam-webster') apiSection.classList.remove('hidden');
  else apiSection.classList.add('hidden');
  
  // Gemini key
  if (source === 'gemini') geminiSection.classList.remove('hidden');
  else geminiSection.classList.add('hidden');
  
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

document.addEventListener('DOMContentLoaded', function() {
  restore_options();
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
});
document.getElementById('save').addEventListener('click', save_options);