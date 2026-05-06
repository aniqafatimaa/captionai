// ============================================================
// server.js — This is your BACKEND (the secure middleman)
// ============================================================
//
// WHAT IS A BACKEND?
// Think of it like a waiter at a restaurant:
//   - You (the browser/frontend) tell the waiter what you want
//   - The waiter (this server) goes to the kitchen (Gemini API)
//   - The kitchen prepares the food (captions)
//   - The waiter brings it back to you
//   You never go into the kitchen yourself — and the secret
//   recipe (API key) stays in the kitchen, hidden from you.
//
// WHY NODE.JS + EXPRESS?
//   Node.js  = lets JavaScript run on a server (not just browser)
//   Express  = a library that makes building servers easy
// ============================================================

// --- STEP 1: Load the packages we need ---

// dotenv reads your .env file and makes GEMINI_API_KEY available
// as process.env.GEMINI_API_KEY anywhere in this file
require('dotenv').config();

// express helps us create a web server and define routes (URLs)
const express = require('express');

// cors allows your frontend (different URL) to talk to this server
// Without this, the browser blocks cross-origin requests
const cors = require('cors');

// node-fetch lets Node.js make HTTP requests (like fetch in browser)
const fetch = require('node-fetch');

// path helps us work with file/folder paths safely
const path = require('path');


// --- STEP 2: Create the Express app ---
const app = express();

// Tell Express to accept JSON data in request bodies
// (when frontend sends caption request, it sends JSON)
app.use(express.json({ limit: '10mb' })); // 10mb limit for images

// Enable CORS — allow frontend to call this backend
app.use(cors());

// Serve static files from the "public" folder
// This means index.html, CSS, images etc. from /public
// are automatically served when someone visits your site
app.use(express.static(path.join(__dirname, 'public')));


// --- STEP 3: The API route (the main endpoint) ---
//
// WHAT IS A ROUTE?
// A route is a URL your server listens to.
// POST /api/generate-captions means:
//   "When someone sends a POST request to /api/generate-captions,
//    run this function"
//
// The frontend will call: fetch('/api/generate-captions', { method: 'POST', ... })

app.post('/api/generate-captions', async (req, res) => {

  // req = the incoming request from the frontend (what they sent us)
  // res = our response back to the frontend (what we send back)

  try {

    // --- STEP 3a: Read what the frontend sent us ---
    // The frontend sends: { prompt, images (optional) }
    const { prompt, images } = req.body;

    // Basic validation — make sure we actually got a prompt
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // --- STEP 3b: Read the secret API key from environment ---
    // process.env reads from your .env file (locally)
    // or from Render's environment variables (in production)
    // THE BROWSER NEVER SEES THIS VALUE — it only exists on the server
    const apiKey = process.env.GEMINI_API_KEY;

    // --- STEP 3c: Build the request body for Gemini ---
    // This is the same format as before, just now it's on the server
    let requestBody;

    if (images && images.length > 0) {
      // With images: send image data + text prompt together
      const parts = [];
      for (const img of images) {
        parts.push({
          inline_data: {
            mime_type: img.mime_type,
            data: img.data  // base64 image data
          }
        });
      }
      parts.push({ text: prompt });
      requestBody = {
        contents: [{ parts }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2000 }
      };
    } else {
      // Text only: just send the prompt
      requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2000 }
      };
    }

    // --- STEP 3d: Call the Gemini API (from the SERVER, not browser) ---
    // The API key is in the URL here — but this happens on the server
    // so the user's browser never sees this request or the key
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    // --- STEP 3e: Handle Gemini errors ---
    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json();
      const errorMsg = errorData.error?.message || 'Gemini API error';

      // Give helpful error messages based on status code
      if (geminiResponse.status === 403 || geminiResponse.status === 400) {
        return res.status(401).json({ error: 'Invalid API key. Check your GEMINI_API_KEY.' });
      }
      if (geminiResponse.status === 429) {
        return res.status(429).json({ error: 'Quota exceeded. Wait a moment and try again.' });
      }
      return res.status(geminiResponse.status).json({ error: errorMsg });
    }

    // --- STEP 3f: Get the response from Gemini ---
    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse the JSON array of captions from Gemini's response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse Gemini response. Try again.' });
    }

    const captions = JSON.parse(jsonMatch[0]);

    // --- STEP 3g: Send captions back to the frontend ---
    // res.json() converts the object to JSON and sends it
    res.json({ captions });

  } catch (error) {
    // If anything unexpected goes wrong, send a 500 error
    console.error('Server error:', error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});


// --- STEP 4: Catch-all route ---
// If someone visits any URL that isn't /api/..., serve index.html
// This is needed for single-page apps
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- STEP 5: Start the server ---
// process.env.PORT is set by Render automatically in production
// We fall back to 3000 for local development
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
  ✅ CaptionAI server is running!
  📍 Local:   http://localhost:${PORT}
  🔑 API Key: ${process.env.GEMINI_API_KEY ? 'Loaded ✓' : 'NOT FOUND ✗'}
  `);
});