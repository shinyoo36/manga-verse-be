process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(cors());

const { HttpsProxyAgent } = require("https-proxy-agent");

const proxyAgent = new HttpsProxyAgent("http://brd-customer-hl_c11a24b2-zone-stiven_proxy:1nh707szm24s@brd.superproxy.io:33335");

const MANGADEX_API_URL = "https://api.mangadex.org/manga";

const limiter = rateLimit({
    windowMs: 1000, 
    max: 5, 
    message: { error: "Too many requests, slow down!" }
});

const axiosInstance = axios.create({
    timeout: 60000,
    httpsAgent: proxyAgent,
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
});


function buildQueryParams(params) {
    let queryString = Object.entries(params)
        .map(([key, value]) => {
            if (Array.isArray(value)) {
                return value.map(v => `${key}[]=${encodeURIComponent(v)}`).join("&");
            }
            return `${key}=${encodeURIComponent(value)}`;
        })
        .join("&");

    return queryString;
}

// Function to fetch MangaDex data
async function fetchMangaDexData() {
    const params = {
        includes: ["cover_art", "artist", "author"],
        "order[followedCount]": "desc",
        "contentRating": ["safe", "suggestive"],
        hasAvailableChapters: true,
        createdAtSince: "2025-01-25T17:00:00"
    };

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get('https://api.mangadex.org/manga?includes[]=cover_art&includes[]=artist&includes[]=author&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive&hasAvailableChapters=true&createdAtSince=2025-01-25T17%3A00%3A00');
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// Proxy endpoint
app.get("/api/manga", limiter, async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");  // Allow all origins
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    try {
        const data = await fetchMangaDexData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch MangaDex data" });
    }
});

// Start server
// const PORT = 5000;
// app.listen(PORT, () => {
//     console.log(`Proxy server running on port ${PORT}`);
// });

module.exports = app;