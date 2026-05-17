const axios = require("axios");
const fs = require("fs");
const path = require("path");

// GROQ OpenAI-compatible endpoint
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

function imageToBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString("base64");
}

function getMediaType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mediaTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return mediaTypes[ext] || "image/jpeg";
}

function extractFirstJSON(text) {
  if (!text || typeof text !== "string") return null;
  // Find the first {...} block
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    return null;
  }
}

/**
 * Analyze pet image using Groq (OpenAI-compatible) chat completions endpoint.
 * Returns an object: { petName, breed, expectedAge, origin }
 * Implements retries, backoff, robust parsing and detailed logging.
 */
async function analyzePetImage(imagePath) {
  const GROQ_API_KEY = process.env.GROK_API_KEY || process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY (or GROK_API_KEY) not set in environment variables");
  }

  const model = "meta-llama/llama-4-scout-17b-16e-instruct";

  console.info("🔍 Starting pet image analysis");
  console.info("   Image:", imagePath);
  console.info("   API Endpoint:", GROQ_API_URL);
  console.info("   Model:", model);

  const base64Image = imageToBase64(imagePath);
  const mediaType = getMediaType(imagePath);
  console.info("   Media type:", mediaType, " base64 bytes:", base64Image.length);

  // Optimized prompt for breed detection and age estimation
  const prompt = `You are an expert veterinary AI. Analyze the provided image and return ONLY a JSON object (no surrounding text) with the following keys: \n` +
    `- \"petName\": common animal type (e.g., \"Dog\", \"Cat\")\n` +
    `- \"breed\": specific breed if identifiable, otherwise \"Unknown\"\n` +
    `- \"expectedAge\": estimated age range in years (e.g., \"3 years\", \"2-4 years\", or \"Unknown\")\n` +
    `- \"origin\": country or region where this breed commonly originates, or \"Unknown\"\n` +
    `Focus on visual breed markers (coat, ears, snout, size) and be conservative with age estimates. If unsure, return \"Unknown\" for that field.`;

  // Build messages in OpenAI chat format; include image as requested
  const dataUri = `data:${mediaType};base64,${base64Image}`;
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: dataUri,
          },
        },
        {
          type: "text",
          text: prompt,
        },
      ],
    },
  ];

  const payload = {
    model,
    messages,
    // keep response concise
    max_tokens: 512,
    temperature: 0.0,
  };

  const axiosConfig = {
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 60000,
    validateStatus: null, // we'll handle status codes manually
  };

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.info(`Attempt ${attempt} -> POST ${GROQ_API_URL}`);
      const resp = await axios.post(GROQ_API_URL, payload, axiosConfig);

      console.info(`Grok response status: ${resp.status}`);

      // Handle common HTTP errors explicitly
      if (resp.status === 401) {
        throw new Error("Authentication failed: invalid GROQ_API_KEY (HTTP 401)");
      }
      if (resp.status === 404 || (resp.status === 400 && resp.data && /model not found/i.test(JSON.stringify(resp.data)))) {
        throw new Error(`Model not found or unsupported model: ${model} (HTTP ${resp.status})`);
      }
      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers["retry-after"] || "1", 10) || 1;
        console.warn(`Rate limited (429). Retry-After: ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        lastError = new Error("Rate limited by Groq API (429)");
        continue; // retry
      }
      if (resp.status >= 400 && resp.status < 500) {
        // Client error - likely payload or model issue; do not retry
        const bodySnippet = resp.data ? JSON.stringify(resp.data).slice(0, 2000) : "";
        throw new Error(`Client error from Groq API (HTTP ${resp.status}): ${bodySnippet}`);
      }
      if (resp.status >= 500) {
        // Server error - retry
        console.warn(`Server error from Groq API (HTTP ${resp.status}). Will retry if attempts remain.`);
        lastError = new Error(`Server error from Groq API (HTTP ${resp.status})`);
        // exponential backoff
        const waitMs = 1000 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // Successful (200-ish) response
      const body = resp.data;
      // The content could be various shapes; try to extract text or JSON
      let candidateText = null;

      try {
        // OpenAI-compatible: choices[0].message.content may be string, array, or object
        const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
        const message = choice?.message || choice?.delta || null;

        if (message) {
          const content = message.content;
          if (typeof content === "string") candidateText = content;
          else if (Array.isArray(content)) {
            // find first text piece
            const txtPiece = content.find((c) => typeof c === "string");
            if (txtPiece) candidateText = txtPiece;
            else {
              // try to stringify structured parts
              candidateText = content.map((c) => (typeof c === "string" ? c : JSON.stringify(c))).join("\n");
            }
          } else if (typeof content === "object") {
            candidateText = JSON.stringify(content);
          }
        }
      } catch (e) {
        console.warn("Warning: failed to extract message content from response", e.message || e);
      }

      // Fallback: stringify whole response
      if (!candidateText) {
        candidateText = JSON.stringify(body);
      }

      console.debug("Grok raw candidateText:", candidateText.slice(0, 2000));

      // Try to extract JSON object
      let parsed = extractFirstJSON(candidateText);
      if (!parsed && body && typeof body === "object") {
        // Maybe body contains a direct JSON result in another field
        // Search stringified body for JSON
        parsed = extractFirstJSON(JSON.stringify(body));
      }

      if (!parsed) {
        throw new Error("Could not extract valid JSON object from Groq response");
      }

      // Normalize and provide fallbacks
      const petName = (parsed.petName || parsed.pet || parsed.type || "Unknown").toString();
      const breed = (parsed.breed || parsed.race || parsed.species || "Unknown").toString();
      const expectedAge = (parsed.expectedAge || parsed.age || parsed.estimatedAge || "Unknown").toString();
      const origin = (parsed.origin || parsed.country || parsed.region || "Unknown").toString();

      // Defensive defaults
      const result = {
        petName: petName || "Unknown",
        breed: breed || "Unknown",
        expectedAge: expectedAge || "Unknown",
        origin: origin || "Unknown",
      };

      console.info("✅ Analysis result:", result);
      return result;
    } catch (err) {
      // Handle axios timeout or network errors specifically
      lastError = err;
      const msg = err.message || String(err);
      console.error(`Attempt ${attempt} error:`, msg);

      // Do not retry for certain client errors
      if (/Authentication failed|invalid GROQ_API_KEY|Model not found|unsupported model|Client error from Groq API/i.test(msg)) {
        throw err;
      }

      // Timeout (axios uses code 'ECONNABORTED')
      if (err.code === "ECONNABORTED" || /timeout/i.test(msg)) {
        console.warn("Request timeout or network issue, will retry if attempts remain.");
      }

      // exponential backoff before retrying
      if (attempt < maxAttempts) {
        const waitMs = 1000 * Math.pow(2, attempt - 1);
        console.info(`Waiting ${waitMs}ms before retrying...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // final failure
      console.error("All Groq attempts failed.");
      // map common errors to friendly messages
      if (lastError.response && lastError.response.status === 401) {
        throw new Error("Authentication failed: invalid GROQ_API_KEY (HTTP 401)");
      }
      if (lastError.response && lastError.response.status === 429) {
        throw new Error("Rate limited by Groq API (HTTP 429). Please retry later.");
      }
      if (lastError.response && lastError.response.status >= 400 && lastError.response.status < 500) {
        throw new Error(`Groq API client error: HTTP ${lastError.response.status} - ${JSON.stringify(lastError.response.data)}`);
      }
      if (lastError.code === "ENOTFOUND") {
        throw new Error("Network error: DNS lookup failed for Groq API endpoint");
      }
      if (/Could not extract valid JSON/.test(lastError.message || "")) {
        throw new Error("Response parsing error: Groq did not return valid JSON");
      }

      throw new Error(lastError.message || String(lastError));
    }
  }
}

module.exports = {
  analyzePetImage,
};
