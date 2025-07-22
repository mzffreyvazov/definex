chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getDefinition') {
    const word = message.word.toLowerCase(); // Standardize to lowercase for caching
    const cacheKey = `qdp_${word}`;

    // 1. Check the cache first
    chrome.storage.local.get(cacheKey, (result) => {
      if (result[cacheKey]) {
        // 2. Word found in cache! Send it back instantly.
        console.log(`Found "${word}" in cache.`);
        sendResponse({ status: 'success', data: result[cacheKey] });
        return; // Stop execution
      }

      // 3. Word not in cache, fetch from API
      console.log(`Fetching "${word}" from API.`);
      const apiUrl = `http://localhost:3000/api/dictionary/en/${word}`;
      fetch(apiUrl)
        .then(response => {
          if (!response.ok) {
            throw new Error(`API error for "${word}"`);
          }
          return response.json();
        })
        .then(data => {
          // 4. Cache the new data for next time
          let cacheEntry = {};
          cacheEntry[cacheKey] = data;
          chrome.storage.local.set(cacheEntry, () => {
            console.log(`Cached definition for "${word}".`);
          });

          // 5. Send the successful data back to the content script
          sendResponse({ status: 'success', data: data });
        })
        .catch(error => {
          sendResponse({ status: 'error', message: error.message });
        });
    });

    // Return true to indicate that we will send a response asynchronously
    return true;
  }
});