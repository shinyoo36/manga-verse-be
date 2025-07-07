require("dotenv").config()

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const Bottleneck = require("bottleneck");
const axiosRetry = require("axios-retry").default;

const path = require("path");
const sharp = require('sharp');

app.use(cors({
    origin: ["http://localhost:3000", "https://mangaverseread.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], 
    allowedHeaders: ["Content-Type"]
}));


mongoose.connect(process.env.DATABASE_URL)

const db = mongoose.connection
db.on('error', (error) => console.error(error))
db.once('open', () => console.log("Connected to DB"))

app.use(express.json())
app.use(express.urlencoded({ extended: true }));

const usersRouter= require("./routes/users")
app.use("/api/users", usersRouter)


const { HttpsProxyAgent } = require("https-proxy-agent");

const proxies = [
    "http://vdpckfrg:wj454qohfn4m@38.154.227.167:5868", 
    "http://inabfjpy:jh36nyilfewz@38.154.227.167:5868", 
    "http://xkhsgjnr:o05q99j7ymm3@38.154.227.167:5868", 
    
    "http://vdpckfrg:wj454qohfn4m@38.154.227.167:5868", 
    "http://isxbkqzr:8wcntcfy44z4@38.154.227.167:5868", 
    "http://oixmjtox:g1j49om4psjl@38.154.227.167:5868", 
    "http://kicobbpa:tay938inwtj8@38.154.227.167:5868", 
];

const getRandomProxy = () => {
    const randomIndex = Math.floor(Math.random() * proxies.length);
    return new HttpsProxyAgent(proxies[randomIndex]);
};

const MANGADEX_API_URL = "https://api.mangadex.org";
const MANGADEX_IMAGE_URL = "https://uploads.mangadex.org";


const limiter = new Bottleneck({
    maxConcurrent: 5,
    minTime: 200, 
});


const axiosInstance = axios.create({
    timeout: 60000,
    httpsAgent: getRandomProxy(),
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
});

axiosRetry(axios, {
    retries: 3,
    retryDelay: (retryCount) => {
        console.log(`Retry attempt ${retryCount}`);
        return retryCount * 1000; // 1s, 2s, 3s exponential backoff
    },
    retryCondition: (error) => {
        return error.response?.status >= 500 || !error.response; // Retry on 5xx errors or no response
    },
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

async function fetchMangaDexData() {

    const currentDate = new Date();
    currentDate.setMonth(currentDate.getMonth() - 1 );
    const formattedDate = currentDate.toISOString().split('.')[0];

    const params = {
        includes: ["cover_art", "artist", "author"],
        "order[followedCount]": "desc",
        "contentRating": ["safe", "suggestive"],
        hasAvailableChapters: true,
        createdAtSince: formattedDate
    };

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}/manga?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// Manga top new title
app.get("/api/manga/top", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    try {
        const data = await fetchMangaDexData();
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

async function searchManga(title) {

    const params = {
        title: title,
        limit: 10,
        includes: ["cover_art"],
        "order[relevance]": "desc",
        "order[followedCount]": "desc",
        "contentRating": ["safe", "suggestive"],
        hasAvailableChapters: true,
    };

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}/manga?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// Manga Search
app.get("/api/manga/search/:title", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const { title } = req.params
    try {
        const data = await searchManga(title);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

async function fetchLatestUpdates(limit, offset) {
    const params = {
        includes: ["scanlation_group"],
        "translatedLanguage": ["en"],
        "contentRating": ["safe", "suggestive"],
        "order[readableAt]": "desc",
        limit: limit,
    };

    if (offset !== undefined) {
        params.offset = offset;
    }

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}/chapter?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Failed to fetch and compress manga cover:", error.message);
        throw error;
    }
}

// Manga Latest
app.get("/api/manga/latest/:limit/:offset", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");  // Allow all origins
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    try {
        const limit = parseInt(req.params.limit, 10);
        const offset = req.params.offset ? parseInt(req.params.offset, 10) : undefined; 

        const data = await fetchLatestUpdates(limit, offset);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

async function fetchMostFollowed(limit, offset) {
    const params = {
        includes: ["cover_art"],
        "contentRating": ["safe", "suggestive"],
        "order[followedCount]": "desc",
        limit: limit,
    };

    if (offset !== undefined) {
        params.offset = offset;
    }

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}/manga?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Failed to fetch and compress manga cover:", error.message);
        throw error;
    }
}

// Most Followed
app.get("/api/manga/mostfollowed/:limit/:offset", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    try {
        const limit = parseInt(req.params.limit, 10);
        const offset = req.params.offset ? parseInt(req.params.offset, 10) : undefined; 

        const data = await fetchMostFollowed(limit, offset);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

async function fetchHighestRating(limit, offset) {
    const params = {
        includes: ["cover_art"],
        "contentRating": ["safe", "suggestive"],
        "order[rating]": "desc",
        limit: limit,
    };

    if (offset !== undefined) {
        params.offset = offset;
    }

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}/manga?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Failed to fetch and compress manga cover:", error.message);
        throw error;
    }
}

// Most Followed
app.get("/api/manga/highestrating/:limit/:offset", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    try {
        const limit = parseInt(req.params.limit, 10);
        const offset = req.params.offset ? parseInt(req.params.offset, 10) : undefined; 

        const data = await fetchHighestRating(limit, offset);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

async function fetchLatestUpdatesMangaIds(ids) {
    const params = {
        ids: ids.map(id => id), 
        limit: 24,
        includes: ["cover_art"],
        "contentRating": ["safe", "suggestive"],
    };

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}/manga?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// Manga Latest Full
app.get("/api/manga/latest/data", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");  // Allow all origins
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    try {
        let ids = req.query.ids;

        if (!ids) {
            return res.status(400).json({ error: "No IDs provided" });
        }

        if (!Array.isArray(ids)) {
            ids = [ids]; 
        }

        const data = await fetchLatestUpdatesMangaIds(ids);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

//Image
app.get("/api/manga/cover/:id/:fileName/:size", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");

    const { id, fileName, size } = req.params;
    const validSizes = ["256", "512", "hd"];

    if (!validSizes.includes(size)) {
        return res.status(400).json({ error: "Invalid size parameter. Use 256, 512, or hd." });
    }

    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex === -1) {
        return res.status(400).json({ error: "Invalid file name format. Missing extension." });
    }


    const imageUrl = size === "hd"
        ? `${MANGADEX_IMAGE_URL}/covers/${id}/${fileName}`
        : `${MANGADEX_IMAGE_URL}/covers/${id}/${fileName}.${size}.jpg`;

    console.log("imageUrl", imageUrl);

    try {
        const response = await axiosInstance.get(imageUrl, { responseType: "stream" });

        response.data.pipe(res);
    } catch (error) {
        console.error("Failed to fetch manga cover:", error.message);
        res.status(500).sendFile("/fallback-image.jpg", { root: "./public" });
    }
});

async function fetchMangaDetail(id) {

    const params = {
        includes: ["cover_art", "artist", "author"],
    };

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}/manga/${id}?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// Manga detail id
app.get("/api/manga/:id", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const { id } = req.params;

    try {
        const data = await fetchMangaDetail(id);
        res.json({ status: 200, data }); 
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});


async function fetchMangaChapter(id, offset) {

    const params = {
        "limit" : "500",
        "offset" : offset,
        includes: ["scanlation_group", "user"],
        "translatedLanguage": ["en"],
        "order[volume]": "desc",
        "order[chapter]": "desc",
        "contentRating": ["safe", "suggestive"],
    };

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}/manga/${id}/feed?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// Chapter Feed
app.get("/api/manga/chapter/:id/:offset", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const { id, offset } = req.params;

    try {
        const data = await fetchMangaChapter(id, offset);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

async function fetchMangaChapterLimit(id) {

    const params = {
        "limit" : "5",
        includes: ["scanlation_group", "user"],
        "order[volume]": "desc",
        "order[chapter]": "desc",
        "contentRating": ["safe", "suggestive"],
    };

    const queryString = buildQueryParams(params);
    const url = `${MANGADEX_API_URL}/manga/${id}/feed?${queryString}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// Chapter Limit
app.get("/api/manga/chapter/limit/:id", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const { id } = req.params;

    try {
        const data = await fetchMangaChapterLimit(id);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

async function fetchMangaStat(id) {

    const url = `${MANGADEX_API_URL}/statistics/manga/${id}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

// Manga Stat
app.get("/api/manga/stat/:id", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const { id } = req.params;

    try {
        const data = await fetchMangaStat(id);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

async function fetchMangaStats(ids) {

    const url = `${MANGADEX_API_URL}/statistics/manga?` + 
        ids.map(id => `manga[]=${id}`).join("&");

    console.log("Requesting URL:", url);

    
    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

// Manga Stats ids
app.get("/api/manga/stat-ids/:ids", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const ids = req.params.ids.split(",");

    try {
        const data = await fetchMangaStats(ids);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

async function fetchChapterDetail(id) {

    const url = `${MANGADEX_API_URL}/at-home/server/${id}`;

    console.log("Requesting URL:", url);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

// Chapter Detail
app.get("/api/chapter/details/:id", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const { id } = req.params;

    try {
        const data = await fetchChapterDetail(id);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});

//Chapter Image
app.get("/api/chapter/image/:hash/:fileName", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    res.setHeader("Cache-Control", "public, max-age=86400");

    const { hash, fileName } = req.params;
    const { baseUrl } = req.query; // Extract baseUrl from query parameters

    if (!baseUrl) {
        return res.status(400).json({ error: "baseUrl is required" });
    }

    const imageUrl = `${baseUrl}/data/${hash}/${fileName}`;
    console.log("imageUrl", imageUrl);

    try {
        const response = await axiosInstance.get(imageUrl, { responseType: "stream" });

        res.setHeader("Content-Type", response.headers["content-type"]);
        response.data.pipe(res);
    } catch (error) {
        console.error("Failed to fetch manga cover:", error.message);
        res.status(500).sendFile("/fallback-image.jpg", { root: "./public" });
    }
});

async function searchMangaFull(reqParams) {
    const defaultParams = {
        includes: ["cover_art", "artist", "author"], // Add default includes
        "contentRating": ["safe", "suggestive"],
        hasAvailableChapters: true,
    };

    const queryString = new URLSearchParams();

    Object.entries({ ...defaultParams, ...reqParams }).forEach(([key, value]) => {
        if (typeof value === "object" && value !== null) {
            // Handle nested objects (e.g., order: { followedCount: "desc" })
            Object.entries(value).forEach(([nestedKey, nestedValue]) => {
                queryString.append(`${key}[${nestedKey}]`, nestedValue);
            });
        } else {
            queryString.append(key, value);
        }
    });
    const url = `${MANGADEX_API_URL}/manga?${queryString}`;

    console.log("Requesting URL:", url);
    // console.log("queryString:", queryString);

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error("Axios Request Failed:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// Manga Search
app.get("/api/manga-search/search", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");


    try {
        const data = await searchMangaFull(req.query);
        res.json(data);
    } catch (error) {
        console.error("Error in full-search:", error);
        res.status(error.status || 500).json({ status: error.status || 500, error: "Failed to fetch MangaDex data" });
    }
});


// const PORT = 5000;
// app.listen(PORT, () => {
//     console.log(`Proxy server running on port ${PORT}`);
// });

module.exports = app;