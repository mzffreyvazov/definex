const cheerio = require("cheerio");
const express = require("express");
const axios = require("axios");
const app = express();
const cors = require("cors");

// In-memory cache for dictionary and verb data
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_CACHE_SIZE = 1000; // Maximum number of cached entries

// Cache management functions
const getCacheKey = (type, language, entry) => `${type}:${language}:${entry.toLowerCase()}`;

const getCachedData = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  if (cached) {
    cache.delete(key); // Remove expired entry
  }
  return null;
};

const setCachedData = (key, data) => {
  // Implement LRU eviction when cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  
  cache.set(key, {
    data: data,
    timestamp: Date.now()
  });
};

const getCacheStats = () => ({
  size: cache.size,
  maxSize: MAX_CACHE_SIZE,
  ttl: CACHE_TTL / 1000 / 60, // TTL in minutes
});

// Utility function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility function to make requests with retry logic
const makeRequestWithRetry = async (url, config, maxRetries = 2) => {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) {
        // Add exponential backoff delay for retries
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 2), 5000);
        console.log(`Retry attempt ${attempt - 1} after ${delayMs}ms delay`);
        await delay(delayMs);
      }
      
      const response = await axios.get(url, config);
      return response;
    } catch (error) {
      console.log(`Request attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries + 1 || 
          (error.response && error.response.status >= 400 && error.response.status < 500)) {
        // Don't retry for client errors (4xx) or if we've exhausted all retries
        throw error;
      }
    }
  }
};

const fetchVerbs = async (wiki, entry) => {
  const cacheKey = getCacheKey('verbs', 'wiki', entry);
  
  // Check cache first
  const cachedVerbs = getCachedData(cacheKey);
  if (cachedVerbs) {
    console.log(`Cache HIT for verbs: ${entry}`);
    return cachedVerbs;
  }

  console.log(`Cache MISS for verbs: ${entry} - fetching from Wiktionary`);
  
  try {
    const config = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive'
      },
      timeout: 8000
    };

    const response = await makeRequestWithRetry(wiki, config, 1); // Less retries for secondary data
    const $$ = cheerio.load(response.data);
    const verb = $$("tr > td > p ").text();

    const lines = verb
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const verbs = [];
    for (let i = 0; i < lines.length; i += 2) {
      if (verbs.includes({ type: lines[i], text: lines[i + 1] })) {
        break;
      }
      const type = lines[i];
      const text = lines[i + 1];
      if (type && text) {
        verbs.push({ id: verbs.length, type, text });
      } else {
        verbs.push();
      }
    }
    
    // Cache the result
    setCachedData(cacheKey, verbs);
    
    return verbs;
  } catch (error) {
    console.log('Error fetching verbs from Wiktionary:', error.message);
    return []; // Return empty array instead of undefined
  }
};

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Cache-Status', 'X-Response-Time', 'X-Rate-Limit-Remaining'],
  maxAge: 86400 // 24 hours preflight cache
}));

app.use(express.json()); // Add JSON body parser middleware

// Cache status endpoint
app.get("/api/cache/stats", (req, res) => {
  res.json(getCacheStats());
});

// Cache clear endpoint (for development/debugging)
app.get("/api/cache/clear", (req, res) => {
  cache.clear();
  res.json({ message: "Cache cleared successfully", stats: getCacheStats() });
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/api/dictionary/:language/:entry", async (req, res, next) => {
  const startTime = Date.now();
  const entry = req.params.entry;
  const slugLanguage = req.params.language;
  let nation = "us";
  let language;

  if (slugLanguage === "en") {
    language = "english";
  } else if (slugLanguage === "uk") {
    language = "english";
    nation = "uk";
  } else if (slugLanguage === "en-tw") {
    language = "english-chinese-traditional";
  } else if (slugLanguage === "en-cn") {
    language = "english-chinese-simplified";
  }

  // Check cache first
  const cacheKey = getCacheKey('dictionary', slugLanguage, entry);
  const cachedResult = getCachedData(cacheKey);
  
  if (cachedResult) {
    const responseTime = Date.now() - startTime;
    console.log(`Cache HIT for dictionary: ${slugLanguage}/${entry} (${responseTime}ms)`);
    
    res.set({
      'X-Cache-Status': 'HIT',
      'X-Response-Time': `${responseTime}ms`
    });
    
    return res.status(200).json(cachedResult);
  }

  console.log(`Cache MISS for dictionary: ${slugLanguage}/${entry} - fetching from Cambridge`);

  const url = `https://dictionary.cambridge.org/${nation}/dictionary/${language}/${entry}`;
  
  try {
    // Configure axios to appear more like a real browser request
    const config = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      },
      timeout: 10000, // 10 second timeout
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 300; // Only resolve for 2xx status codes
      }
    };

    const response = await makeRequestWithRetry(url, config, 2);
    const html = response.data;
    
    const $ = cheerio.load(html);
    const siteurl = "https://dictionary.cambridge.org";
    const wiki = `https://simple.wiktionary.org/wiki/${entry}`;

    // Add small delay before making secondary request
    await delay(500);

    // get verbs
    const verbs = await fetchVerbs(wiki, entry);

    // basic

    const word = $(".hw.dhw").first().text();
    const getPos = $(".pos.dpos") // part of speech
      .map((index, element) => {
        return $(element).text();
      })
      .get();
    const pos = getPos.filter(
      (item, index) => getPos.indexOf(item) === index,
    );

    // Phonetics audios
    const audio = [];
    for (const s of $(".pos-header.dpos-h")) {
      const posNode = s.childNodes.find(
        (c) =>
          c.attribs && c.attribs.class && c.attribs.class.includes("dpos-g"),
      );
      if (!posNode || posNode.childNodes.length === 0) continue;
      const p = $(posNode.childNodes[0]).text();
      const nodes = s.childNodes.filter(
        (c) =>
          c.name === "span" &&
          c.attribs &&
          c.attribs.class &&
          c.attribs.class.includes("dpron-i"),
      );
      if (nodes.length === 0) continue;
      for (const node of nodes) {
        if (node.childNodes.length < 3) continue;
        const lang = $(node.childNodes[0]).text();
        const aud = node.childNodes[1].childNodes.find(
          (c) => c.name === "audio",
        );
        if (!aud) continue;
        const src = aud.childNodes.find((c) => c.name === "source");
        if (!src) continue;
        const url = siteurl + $(src).attr("src");
        const pron = $(node.childNodes[2]).text();
        audio.push({ pos: p, lang: lang, url: url, pron: pron });
      }
    }

    // definition & example
    const exampleCount = $(".def-body.ddef_b")
      .map((index, element) => {
        const exampleElements = $(element).find(".examp.dexamp");
        return exampleElements.length;
      })
      .get();
    for (let i = 0; i < exampleCount.length; i++) {
      if (i == 0) {
        exampleCount[i] = exampleCount[i];
      } else {
        exampleCount[i] = exampleCount[i] + exampleCount[i - 1];
      }
    }

    const exampletrans = $(
      ".examp.dexamp > .trans.dtrans.dtrans-se.hdb.break-cj",
    ); // translation of the example
    const example = $(".examp.dexamp > .eg.deg")
      .map((index, element) => {
        return {
          id: index,
          text: $(element).text(),
          translation: exampletrans.eq(index).text(),
        };
      })
      .get();

    const source = (element) => {
      const defElement = $(element);
      const parentElement = defElement.closest(".pr.dictionary");
      const dataId = parentElement.attr("data-id");
      return dataId;
    };

    const defPos = (element) => {
      const defElement = $(element);
      const partOfSpeech = defElement
        .closest(".pr.entry-body__el")
        .find(".pos.dpos")
        .first()
        .text(); // Get the part of speech
      return partOfSpeech;
    };

    const getExample = (element) => {
      const ex = $(element)
        .find(".def-body.ddef_b > .examp.dexamp")
        .map((index, element) => {
          return {
            id: index,
            text: $(element).find(".eg.deg").text(),
            translation: $(element).find(".trans.dtrans").text(),
          };
        });
      return ex.get();
    };

    const definition = $(".def-block.ddef_block")
      .map((index, element) => {
        return {
          id: index,
          pos: defPos(element),
          source: source(element),
          text: $(element).find(".def.ddef_d.db").text(),
          translation: $(element)
            .find(".def-body.ddef_b > span.trans.dtrans")
            .text(),
          example: getExample(element),
        };
      })
      .get();

    // api response
    const responseTime = Date.now() - startTime;

    if (word === "") {
      res.set({
        'X-Cache-Status': 'MISS',
        'X-Response-Time': `${responseTime}ms`
      });
      res.status(404).json({
        error: "word not found",
      });
    } else {
      const result = {
        word: word,
        pos: pos,
        verbs: verbs,
        pronunciation: audio,
        definition: definition,
      };

      // Cache the successful result
      setCachedData(cacheKey, result);
      
      console.log(`Dictionary data cached for: ${slugLanguage}/${entry} (${responseTime}ms)`);
      
      res.set({
        'X-Cache-Status': 'MISS',
        'X-Response-Time': `${responseTime}ms`
      });
      
      res.status(200).json(result);
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error("Error fetching dictionary data:", error.message);
    
    res.set({
      'X-Cache-Status': 'ERROR',
      'X-Response-Time': `${responseTime}ms`
    });
    
    // Handle specific error types
    if (error.code === 'ERR_BAD_RESPONSE') {
      console.error(`HTTP Error: ${error.response?.status} - ${error.response?.statusText}`);
      res.status(503).json({
        error: "Dictionary service temporarily unavailable",
        details: "The dictionary website may be blocking automated requests or experiencing issues"
      });
    } else if (error.code === 'ECONNABORTED') {
      res.status(408).json({
        error: "Request timeout",
        details: "The dictionary service took too long to respond"
      });
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      res.status(503).json({
        error: "Dictionary service unavailable",
        details: "Cannot connect to the dictionary service"
      });
    } else {
      res.status(500).json({
        error: "Failed to fetch dictionary data",
        details: "An unexpected error occurred while processing your request"
      });
    }
  }
});
// --- ADD THIS ENTIRE BLOCK TO data.js ---

// Load environment variables from .env file
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Make sure to handle the case where the API key is missing
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in the .env file.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Function to build the prompt for the AI
function getGeminiPrompt(word, targetLanguage = null) {
  // Determine if input is a single word or phrase
  const words = word.trim().split(/\s+/);
  const isPhrase = words.length > 1;
  const inputType = isPhrase ? 'phrase' : 'word';
  const inputLabel = isPhrase ? 'phrase' : 'word';
  
  // Translation instruction based on target language
  const translationInstruction = targetLanguage && targetLanguage !== 'none' 
    ? `\n\nIMPORTANT: Include translations to ${targetLanguage} for the following:
       - Add a "translation" field with the ${inputType} translated to ${targetLanguage}
       - For each definition, add a "definitionTranslation" field with the definition translated to ${targetLanguage}
       - For each example, add a "translation" field with the example translated to ${targetLanguage}`
    : '';
  
  const translationFields = targetLanguage && targetLanguage !== 'none'
    ? `,
      "translation": "the ${inputType} translated to ${targetLanguage}"`
    : '';
    
  const definitionTranslationField = targetLanguage && targetLanguage !== 'none'
    ? `,
              "definitionTranslation": "The definition translated to ${targetLanguage}"`
    : '';
    
  const exampleTranslationField = targetLanguage && targetLanguage !== 'none'
    ? `,
                "translation": "The example translated to ${targetLanguage}"`
    : '';
  
  return `
    You are a helpful linguistic expert API. Your task is to provide a detailed definition for the ${inputType}: "${word}".${translationInstruction}

    You MUST respond with ONLY a valid JSON object. Do not include any introductory text, explanations, or markdown formatting like \`\`\`json.

    The JSON object must follow this exact structure:
    {
      "${inputLabel}": "the original ${inputType}"${translationFields},
      "pronunciation": "/ipa_pronunciation/",
      "forms": [
        {
          "partOfSpeech": "${isPhrase ? 'phrase type (e.g., idiom, compound noun, phrasal verb)' : 'part of speech (e.g., verb, noun)'}",
          "definitions": [
            {
              "definition": "The clear and concise definition text."${definitionTranslationField},
              "examples": [
                {
                  "text": "Example sentence 1."${exampleTranslationField}
                },
                {
                  "text": "Example sentence 2."${exampleTranslationField}
                },
                {
                  "text": "Example sentence 3."${exampleTranslationField}
                },
                {
                  "text": "Example sentence 4."${exampleTranslationField}
                },
                {
                  "text": "Example sentence 5."${exampleTranslationField}
                }
              ]
            }
          ]
        }
      ]
    }

    ${isPhrase ? 
      `- For phrases, identify the type (idiom, compound noun, phrasal verb, collocation, etc.)
       - Provide clear definitions that explain the meaning of the phrase as a whole
       - Include pronunciation if commonly used as a unit
       - For each definition, provide exactly 5 distinct example sentences showing the phrase in context` :
      `- Provide all common parts of speech for the word
       - For each part of speech, provide at least one common definition
       - For each definition, provide exactly 5 distinct example sentences`}
    - If the ${inputType} is nonsensical or cannot be defined, return this exact JSON object: {"error": "${inputType.charAt(0).toUpperCase() + inputType.slice(1)} not found"}
  `;
}

app.get("/api/gemini/:entry", async (req, res) => {
  try {
    const word = decodeURIComponent(req.params.entry);
    const targetLanguage = req.query.lang || null; // Get target language from query parameter
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
    const prompt = getGeminiPrompt(word, targetLanguage);

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    // --- FIX: Clean the AI's response before parsing ---
    // This regular expression finds a JSON object that might be wrapped in ```json ... ```
    const jsonMatch = responseText.match(/```(json)?([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[2]) {
      // If we find a match, use the content inside the backticks
      responseText = jsonMatch[2].trim();
    }
    // --- END FIX ---

    // Now, parse the cleaned string
    const jsonResponse = JSON.parse(responseText);

    res.status(200).json(jsonResponse);
  } catch (error) {
    // Add more detail to the error log
    console.error("Error processing Gemini API response:", error);
    console.error("Original AI response text:", result.response.text()); // Log the problematic text
    res.status(500).json({ error: "Failed to parse a valid JSON response from the AI." });
  }
});

// New endpoint for sentence translation
app.get("/api/translate/:sentence", async (req, res) => {
  try {
    const sentence = decodeURIComponent(req.params.sentence);
    const targetLanguage = req.query.lang || 'Spanish'; // Default to Spanish if not specified
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not set in the .env file." });
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
    
  const prompt = `
    You are a professional translator. Your task is to translate the following sentence to ${targetLanguage} and provide contextual information.

    You MUST respond with ONLY a valid JSON object. Do not include any introductory text, explanations, or markdown formatting like \`\`\`json.

    The JSON object must follow this exact structure:
    {
      "originalSentence": "the original sentence",
      "translation": "the sentence translated to ${targetLanguage}",
      "targetLanguage": "${targetLanguage}",
      "context": "brief explanation of the meaning or context if needed",
      "keyPhrases": [
        {
          "original": "key phrase from original",
          "translation": "translation of this phrase",
          "explanation": "brief explanation if needed"
        }
      ]
    }

    Sentence to translate: "${sentence}"

    - Provide a natural, fluent translation that preserves the original meaning
    - Include context only if the sentence has cultural references, idioms, or ambiguous meanings
    - Include keyPhrases for important phrases, idioms, or terms that might be difficult to understand
    - If the sentence cannot be translated meaningfully, return: {"error": "Unable to translate sentence"}
  `;    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    // Clean the AI's response before parsing
    const jsonMatch = responseText.match(/```(json)?([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[2]) {
      responseText = jsonMatch[2].trim();
    }

    const jsonResponse = JSON.parse(responseText);
    res.status(200).json(jsonResponse);

  } catch (error) {
    console.error("Error processing sentence translation:", error);
    res.status(500).json({ error: "Failed to translate sentence." });
  }
});

// Text-to-Speech endpoint for phrases and sentences using Eleven Labs
app.get("/api/tts/:text", async (req, res) => {
  try {
    const text = decodeURIComponent(req.params.text);
    const words = text.trim().split(/\s+/);
    const wordCount = words.length;
    
    console.log(`[TTS GET] Request received for text: "${text}"`);
    console.log(`[TTS GET] Word count: ${wordCount}`);
    
    // Only allow phrases (2-5 words) and sentences (6+ words)
    if (wordCount < 2) {
      console.log(`[TTS GET] Request rejected - only ${wordCount} word(s)`);
      return res.status(400).json({ 
        error: "Text-to-speech is only available for phrases (2-5 words) and sentences (6+ words), not individual words." 
      });
    }
    
    if (!process.env.ELEVENLABS_API_KEY) {
      console.log(`[TTS GET] Error - EL EVENLABS_API_KEY not found in environment`);
      return res.status(500).json({ error: "ELEVENLABS_API_KEY is not set in the .env file." });
    }
    
    // Eleven Labs API configuration
    const voiceId = "JBFqnCBsd6RMkjVDRZzb"; // Default voice ID
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
    
    const requestBody = {
      text: text,
      model_id: "eleven_multilingual_v2"
    };
    
    console.log(`[TTS GET] Making request to Eleven Labs API`);
    console.log(`[TTS GET] API URL: ${apiUrl}`);
    console.log(`[TTS GET] Request body:`, requestBody);
    console.log(`[TTS GET] API Key present: ${process.env.ELEVENLABS_API_KEY ? 'Yes' : 'No'}`);
    
    // Make request to Eleven Labs API
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer' // Important: Get binary data
    });
    
    console.log(`[TTS GET] Eleven Labs API response status: ${response.status}`);
    console.log(`[TTS GET] Audio data size: ${response.data.length} bytes`);
    
    // Set appropriate headers for audio response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'attachment; filename="speech.mp3"',
      'Content-Length': response.data.length
    });
    
    // Send the audio data
    res.send(response.data);
    
    console.log(`[TTS GET] Audio successfully sent to client`);
    
  } catch (error) {
    console.error("[TTS GET] Error generating text-to-speech:", error.message);
    
    // Handle specific Eleven Labs API errors
    if (error.response) {
      const status = error.response.status;
      console.error(`[TTS GET] Eleven Labs API error - Status: ${status}`);
      console.error(`[TTS GET] Error response:`, error.response.data);
      
      if (status === 401) {
        return res.status(401).json({ error: "Invalid Eleven Labs API key." });
      } else if (status === 429) {
        return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
      } else if (status === 422) {
        return res.status(422).json({ error: "Invalid request parameters." });
      }
    } else if (error.request) {
      console.error(`[TTS GET] Network error - no response received:`, error.request);
    } else {
      console.error(`[TTS GET] Request setup error:`, error.message);
    }
    
    res.status(500).json({ error: "Failed to generate text-to-speech audio." });
  }
});

// Text-to-Speech with custom voice endpoint
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voiceId = "JBFqnCBsd6RMkjVDRZzb", modelId = "eleven_multilingual_v2" } = req.body;
    
    console.log(`[TTS POST] Request received for text: "${text}"`);
    console.log(`[TTS POST] Voice ID: ${voiceId}, Model ID: ${modelId}`);
    
    if (!text) {
      console.log(`[TTS POST] Request rejected - no text provided`);
      return res.status(400).json({ error: "Text is required." });
    }
    
    const words = text.trim().split(/\s+/);
    const wordCount = words.length;
    
    console.log(`[TTS POST] Word count: ${wordCount}`);
    
    // Only allow phrases (2-5 words) and sentences (6+ words)
    if (wordCount < 2) {
      console.log(`[TTS POST] Request rejected - only ${wordCount} word(s)`);
      return res.status(400).json({ 
        error: "Text-to-speech is only available for phrases (2-5 words) and sentences (6+ words), not individual words." 
      });
    }
    
    if (!process.env.ELEVENLABS_API_KEY) {
      console.log(`[TTS POST] Error - ELEVENLABS_API_KEY not found in environment`);
      return res.status(500).json({ error: "ELEVENLABS_API_KEY is not set in the .env file." });
    }
    
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
    
    const requestBody = {
      text: text,
      model_id: modelId
    };
    
    console.log(`[TTS POST] Making request to Eleven Labs API`);
    console.log(`[TTS POST] API URL: ${apiUrl}`);
    console.log(`[TTS POST] Request body:`, requestBody);
    
    // Make request to Eleven Labs API
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });
    
    console.log(`[TTS POST] Eleven Labs API response status: ${response.status}`);
    console.log(`[TTS POST] Audio data size: ${response.data.length} bytes`);
    
    // Set appropriate headers for audio response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'attachment; filename="speech.mp3"',
      'Content-Length': response.data.length
    });
    
    // Send the audio data
    res.send(response.data);
    
    console.log(`[TTS POST] Audio successfully sent to client`);
    
  } catch (error) {
    console.error("[TTS POST] Error generating text-to-speech:", error.message);
    
    if (error.response) {
      const status = error.response.status;
      console.error(`[TTS POST] Eleven Labs API error - Status: ${status}`);
      console.error(`[TTS POST] Error response:`, error.response.data);
      
      if (status === 401) {
        return res.status(401).json({ error: "Invalid Eleven Labs API key." });
      } else if (status === 429) {
        return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
      } else if (status === 422) {
        return res.status(422).json({ error: "Invalid request parameters." });
      }
    } else if (error.request) {
      console.error(`[TTS POST] Network error - no response received:`, error.request);
    } else {
      console.error(`[TTS POST] Request setup error:`, error.message);
    }
    
    res.status(500).json({ error: "Failed to generate text-to-speech audio." });
  }
});

module.exports = app;