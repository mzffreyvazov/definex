# DefineX - Define Anything 

## New Features
- **Phrase Support**: When using Gemini AI source, you can now select and get definitions for phrases up to 5 words long  
- **Sentence Translation**: Double-click a sentence (more than 5 words) to get a translation into your chosen target language via Gemini AI  
- **Text-to-Speech (TTS)**: Enable audio playback for phrases and sentences directly from the popup  
- **Smart Selection**: Single words work with all sources; phrases (2–5 words) only work with Gemini  
- **Enhanced Definitions**: Gemini provides context-aware definitions for both words and phrases  

## Installation & Setup

### 1. Install API Server Dependencies
```bash
cd api-server
npm install
```

### 2. Set up API Keys (Required for full functionality)
1. Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)  
2. Get your ElevenLabs API key from [ElevenLabs](https://elevenlabs.io/speech-synthesis) (required for Text-to-Speech)
3. Copy `.env.example` to `.env`:
    - On Windows (cmd):
       ```cmd
       copy .env.example .env
       ```
       On PowerShell:
       ```powershell
       Copy-Item .env.example .env
       ```
       On macOS/Linux:
       ```bash
       cp .env.example .env
       ```
4. Edit `.env` file and set the following environment variables:
   ```
   GEMINI_API_KEY="your_actual_gemini_api_key"
   ELEVENLABS_API_KEY="your_actual_elevenlabs_api_key"
   ```

### 3. Start the API Server
```bash
npm start
```
The server will run on `https://definex.tech`

### 4. Load the Extension
1. Open Chrome and go to `chrome://extensions/`  
2. Enable **Developer mode**  
3. Click **Load unpacked** and select the DefineX extension folder:
   - If you build with Vite, select `extension/dist`
   - Otherwise, select the `extension` folder

### 5. Configure Extension
1. Click the DefineX icon or go to extension options  
2. Select **Gemini AI** as your preferred source for phrase support  
3. Configure other settings as needed  

## Usage

### Per-site Control (Popup)
- Open the popup on any site and use the toggle to enable/disable DefineX just for that site
- The status shows whether the current site is enabled

### Single Words (All Sources)
- Double-click any single word to get its definition  
- Works with Cambridge, Merriam-Webster, and Gemini sources

### Phrases (Gemini Only)
- Select a phrase of 2–5 words  
- Double-click the selection  
- Only works when Gemini is selected as the source  
- Examples that work:
  - "break down" (phrasal verb)  
  - "machine learning" (compound noun)  
  - "piece of cake" (idiom)  
  - "in spite of" (prepositional phrase)

### Sentences (Gemini Only)
- Select a sentence of more than 5 words  
- Double-click the selection  
- Only works when Gemini is selected as the source  
- The popup will show the translated sentence and key phrases  
- If Text-to-Speech is enabled, click the 🔊 button to hear the sentence spoken aloud

### Supported Phrase Types
- Idioms ("break the ice", "spill the beans")  
- Phrasal verbs ("look up", "give up")  
- Compound nouns ("ice cream", "fire truck")  
- Collocations ("heavy rain", "make a decision")  
- Technical terms ("artificial intelligence", "carbon footprint")

## Features by Source

| Feature                | Cambridge | Merriam-Webster | Gemini |
|------------------------|-----------|-----------------|--------|
| Single words           | ✅        | ✅              | ✅     |
| Phrases (2–5 words)    | ❌        | ❌              | ✅     |
| Audio pronunciation    | ✅        | ✅              | ✅*    |
| Multiple definitions   | ✅        | ✅              | ✅     |
| Examples               | ✅        | ✅              | ✅     |

*Audio from Cambridge Dictionary when available

## Latest Additions

- Per-site enable/disable from the popup
- Saved Words manager in Options: search, multi-select, delete one or many, click-blank to deselect
- Inline column filters: Content Type, Part of Speech, Date Added (Today, Last 7, Last 30)
- Export Saved Words: CSV and JSON
- Export Settings (excludes API keys): JSON with metadata
- API keys masking in Options (keys are obscured after save)
- TTS toggle in Options (requires ElevenLabs API key)

## Troubleshooting

### "Definition not found" errors
- Make sure the API server is running (`npm start` in api-server folder)  
- Check that your Gemini API key is correctly set in the `.env` file  
- Verify your internet connection

### Text-to-Speech not working
- Ensure your ElevenLabs API key is correctly set in the `.env` file
- Check that TTS is enabled in the extension options
- Verify the API server is running and accessible

### Phrase selection not working
- Ensure Gemini is selected as the source in extension options  
- Make sure the phrase is 2–5 words and contains only letters, spaces, hyphens, and apostrophes  
- Try selecting the text more precisely

### Extension not responding
- Check that the DefineX extension is properly loaded in `chrome://extensions/`  
- Make sure the API server is running on `https://definex.tech`  
- Try reloading the extension and the page