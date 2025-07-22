// Source descriptions for each option
const sourceDescriptions = {
  'cambridge': 'Fast and reliable definitions from Cambridge Dictionary via local server. Single words only.',
  'merriam-webster': 'Authoritative definitions from America\'s most trusted dictionary. Single words only. Requires API key.',
  'gemini': 'AI-powered definitions from Google Gemini with pronunciation audio from Cambridge. Supports both single words and phrases (up to 5 words).'
};

// Show/hide API key section and translation section based on selected source
function updateSourceUI() {
  const source = document.getElementById('source').value;
  const apiSection = document.getElementById('mw-api-section');
  const translationSection = document.getElementById('translation-section');
  const description = document.getElementById('source-description');
  
  // Update description
  description.textContent = sourceDescriptions[source];
  
  // Show/hide API key section
  if (source === 'merriam-webster') {
    apiSection.classList.remove('hidden');
  } else {
    apiSection.classList.add('hidden');
  }
  
  // Show/hide translation section (only for Gemini)
  if (source === 'gemini') {
    translationSection.classList.remove('hidden');
  } else {
    translationSection.classList.add('hidden');
  }
}

// Saves options to chrome.storage
function save_options() {
  const source = document.getElementById('source').value;
  const mwKey = document.getElementById('mw-key').value;
  const targetLanguage = document.getElementById('target-language').value;
  const definitionScope = document.getElementById('definition-scope').value;
  const exampleCount = parseInt(document.getElementById('example-count').value, 10);
  const ttsEnabled = document.getElementById('tts-enabled').checked;

  // Validate Merriam-Webster API key if that source is selected
  if (source === 'merriam-webster' && !mwKey.trim()) {
    const status = document.getElementById('status');
    status.textContent = 'Please enter a Merriam-Webster API key.';
    status.style.color = '#dc3545';
    status.classList.add('show');
    setTimeout(function() {
      status.classList.remove('show');
    }, 3000);
    return;
  }

  chrome.storage.local.set({
    preferredSource: source,
    mwApiKey: mwKey,
    targetLanguage: targetLanguage,
    definitionScope: definitionScope,
    exampleCount: exampleCount,
    ttsEnabled: ttsEnabled
  }, function() {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    status.textContent = 'Settings saved!';
    status.style.color = '#28a745';
    status.classList.add('show');
    setTimeout(function() {
      status.classList.remove('show');
    }, 2000);
  });
}

// Restores select box and input field state using the preferences
// stored in chrome.storage.
function restore_options() {
  // --- ADD DEFAULTS FOR NEW SETTINGS ---
  chrome.storage.local.get({
    preferredSource: 'cambridge',
    mwApiKey: '',
    targetLanguage: 'none',      // Default to no translation
    definitionScope: 'relevant', // Default to showing only relevant
    exampleCount: 1,             // Default to showing 1 example
    ttsEnabled: false            // Default to TTS disabled
  }, function(items) {
    document.getElementById('source').value = items.preferredSource;
    document.getElementById('mw-key').value = items.mwApiKey;
    document.getElementById('target-language').value = items.targetLanguage;
    // --- RESTORE NEW SETTINGS TO THE UI ---
    document.getElementById('definition-scope').value = items.definitionScope;
    document.getElementById('example-count').value = items.exampleCount;
    document.getElementById('tts-enabled').checked = items.ttsEnabled;
    
    updateSourceUI();
  });
}

document.addEventListener('DOMContentLoaded', function() {
  restore_options();
  // Add event listener for source changes
  document.getElementById('source').addEventListener('change', updateSourceUI);
});
document.getElementById('save').addEventListener('click', save_options);