import React, { useEffect, useState } from 'react';

export function PopupApp() {
  const [site, setSite] = useState<string>('');
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      const url = activeTab?.url ? new URL(activeTab.url) : null;
      const hostname = url?.hostname ?? '';
      setSite(hostname);

      chrome.storage.local.get('enabledSites', (data) => {
        const enabledSites: string[] = data.enabledSites || [];
        const isEnabled = hostname ? enabledSites.includes(hostname) : false;
        setEnabled(isEnabled);
      });
    });
  }, []);

  const toggle = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      const url = activeTab?.url ? new URL(activeTab.url) : null;
      const hostname = url?.hostname ?? '';

      chrome.storage.local.get('enabledSites', (data) => {
        let enabledSites: string[] = data.enabledSites || [];
        const newEnabled = !enabled;

        if (newEnabled) {
          if (hostname && !enabledSites.includes(hostname)) enabledSites.push(hostname);
        } else {
          enabledSites = enabledSites.filter((s) => s !== hostname);
        }

        chrome.storage.local.set({ enabledSites }, () => {
          setEnabled(newEnabled);
          if (activeTab?.id) {
            chrome.tabs.sendMessage(activeTab.id, { type: 'siteToggle', enabled: newEnabled }).catch(() => {});
          }
        });
      });
    });
  };

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h1>Semantix</h1>
        <p className="subtitle">Dictionary & Translation</p>
      </div>
      <div className="popup-content">
        <div className="control-container">
          <div className="control-header">
            <h3>Site Control</h3>
          </div>
          <div className="control-body">
            <div className="toggle-group">
              <label htmlFor="enabled-switch" className="toggle-label">Enable on this site</label>
              <div className="toggle-switch">
                <input type="checkbox" id="enabled-switch" className="toggle-input" checked={!!enabled} onChange={toggle} />
                <label htmlFor="enabled-switch" className="toggle-slider"></label>
              </div>
            </div>
            <div className="status-badge" id="status-badge">
              <span className={`status-text ${enabled ? 'enabled' : 'disabled'}`} id="status-text">
                {enabled === null ? 'Checking...' : enabled ? 'Enabled on this site' : 'Disabled on this site'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="popup-footer">
        <button className="settings-btn" id="options-link" onClick={() => chrome.runtime.openOptionsPage()}>
          <svg className="settings-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}

