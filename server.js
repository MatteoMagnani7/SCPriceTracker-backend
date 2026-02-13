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
      // Seleziona TUTTI gli elementi con questi attributi
      const priceElements = document.querySelectorAll(
        '[data-cy-id="price_unit__value"]',
      );
      const currencyElements = document.querySelectorAll(
        '[data-cy-id="price_unit__currency"]',
      );

      if (priceElements.length === 0) return null;

      // Crea un array di oggetti con prezzo numerico e valuta
      const prices = Array.from(priceElements).map((el, index) => {
        const priceText = el.innerText.trim();
        const currency = currencyElements[index]?.innerText.trim() || "";
        // Converte il prezzo in numero (rimuove virgole, spazi, ecc.)
        const numericPrice = parseFloat(priceText.replace(/[^0-9.]/g, ""));
        return {
          amount: priceText,
          currency: currency,
          numeric: numericPrice,
        };
      });

      // Filtra prezzi validi e trova il minimo
      const validPrices = prices.filter((p) => !isNaN(p.numeric));
      if (validPrices.length === 0) return null;

      const minPrice = validPrices.reduce((min, current) =>
        current.numeric < min.numeric ? current : min,
      );

      return `${minPrice.amount} ${minPrice.currency}`;
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
      console.log(`Successo: Prezzo minimo trovato ${result}`);
    }
  } catch (error) {
    console.error("Errore durante lo scraping pianificato:", error.message);
  } finally {
    if (browser) await browser.close();
  }
};

cron.schedule(
  "49 18 * * *",
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
