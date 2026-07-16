const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// ─── Logging ───
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── Proxy: Hugging Face Inference API ───
app.all('/api/hf/*', async (req, res) => {
  try {
    const modelPath = req.params[0] || '';
    const targetUrl = `https://api-inference.huggingface.co/models/${modelPath}`;
    
    console.log(`→ Proxying to: ${targetUrl}`);

    const headers = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Authorization': req.headers.authorization || '',
    };

    // Remove host, origin, referer to avoid issues
    delete headers.host;
    delete headers.origin;
    delete headers.referer;

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    
    const contentType = response.headers.get('content-type') || '';
    let data;

    if (contentType.includes('image') || contentType.includes('audio') || contentType.includes('octet-stream')) {
      // Binary response (image, audio, etc.)
      const buffer = await response.buffer();
      res.set('Content-Type', contentType);
      res.send(buffer);
      return;
    } else {
      // JSON response
      data = await response.text();
      try {
        data = JSON.parse(data);
      } catch (e) {
        // Keep as text if not JSON
      }
    }

    res.status(response.status);
    res.set('Content-Type', contentType);
    res.send(data);
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Proxy: Hugging Face Hub API ───
app.all('/api/hub/*', async (req, res) => {
  try {
    const path = req.params[0] || '';
    const targetUrl = `https://huggingface.co/api/${path}`;
    
    console.log(`→ Proxying hub request to: ${targetUrl}`);

    const headers = {
      'Authorization': req.headers.authorization || '',
    };

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();

    res.status(response.status);
    res.json(data);
  } catch (error) {
    console.error('❌ Hub proxy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Serve index.html ───
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start Server ───
app.listen(PORT, () => {
  console.log(`🚀 FreeAI Proxy Server running at http://localhost:${PORT}`);
  console.log(`📡 Proxying HF Inference → /api/hf/*`);
  console.log(`📡 Proxying HF Hub → /api/hub/*`);
  console.log(`✅ Ready to accept connections`);
});
