document.addEventListener('DOMContentLoaded', () => {
    const enabledSwitch = document.getElementById('enabled-switch');
    const statusText = document.getElementById('status-text');
    const optionsLink = document.getElementById('options-link');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        const url = new URL(activeTab.url);
        const site = url.hostname;

        // Update status text with current site
        statusText.textContent = `Site: ${site}`;

        chrome.storage.local.get('enabledSites', (data) => {
            const enabledSites = data.enabledSites || [];
            const isEnabled = enabledSites.includes(site);
            
            enabledSwitch.checked = isEnabled;
            updateStatusDisplay(isEnabled);
        });

        enabledSwitch.addEventListener('change', () => {
            chrome.storage.local.get('enabledSites', (data) => {
                let enabledSites = data.enabledSites || [];
                const isEnabled = enabledSwitch.checked;
                
                if (isEnabled) {
                    if (!enabledSites.includes(site)) {
                        enabledSites.push(site);
                    }
                } else {
                    enabledSites = enabledSites.filter((enabledSite) => enabledSite !== site);
                }
                
                chrome.storage.local.set({ enabledSites: enabledSites }, () => {
                    updateStatusDisplay(isEnabled);
                    
                    // Notify content script about the change
                    chrome.tabs.sendMessage(activeTab.id, { 
                        type: 'siteToggle', 
                        enabled: isEnabled 
                    }).catch(() => {
                        // Content script might not be loaded yet, which is fine
                    });
                });
            });
        });
    });

    // Handle settings button click
    optionsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });

    function updateStatusDisplay(isEnabled) {
        statusText.textContent = isEnabled ? 'Enabled on this site' : 'Disabled on this site';
        statusText.className = `status-text ${isEnabled ? 'enabled' : 'disabled'}`;
    }
});
