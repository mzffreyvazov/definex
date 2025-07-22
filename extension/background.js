chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getDefinition') {
    const word = message.word;
    const apiUrl = `http://localhost:3000/api/dictionary/en/${word}`;

    fetch(apiUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Word not found or API error.`);
        }
        return response.json();
      })
      .then(data => {
        // Send the successful data back to the content script
        sendResponse({ status: 'success', data: data });
      })
      .catch(error => {
        // Send an error message back
        sendResponse({ status: 'error', message: error.message });
      });

    // Return true to indicate that we will send a response asynchronously
    return true;
  }
});