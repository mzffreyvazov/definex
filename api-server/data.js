const cheerio = require("cheerio");
const request = require("request");
const express = require("express");
const axios = require("axios");
const app = express();
const cors = require("cors");

const fetchVerbs = (wiki) => {
  return new Promise((resolve, reject) => {
    axios
      .get(wiki)
      .then((response) => {
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
        resolve(verbs);
      })
      .catch((error) => {
        resolve();
      });
  });
};

app.use(cors({ origin: "*" }));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/api/dictionary/:language/:entry", (req, res, next) => {
  const entry = req.params.entry;
  const slugLanguage = req.params.language;
  let nation = "us";

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

  const url = `https://dictionary.cambridge.org/${nation}/dictionary/${language}/${entry}`;
  request(url, async (error, response, html) => {
    if (!error && response.statusCode == 200) {
      const $ = cheerio.load(html);
      const siteurl = "https://dictionary.cambridge.org";
      const wiki = `https://simple.wiktionary.org/wiki/${entry}`;

      // get verbs

      const verbs = await fetchVerbs(wiki);

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

      if (word === "") {
        res.status(404).json({
          error: "word not found",
        });
      } else {
        res.status(200).json({
          word: word,
          pos: pos,
          verbs: verbs,
          pronunciation: audio,
          definition: definition,
        });
      }
    }
  });
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
function getGeminiPrompt(word) {
  // Determine if input is a single word or phrase
  const words = word.trim().split(/\s+/);
  const isPhrase = words.length > 1;
  const inputType = isPhrase ? 'phrase' : 'word';
  const inputLabel = isPhrase ? 'phrase' : 'word';
  
  return `
    You are a helpful linguistic expert API. Your task is to provide a detailed definition for the ${inputType}: "${word}".

    You MUST respond with ONLY a valid JSON object. Do not include any introductory text, explanations, or markdown formatting like \`\`\`json.

    The JSON object must follow this exact structure:
    {
      "${inputLabel}": "the original ${inputType}",
      "pronunciation": "/ipa_pronunciation/",
      "forms": [
        {
          "partOfSpeech": "${isPhrase ? 'phrase type (e.g., idiom, compound noun, phrasal verb)' : 'part of speech (e.g., verb, noun)'}",
          "definitions": [
            {
              "definition": "The clear and concise definition text.",
              "examples": [
                "Example sentence 1.",
                "Example sentence 2.",
                "Example sentence 3.",
                "Example sentence 4.",
                "Example sentence 5."
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
    const prompt = getGeminiPrompt(word);

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

module.exports = app;