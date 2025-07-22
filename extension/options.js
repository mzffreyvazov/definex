// Saves options to chrome.storage
function save_options() {
  const source = document.getElementById('source').value;
  const mwKey = document.getElementById('mw-key').value;

  chrome.storage.local.set({
    preferredSource: source,
    mwApiKey: mwKey
  }, function() {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 1500);
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
  });
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);