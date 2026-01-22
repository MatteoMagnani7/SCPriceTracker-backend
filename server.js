import express from "express";
import puppeteer from "puppeteer";
import cors from "cors";
import fs from "fs";
import cron from "node-cron";

const app = express();
app.use(cors());

const PORT = 3001;
const DATA_PATH = "./prices.json";
const TARGET_URL =
  "https://robertsspaceindustries.com/en/store/pledge/browse/game-packages?sort=weight&direction=desc";

const getStoredData = () => {
  if (!fs.existsSync(DATA_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH));
  } catch (e) {
    return [];
  }
};

const performScrape = async () => {
  console.log(`[${new Date().toLocaleString()}] Avvio scraping automatico...`);
  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    );
    await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-cy-id="price_unit__value"]', {
      timeout: 15000,
    });

    const result = await page.evaluate(() => {
      const amount = document.querySelector(
        '[data-cy-id="price_unit__value"]',
      )?.innerText;
      const currency = document.querySelector(
        '[data-cy-id="price_unit__currency"]',
      )?.innerText;
      return amount && currency ? `${amount} ${currency}` : null;
    });

    if (result) {
      const history = getStoredData();
      const newEntry = {
        id: Date.now(),
        date: new Date().toLocaleString("it-IT"),
        price: result,
      };
      fs.writeFileSync(
        DATA_PATH,
        JSON.stringify([newEntry, ...history].slice(0, 100), null, 2),
      );
      console.log(`Successo: Prezzo attuale ${result}`);
    }
  } catch (error) {
    console.error("Errore durante lo scraping pianificato:", error.message);
  } finally {
    if (browser) await browser.close();
  }
};

// Pianificazione: '0 18 * * *' significa Minuto 0, Ora 18, Ogni giorno
cron.schedule(
  "0 15 * * *",
  () => {
    performScrape();
  },
  {
    scheduled: true,
    timezone: "Europe/Rome",
  },
);

app.get("/api/prices", (req, res) => res.json(getStoredData()));

app.get("/api/scrape", async (req, res) => {
  await performScrape();
  res.json(getStoredData());
});

app.listen(PORT, () => {
  console.log(`Backend in ascolto su http://localhost:${PORT}`);
  console.log("Monitoraggio prezzi pianificato per le 15:00 ogni giorno.");
});
