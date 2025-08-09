import React, { useEffect, useMemo, useState } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from '@radix-ui/react-icons';
import './options.css';

type SavedWord = {
  id: string;
  type: 'word' | 'phrase' | 'sentence' | string;
  text: string;
  pronunciation?: string;
  partOfSpeech?: string;
  translation?: string;
  definitions?: { text: string; translation?: string; examples?: { text: string }[] }[];
  keyPhrases?: { original: string; translation: string }[];
  audioUrl?: string;
  savedAt?: string | number;
};

function maskApiKey(key: string): string {
  if (!key || key.length === 0) return '';
  if (key.length <= 8) return '•'.repeat(key.length);
  return key.substring(0, 4) + '•'.repeat(key.length - 8) + key.substring(key.length - 4);
}

function unmaskApiKey(key: string, originalKey: string): string {
  if (key.includes('•')) return originalKey;
  return key;
}

const sourceDescriptions: Record<string, string> = {
  cambridge: 'Fast and reliable definitions from Cambridge Dictionary via local server. Single words only.',
  'merriam-webster': "Authoritative definitions from America's most trusted dictionary. Single words only. Requires API key.",
  gemini: 'AI-powered definitions from Google Gemini. Requires API key. Supports single words, phrases & sentences.'
};

// Column Header Component with three-dot menu
interface ColumnHeaderProps {
  title: string;
  isFilterable?: boolean;
  isActive?: boolean;
  hasActiveFilters?: boolean;
  onMenuClick?: (event: React.MouseEvent) => void;
}

function ColumnHeader({ title, isFilterable = false, isActive = false, hasActiveFilters = false, onMenuClick }: ColumnHeaderProps) {
  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (onMenuClick) {
      onMenuClick(event);
    }
  };

  return (
    <div 
      className={`column-header ${isFilterable ? 'filterable' : ''} ${isActive ? 'active' : ''}`}
      onClick={isFilterable ? handleClick : undefined}
    >
      <span className="column-title">{title}</span>
      {isFilterable && (
        <div className="column-menu-container">
          <button className={`column-menu-btn ${hasActiveFilters ? 'active-filter' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// Filter Panel Component
interface FilterPanelProps {
  column: 'contentType' | 'partOfSpeech';
  values: string[];
  selectedValues: string[];
  onToggleFilter: (value: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  triggerElement?: HTMLElement | null;
}

function FilterPanel({ column, values, selectedValues, onToggleFilter, onClearAll, onClose, triggerElement }: FilterPanelProps) {
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = React.useState(false);

  React.useEffect(() => {
    if (triggerElement) {
      const rect = triggerElement.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left
      });
      setIsPositioned(true);
    }
  }, [triggerElement]);

  return (
    <div 
      className="filter-panel"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        opacity: isPositioned ? 1 : 0,
        visibility: isPositioned ? 'visible' : 'hidden'
      }}
    >
      <div className="filter-panel-header">
        <h4>Filter {column === 'contentType' ? 'Content Type' : 'Part of Speech'}</h4>
        <button className="filter-close-btn" onClick={onClose}>×</button>
      </div>
      <div className="filter-panel-content">
        <div className="filter-options">
          {values.map(value => (
            <div key={value} className="filter-option">
              <span className="filter-option-label">
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </span>
              <div 
                className={`toggle-switch ${selectedValues.includes(value) ? 'active' : ''}`}
                onClick={() => onToggleFilter(value)}
              >
                <div className="toggle-slider"></div>
              </div>
            </div>
          ))}
        </div>
        <div className="filter-panel-footer">
          <button className="filter-clear-btn" onClick={onClearAll}>
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
}

export function OptionsApp() {
  const [activeSection, setActiveSection] = useState<'settings' | 'saved-words' | 'export' | 'statistics' | 'about'>('settings');
  const [isLoaded, setIsLoaded] = useState(false);

  const [preferredSource, setPreferredSource] = useState<'cambridge' | 'merriam-webster' | 'gemini'>('cambridge');
  const [mwApiKey, setMwApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('none');
  const [definitionScope, setDefinitionScope] = useState<'relevant' | 'all'>('relevant');
  const [exampleCount, setExampleCount] = useState(1);
  const [ttsEnabled, setTtsEnabled] = useState(false);

  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // New inline column filtering states
  const [activeColumnFilter, setActiveColumnFilter] = useState<string | null>(null);
  const [filterTriggerElement, setFilterTriggerElement] = useState<HTMLElement | null>(null);
  const [columnFilters, setColumnFilters] = useState<{
    contentType: string[];
    partOfSpeech: string[];
  }>({
    contentType: [],
    partOfSpeech: []
  });

  const [status, setStatus] = useState<{ text: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);

  useEffect(() => {
    chrome.storage.local.get(
      {
        preferredSource: 'cambridge',
        mwApiKey: '',
        geminiApiKey: '',
        elevenlabsApiKey: '',
        targetLanguage: 'none',
        definitionScope: 'relevant',
        exampleCount: 1,
        ttsEnabled: false,
        savedWords: []
      },
      items => {
        setPreferredSource(items.preferredSource);
        setMwApiKey(items.mwApiKey ? maskApiKey(items.mwApiKey) : '');
        setGeminiApiKey(items.geminiApiKey ? maskApiKey(items.geminiApiKey) : '');
        setElevenlabsApiKey(items.elevenlabsApiKey ? maskApiKey(items.elevenlabsApiKey) : '');
        setTargetLanguage(items.targetLanguage);
        setDefinitionScope(items.definitionScope);
        setExampleCount(items.exampleCount);
        setTtsEnabled(items.ttsEnabled);
        setSavedWords(items.savedWords || []);
        setIsLoaded(true);
      }
    );
  }, []);

  // Get unique values for inline column filtering
  const contentTypeValues = useMemo(() => {
    return Array.from(
      new Set(
        (savedWords || [])
          .map(w => (w.type || '').toString().trim().toLowerCase())
          .filter(Boolean)
      )
    ).sort();
  }, [savedWords]);

  const partOfSpeechValues = useMemo(() => {
    return Array.from(
      new Set(
        (savedWords || [])
          .map(w => (w.partOfSpeech || '').toString().trim().toLowerCase())
          .filter(Boolean)
      )
    ).sort();
  }, [savedWords]);

  const filteredWords = useMemo(() => {
    let list = savedWords;
    
    // Apply inline column filters
    if (columnFilters.contentType.length > 0) {
      list = list.filter(w => {
        const wordType = (w.type || '').toString().toLowerCase();
        return columnFilters.contentType.includes(wordType);
      });
    }
    
    if (columnFilters.partOfSpeech.length > 0) {
      list = list.filter(w => {
        const wordPos = (w.partOfSpeech || '').toString().toLowerCase();
        return columnFilters.partOfSpeech.includes(wordPos);
      });
    }
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(w => JSON.stringify(w).toLowerCase().includes(term));
    }
    
    return list;
  }, [savedWords, searchTerm, columnFilters]);

  function showStatus(text: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
    setStatus({ text, type });
    setTimeout(() => setStatus(null), type === 'success' ? 2000 : 3000);
  }

  // Column filter helper functions
  function toggleColumnMenu(column: string, event?: React.MouseEvent) {
    if (activeColumnFilter === column) {
      setActiveColumnFilter(null);
      setFilterTriggerElement(null);
    } else {
      setActiveColumnFilter(column);
      if (event) {
        // Find the column header element
        const target = event.currentTarget as HTMLElement;
        const columnHeader = target.closest('.column-header') as HTMLElement;
        setFilterTriggerElement(columnHeader);
      }
    }
  }

  function toggleColumnFilter(column: 'contentType' | 'partOfSpeech', value: string) {
    setColumnFilters(prev => {
      const currentFilters = prev[column];
      const newFilters = currentFilters.includes(value)
        ? currentFilters.filter(v => v !== value)
        : [...currentFilters, value];
      
      return {
        ...prev,
        [column]: newFilters
      };
    });
  }

  function clearColumnFilters(column: 'contentType' | 'partOfSpeech') {
    setColumnFilters(prev => ({
      ...prev,
      [column]: []
    }));
  }

  function hasActiveFilters(column: 'contentType' | 'partOfSpeech') {
    return columnFilters[column].length > 0;
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const realMw = unmaskApiKey(mwApiKey, (window as any)._orig_mw || '');
    const realGemini = unmaskApiKey(geminiApiKey, (window as any)._orig_gem || '');
    const realEleven = unmaskApiKey(elevenlabsApiKey, (window as any)._orig_el || '');

    if (preferredSource === 'merriam-webster' && !realMw.trim()) {
      showStatus('Please enter a Merriam-Webster API key.', 'error');
      return;
    }
    if (preferredSource === 'gemini' && !realGemini.trim()) {
      showStatus('Please enter a Gemini AI API key.', 'error');
      return;
    }
    if (ttsEnabled && !realEleven.trim()) {
      showStatus('Please enter an ElevenLabs API key to enable TTS.', 'error');
      return;
    }

    chrome.storage.local.set(
      {
        preferredSource,
        mwApiKey: realMw,
        geminiApiKey: realGemini,
        elevenlabsApiKey: realEleven,
        targetLanguage,
        definitionScope,
        exampleCount,
        ttsEnabled
      },
      () => {
        (window as any)._orig_mw = realMw;
        (window as any)._orig_gem = realGemini;
        (window as any)._orig_el = realEleven;
        if (realMw) setMwApiKey(maskApiKey(realMw));
        if (realGemini) setGeminiApiKey(maskApiKey(realGemini));
        if (realEleven) setElevenlabsApiKey(maskApiKey(realEleven));
        showStatus('Settings saved!', 'success');
      }
    );
  }

  function removeWord(wordId: string) {
    chrome.storage.local.get(['savedWords'], res => {
      const updated = (res.savedWords || []).filter((w: SavedWord) => w.id !== wordId);
      chrome.storage.local.set({ savedWords: updated }, () => setSavedWords(updated));
    });
  }

  function exportAsCSV() {
    chrome.storage.local.get(['savedWords'], result => {
      const saved = result.savedWords || [];
      if (saved.length === 0) return showStatus('No words to export', 'warning');
      const header = 'Type,Text,Pronunciation,Part of Speech,Definition,Translation,Examples,Audio URL,Saved Date\n';
      const escapeCSV = (str: any) => {
        if (!str) return '""';
        const clean = String(str).replace(/"/g, '""');
        return `"${clean}"`;
      };
      const rows = saved.map((item: SavedWord) => {
        const type = item.type || 'unknown';
        const text = item.text || '';
        const pronunciation = item.pronunciation || '';
        const pos = item.partOfSpeech || '';
        let definitions = '';
        let examples = '';
        let translations = '';
        if (item.definitions && item.definitions.length > 0) {
          definitions = item.definitions.map(d => d.text).join(' | ');
          const allExamples = item.definitions
            .flatMap(d => d.examples || [])
            .map(ex => (ex as any).text || (ex as any))
            .filter(ex => ex && String(ex).trim())
            .join(' | ');
          examples = allExamples;
          const defTranslations = item.definitions
            .map(d => d.translation)
            .filter(t => t && String(t).trim())
            .join(' | ');
          translations = defTranslations || item.translation || '';
        } else {
          translations = item.translation || '';
        }
        const audioUrl = item.audioUrl || '';
        const date = item.savedAt ? new Date(item.savedAt).toLocaleDateString() : new Date().toLocaleDateString();
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
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + header + rows.join('\n');
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `semantix_words_${timestamp}.csv`;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showStatus(`Successfully exported ${saved.length} items to ${filename}`, 'success');
    });
  }

  function exportAsJSON() {
    chrome.storage.local.get(['savedWords'], result => {
      const saved = result.savedWords || [];
      if (saved.length === 0) return showStatus('No words to export', 'warning');
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `semantix_words_${timestamp}.json`;
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(saved, null, 2));
      const link = document.createElement('a');
      link.setAttribute('href', dataStr);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showStatus(`Successfully exported ${saved.length} items to ${filename}`, 'success');
    });
  }

  function exportSettings() {
    chrome.storage.local.get(null, result => {
      const settingsToExport: Record<string, unknown> = {};
      const excludeKeys = ['savedWords', 'mwApiKey', 'geminiApiKey', 'elevenlabsApiKey'];
      Object.keys(result).forEach(key => {
        if (!excludeKeys.includes(key) && !key.startsWith('qdp_')) {
          (settingsToExport as any)[key] = (result as any)[key];
        }
      });
      (settingsToExport as any)._exportInfo = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        extension: 'Semantix'
      };
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `semantix_settings_${timestamp}.json`;
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(settingsToExport, null, 2));
      const link = document.createElement('a');
      link.setAttribute('href', dataStr);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showStatus(`Successfully exported settings to ${filename}`, 'success');
    });
  }

  useEffect(() => {
    // cache originals for masking behavior
    chrome.storage.local.get(['mwApiKey', 'geminiApiKey', 'elevenlabsApiKey'], r => {
      (window as any)._orig_mw = r.mwApiKey || '';
      (window as any)._orig_gem = r.geminiApiKey || '';
      (window as any)._orig_el = r.elevenlabsApiKey || '';
    });
  }, []);

  // Handle clicking outside filter panel to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element;
      if (activeColumnFilter && !target.closest('.filter-panel') && !target.closest('.column-menu-btn')) {
        setActiveColumnFilter(null);
        setFilterTriggerElement(null);
      }
    }

    if (activeColumnFilter) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeColumnFilter]);

  const sourceDescription = sourceDescriptions[preferredSource] || '';
  const showMw = preferredSource === 'merriam-webster';
  const showGemini = preferredSource === 'gemini';
  const showTranslation = preferredSource === 'gemini';

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="brand-container">
            <img src="icons/logo.png" alt="Semantix Logo" className="brand-logo" />
            <h1>Semantix</h1>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${activeSection === 'settings' ? 'active' : ''}`} onClick={() => setActiveSection('settings')}>
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            Settings
          </button>
          <button className={`nav-item ${activeSection === 'saved-words' ? 'active' : ''}`} onClick={() => setActiveSection('saved-words')}>
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
            </svg>
            Saved Words
          </button>
          <button className={`nav-item ${activeSection === 'export' ? 'active' : ''}`} onClick={() => setActiveSection('export')}>
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Export Data
          </button>
          <button className={`nav-item ${activeSection === 'statistics' ? 'active' : ''}`} onClick={() => setActiveSection('statistics')}>
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            Statistics
          </button>
          <button className={`nav-item ${activeSection === 'about' ? 'active' : ''}`} onClick={() => setActiveSection('about')}>
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            About
          </button>
        </nav>
      </div>

      <div className="main-content">
        {activeSection === 'settings' && (
          <div className="content-section active" id="settings">
            <div className="content-header">
              <h2>Settings</h2>
              <p>Configure your dictionary and translation preferences</p>
            </div>

            <div className="content-body">
              <form onSubmit={handleSave}>
                <div className="words-container" style={{ marginBottom: 24 }}>
                  <div className="words-header">
                    <h3>Dictionary Source</h3>
                  </div>
                  <div style={{ padding: 24 }}>
                    <div className="form-group">
                      <label htmlFor="source">Choose your preferred dictionary:</label>
                      <RadixSelect.Root value={preferredSource} onValueChange={v => setPreferredSource(v as any)}>
                        <RadixSelect.Trigger id="source" className="SelectTrigger" aria-label="Dictionary Source">
                          <RadixSelect.Value placeholder="Select a source" />
                          <RadixSelect.Icon className="SelectIcon">
                            <ChevronDownIcon />
                          </RadixSelect.Icon>
                        </RadixSelect.Trigger>
                        <RadixSelect.Portal>
                          <RadixSelect.Content className="SelectContent" position="popper" side="bottom" align="start" sideOffset={6} avoidCollisions={false}>
                            <RadixSelect.ScrollUpButton className="SelectScrollButton">
                              <ChevronUpIcon />
                            </RadixSelect.ScrollUpButton>
                            <RadixSelect.Viewport className="SelectViewport">
                              <RadixSelect.Item className="SelectItem" value="cambridge">
                                <RadixSelect.ItemText>Cambridge Dictionary</RadixSelect.ItemText>
                                <RadixSelect.ItemIndicator className="SelectItemIndicator">
                                  <CheckIcon />
                                </RadixSelect.ItemIndicator>
                              </RadixSelect.Item>
                              <RadixSelect.Item className="SelectItem" value="merriam-webster">
                                <RadixSelect.ItemText>Merriam-Webster</RadixSelect.ItemText>
                                <RadixSelect.ItemIndicator className="SelectItemIndicator">
                                  <CheckIcon />
                                </RadixSelect.ItemIndicator>
                              </RadixSelect.Item>
                              <RadixSelect.Item className="SelectItem" value="gemini">
                                <RadixSelect.ItemText>Gemini AI</RadixSelect.ItemText>
                                <RadixSelect.ItemIndicator className="SelectItemIndicator">
                                  <CheckIcon />
                                </RadixSelect.ItemIndicator>
                              </RadixSelect.Item>
                            </RadixSelect.Viewport>
                            <RadixSelect.ScrollDownButton className="SelectScrollButton">
                              <ChevronDownIcon />
                            </RadixSelect.ScrollDownButton>
                          </RadixSelect.Content>
                        </RadixSelect.Portal>
                      </RadixSelect.Root>
                      <div id="source-description" style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>{sourceDescription}</div>
                    </div>

                    {showMw && (
                      <div className="form-group">
                        <div id="mw-api-section">
                          <label htmlFor="mw-key">Merriam-Webster API Key:</label>
                          <input
                            type="password"
                            id="mw-key"
                            placeholder="Enter your API key here"
                            value={mwApiKey}
                            onFocus={() => setMwApiKey((window as any)._orig_mw || '')}
                            onBlur={() => setMwApiKey(mwApiKey ? maskApiKey(unmaskApiKey(mwApiKey, (window as any)._orig_mw || '')) : '')}
                            onChange={e => setMwApiKey(e.target.value)}
                          />
                          <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
                            Get your free API key from <a href="https://dictionaryapi.com/" target="_blank" style={{ color: '#3b82f6' }}>dictionaryapi.com</a>.
                          </div>
                        </div>
                      </div>
                    )}

                    {showGemini && (
                      <div className="form-group">
                        <div id="gemini-api-section">
                          <label htmlFor="gemini-key">Gemini AI API Key:</label>
                          <input
                            type="password"
                            id="gemini-key"
                            placeholder="Enter your Gemini API key here"
                            value={geminiApiKey}
                            onFocus={() => setGeminiApiKey((window as any)._orig_gem || '')}
                            onBlur={() => setGeminiApiKey(geminiApiKey ? maskApiKey(unmaskApiKey(geminiApiKey, (window as any)._orig_gem || '')) : '')}
                            onChange={e => setGeminiApiKey(e.target.value)}
                          />
                          <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
                            Enter your Gemini AI API key provided by your AI service.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="words-container" id="translation-section" style={{ marginBottom: 24 }}>
                  <div className="words-header">
                    <h3>Translation Options</h3>
                    <span style={{ fontSize: 12, color: '#3b82f6', background: '#eff6ff', padding: '4px 8px', borderRadius: 4 }}>AI only</span>
                  </div>
                  {showTranslation && (
                    <div style={{ padding: 24 }}>
                      <div className="form-group">
                        <label htmlFor="target-language">Translate to:</label>
                        <RadixSelect.Root value={targetLanguage} onValueChange={v => setTargetLanguage(v)}>
                          <RadixSelect.Trigger id="target-language" className="SelectTrigger" aria-label="Target language">
                            <RadixSelect.Value placeholder="Select language" />
                            <RadixSelect.Icon className="SelectIcon">
                              <ChevronDownIcon />
                            </RadixSelect.Icon>
                          </RadixSelect.Trigger>
                          <RadixSelect.Portal>
                            <RadixSelect.Content className="SelectContent" position="popper" side="bottom" align="start" sideOffset={6} avoidCollisions={false}>
                              <RadixSelect.ScrollUpButton className="SelectScrollButton">
                                <ChevronUpIcon />
                              </RadixSelect.ScrollUpButton>
                              <RadixSelect.Viewport className="SelectViewport">
                                {[
                                  'none',
                                  'Spanish',
                                  'French',
                                  'German',
                                  'Italian',
                                  'Portuguese',
                                  'Russian',
                                  'Turkish',
                                  'Azerbaijani',
                                  'Japanese',
                                ].map(lang => (
                                  <RadixSelect.Item key={lang} className="SelectItem" value={lang}>
                                    <RadixSelect.ItemText>
                                      {lang === 'none' ? 'No Translation (Default)' : lang}
                                    </RadixSelect.ItemText>
                                    <RadixSelect.ItemIndicator className="SelectItemIndicator">
                                      <CheckIcon />
                                    </RadixSelect.ItemIndicator>
                                  </RadixSelect.Item>
                                ))}
                              </RadixSelect.Viewport>
                              <RadixSelect.ScrollDownButton className="SelectScrollButton">
                                <ChevronDownIcon />
                              </RadixSelect.ScrollDownButton>
                            </RadixSelect.Content>
                          </RadixSelect.Portal>
                        </RadixSelect.Root>
                      </div>
                    </div>
                  )}
                </div>

                <div className="words-container" style={{ marginBottom: 24 }}>
                  <div className="words-header">
                    <h3>Display Options</h3>
                  </div>
                  <div style={{ padding: 24 }}>
                    <div className="form-group">
                      <label htmlFor="definition-scope">Definition Scope:</label>
                      <RadixSelect.Root value={definitionScope} onValueChange={v => setDefinitionScope(v as any)}>
                        <RadixSelect.Trigger id="definition-scope" className="SelectTrigger" aria-label="Definition scope">
                          <RadixSelect.Value placeholder="Select scope" />
                          <RadixSelect.Icon className="SelectIcon">
                            <ChevronDownIcon />
                          </RadixSelect.Icon>
                        </RadixSelect.Trigger>
                        <RadixSelect.Portal>
                          <RadixSelect.Content className="SelectContent" position="popper" side="bottom" align="start" sideOffset={6} avoidCollisions={false}>
                            <RadixSelect.Viewport className="SelectViewport">
                              <RadixSelect.Item className="SelectItem" value="relevant">
                                <RadixSelect.ItemText>Show only the most relevant definition</RadixSelect.ItemText>
                                <RadixSelect.ItemIndicator className="SelectItemIndicator">
                                  <CheckIcon />
                                </RadixSelect.ItemIndicator>
                              </RadixSelect.Item>
                              <RadixSelect.Item className="SelectItem" value="all">
                                <RadixSelect.ItemText>Show definitions for all parts of speech</RadixSelect.ItemText>
                                <RadixSelect.ItemIndicator className="SelectItemIndicator">
                                  <CheckIcon />
                                </RadixSelect.ItemIndicator>
                              </RadixSelect.Item>
                            </RadixSelect.Viewport>
                          </RadixSelect.Content>
                        </RadixSelect.Portal>
                      </RadixSelect.Root>
                    </div>
                    <div className="form-group">
                      <label htmlFor="example-count">Number of Example Sentences (per definition):</label>
                      <RadixSelect.Root value={String(exampleCount)} onValueChange={v => setExampleCount(Number(v))}>
                        <RadixSelect.Trigger id="example-count" className="SelectTrigger" aria-label="Example count">
                          <RadixSelect.Value placeholder="Select count" />
                          <RadixSelect.Icon className="SelectIcon">
                            <ChevronDownIcon />
                          </RadixSelect.Icon>
                        </RadixSelect.Trigger>
                        <RadixSelect.Portal>
                          <RadixSelect.Content className="SelectContent" position="popper" side="bottom" align="start" sideOffset={6} avoidCollisions={false}>
                            <RadixSelect.Viewport className="SelectViewport">
                              {[0,1,2,3,4,5].map(n => (
                                <RadixSelect.Item key={n} className="SelectItem" value={String(n)}>
                                  <RadixSelect.ItemText>{n === 1 ? '1 (Default)' : n}</RadixSelect.ItemText>
                                  <RadixSelect.ItemIndicator className="SelectItemIndicator">
                                    <CheckIcon />
                                  </RadixSelect.ItemIndicator>
                                </RadixSelect.Item>
                              ))}
                            </RadixSelect.Viewport>
                          </RadixSelect.Content>
                        </RadixSelect.Portal>
                      </RadixSelect.Root>
                    </div>
                  </div>
                </div>

                <div className="words-container" style={{ marginBottom: 32 }}>
                  <div className="words-header">
                    <h3>Text-to-Speech Options</h3>
                  </div>
                  <div style={{ padding: 24 }}>
                    <div className="form-group">
                      <label htmlFor="tts-enabled">
                        <input type="checkbox" id="tts-enabled" checked={ttsEnabled} onChange={e => setTtsEnabled(e.target.checked)} style={{ marginRight: 8 }} />
                        Enable Text-to-Speech (TTS) for phrases and sentences
                      </label>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
                        When enabled, TTS button will appear for original phrases and sentences, allowing you to hear them spoken aloud.
                      </div>
                    </div>
                    {ttsEnabled && (
                      <div className="form-group">
                        <div id="elevenlabs-api-section">
                          <label htmlFor="elevenlabs-key">ElevenLabs API Key:</label>
                          <input
                            type="password"
                            id="elevenlabs-key"
                            placeholder="Enter your ElevenLabs API key here"
                            value={elevenlabsApiKey}
                            onFocus={() => setElevenlabsApiKey((window as any)._orig_el || '')}
                            onBlur={() => setElevenlabsApiKey(elevenlabsApiKey ? maskApiKey(unmaskApiKey(elevenlabsApiKey, (window as any)._orig_el || '')) : '')}
                            onChange={e => setElevenlabsApiKey(e.target.value)}
                          />
                          <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
                            Get your API key from <a href="https://elevenlabs.io/" target="_blank" style={{ color: '#3b82f6' }}>elevenlabs.io</a> to enable high-quality text-to-speech.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button type="submit" className="btn btn-primary">Save Settings</button>
                <div id="status" className={status ? 'show' : ''} style={{ color: status?.type === 'error' ? '#dc3545' : status?.type === 'success' ? '#28a745' : undefined }}>{status?.text}</div>
              </form>
            </div>
          </div>
        )}

        {activeSection === 'saved-words' && (
          <div className="content-section active" id="saved-words">
            <div className="content-header">
              <h2>Saved Words</h2>
              <p>View and manage your saved words and definitions</p>
            </div>
            <div className="content-body">
              <div className="words-container">
                <div className="words-header">
                  <h3>Your Vocabulary</h3>
                  <span className="words-count">
                    {searchTerm || columnFilters.contentType.length > 0 || columnFilters.partOfSpeech.length > 0
                      ? `${filteredWords.length} of ${savedWords.length} shown`
                      : `${savedWords.length} words saved`}
                  </span>
                </div>
                <div className="search-box">
                  <input type="text" className="search-input" placeholder="Search saved words..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="words-list">
                  {filteredWords.length === 0 ? (
                    <div className="empty-state">
                      <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                      </svg>
                      <h3>No saved words yet</h3>
                      <p>Words you look up will appear here for future reference</p>
                    </div>
                  ) : (
                    <div className="words-table-container">
                      <table className="words-table">
                        <thead>
                          <tr>
                            <th className="text-col">
                              <ColumnHeader title="Text" />
                            </th>
                            <th className="type-col">
                              <ColumnHeader 
                                title="Content Type" 
                                isFilterable={true}
                                isActive={activeColumnFilter === 'contentType'}
                                hasActiveFilters={hasActiveFilters('contentType')}
                                onMenuClick={(event) => toggleColumnMenu('contentType', event)}
                              />
                            </th>
                            <th className="pronunciation-col">
                              <ColumnHeader title="Pronunciation" />
                            </th>
                            <th className="pos-col">
                              <ColumnHeader 
                                title="Part of Speech" 
                                isFilterable={true}
                                isActive={activeColumnFilter === 'partOfSpeech'}
                                hasActiveFilters={hasActiveFilters('partOfSpeech')}
                                onMenuClick={(event) => toggleColumnMenu('partOfSpeech', event)}
                              />
                            </th>
                            <th className="definition-col">
                              <ColumnHeader title="Definition" />
                            </th>
                            <th className="translation-col">
                              <ColumnHeader title="Translation" />
                            </th>
                            <th className="examples-col">
                              <ColumnHeader title="Examples" />
                            </th>
                            <th className="date-col">
                              <ColumnHeader title="Date Added" />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredWords.map(item => {
                            let definitionsText = '';
                            if (item.definitions?.length) {
                              definitionsText = item.definitions.map(def => def.text).join('; ');
                            }
                            let examplesText = '';
                            if (item.definitions?.length) {
                              const allExamples = item.definitions.flatMap(def => def.examples || []);
                              examplesText = allExamples.map((ex, index) => `${index + 1}. ${ex.text}`).join('<br>');
                            }
                            if (item.keyPhrases?.length) {
                              const startIndex = item.definitions?.flatMap(def => def.examples || []).length || 0;
                              const keyPhrasesText = item.keyPhrases.map((phrase, index) => `${startIndex + index + 1}. ${phrase.original} → ${phrase.translation}`).join('<br>');
                              examplesText = examplesText ? examplesText + '<br>' + keyPhrasesText : keyPhrasesText;
                            }
                            return (
                              <tr className="word-row" data-type={item.type} data-id={item.id} key={item.id}>
                                <td className="text-cell"><div className="cell-content"><span className="word-text">{item.text}</span></div></td>
                                <td className="type-cell"><div className="cell-content"><span className="type-badge">{item.type}</span></div></td>
                                <td className="pronunciation-cell"><div className="cell-content">{item.pronunciation || '-'}</div></td>
                                <td className="pos-cell"><div className="cell-content">{item.partOfSpeech ? <span className="pos-badge">{item.partOfSpeech}</span> : '-'}</div></td>
                                <td className="definition-cell"><div className="cell-content" title={definitionsText} dangerouslySetInnerHTML={{ __html: definitionsText || '-' }} /></td>
                                <td className="translation-cell"><div className="cell-content" title={item.translation || ''}>{item.translation || '-'}</div></td>
                                <td className="examples-cell"><div className="cell-content" title={examplesText} dangerouslySetInnerHTML={{ __html: examplesText || '-' }} /></td>
                                <td className="date-cell"><div className="cell-content">{item.savedAt ? new Date(item.savedAt).toLocaleDateString() : '-'}</div></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  {/* Filter Panels - rendered outside table for proper overlay positioning */}
                  {activeColumnFilter === 'contentType' && (
                    <FilterPanel
                      column="contentType"
                      values={contentTypeValues}
                      selectedValues={columnFilters.contentType}
                      onToggleFilter={(value) => toggleColumnFilter('contentType', value)}
                      onClearAll={() => clearColumnFilters('contentType')}
                      onClose={() => setActiveColumnFilter(null)}
                      triggerElement={filterTriggerElement}
                    />
                  )}
                  
                  {activeColumnFilter === 'partOfSpeech' && (
                    <FilterPanel
                      column="partOfSpeech"
                      values={partOfSpeechValues}
                      selectedValues={columnFilters.partOfSpeech}
                      onToggleFilter={(value) => toggleColumnFilter('partOfSpeech', value)}
                      onClearAll={() => clearColumnFilters('partOfSpeech')}
                      onClose={() => setActiveColumnFilter(null)}
                      triggerElement={filterTriggerElement}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'export' && (
          <div className="content-section active" id="export">
            <div className="content-header">
              <h2>Export Data</h2>
              <p>Export your saved words and settings in various formats</p>
            </div>
            <div className="content-body">
              <div className="export-options">
                <div className="export-card">
                  <svg className="export-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 002-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"></path>
                  </svg>
                  <h3>Export as CSV</h3>
                  <p>Download your saved words as a CSV file for use in spreadsheet applications</p>
                  <button className="btn btn-primary" onClick={exportAsCSV}>Export CSV</button>
                </div>
                <div className="export-card">
                  <svg className="export-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                  </svg>
                  <h3>Export as JSON</h3>
                  <p>Download your data as JSON format for backup or importing to other applications</p>
                  <button className="btn btn-primary" onClick={exportAsJSON}>Export JSON</button>
                </div>
                <div className="export-card">
                  <svg className="export-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  <h3>Export Settings</h3>
                  <p>Backup your extension settings to restore them later or share with other devices</p>
                  <button className="btn btn-primary" onClick={exportSettings}>Export Settings</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'statistics' && (
          <div className="content-section active" id="statistics">
            <div className="content-header">
              <h2>Statistics</h2>
              <p>View your learning progress and usage statistics</p>
            </div>
            <div className="content-body">
              <div className="empty-state">
                <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                <h3>Statistics Coming Soon</h3>
                <p>Track your vocabulary growth and learning patterns</p>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'about' && (
          <div className="content-section active" id="about">
            <div className="content-header">
              <h2>About</h2>
              <p>Information about Semantix Chrome Extension</p>
            </div>
            <div className="content-body">
              <div className="words-container">
                <div className="words-header">
                  <h3>Semantix Dictionary Extension</h3>
                </div>
                <div style={{ padding: 24 }}>
                  <p><strong>Version:</strong> 1.0.0</p>
                  <p style={{ marginTop: 12 }}><strong>Description:</strong> A powerful dictionary and translation tool that helps you understand words and phrases while browsing the web.</p>
                  <h4 style={{ marginTop: 24, marginBottom: 12, color: '#1e293b' }}>Features:</h4>
                  <ul style={{ marginLeft: 20, color: '#64748b', lineHeight: 1.6 }}>
                    <li>AI-powered definitions and translations</li>
                    <li>Support for multiple languages</li>
                    <li>Save words for later review</li>
                    <li>Export your vocabulary data</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

