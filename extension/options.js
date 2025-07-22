// Source descriptions for each option
const sourceDescriptions = {
  'cambridge': 'Fast and reliable definitions from Cambridge Dictionary via local server.',
  'merriam-webster': 'Authoritative definitions from America\'s most trusted dictionary. Requires API key.',
  'gemini': 'AI-powered definitions from Google Gemini with pronunciation audio from Cambridge.'
};

// Show/hide API key section and update description based on selected source
function updateSourceUI() {
  const source = document.getElementById('source').value;
  const apiSection = document.getElementById('mw-api-section');
  const description = document.getElementById('source-description');
  
  // Update description
  description.textContent = sourceDescriptions[source];
  
  // Show/hide API key section
  if (source === 'merriam-webster') {
    apiSection.classList.remove('hidden');
  } else {
    apiSection.classList.add('hidden');
  }
}

// Saves options to chrome.storage
function save_options() {
  const source = document.getElementById('source').value;
  const mwKey = document.getElementById('mw-key').value;

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
    mwApiKey: mwKey
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
  // Use default value source = 'cambridge' and mwApiKey = ''
  chrome.storage.local.get({
    preferredSource: 'cambridge',
    mwApiKey: ''
  }, function(items) {
    document.getElementById('source').value = items.preferredSource;
    document.getElementById('mw-key').value = items.mwApiKey;
    // Update UI after restoring values
    updateSourceUI();
  });
}

document.addEventListener('DOMContentLoaded', function() {
  restore_options();
  // Add event listener for source changes
  document.getElementById('source').addEventListener('change', updateSourceUI);
});
document.getElementById('save').addEventListener('click', save_options);