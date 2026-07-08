import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
// 已移除自定義列印中間件，改用 Chrome 原生列印功能

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // 已移除自定義列印中間件，改用 Chrome 原生列印功能
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  
  // JPG label download route
  app.get('/api/download-label-jpg/:productCode', async (req, res) => {
    try {
      const { productCode } = req.params;
      const { getProductByCode, getNutritionByProductId } = await import('../db');
      const { generateLabelJPG } = await import('../pdfGenerator');
      
      const product = await getProductByCode(productCode);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const nutrition = await getNutritionByProductId(product.id);
      const normalizedNutrition = nutrition ? {
        ...nutrition,
        energyKcalPerServing: nutrition.energyKcalPerServing ? Number(nutrition.energyKcalPerServing) : null,
        energyKjPerServing: nutrition.energyKjPerServing ? Number(nutrition.energyKjPerServing) : null,
        proteinPerServing: nutrition.proteinPerServing ? Number(nutrition.proteinPerServing) : null,
        totalFatPerServing: nutrition.totalFatPerServing ? Number(nutrition.totalFatPerServing) : null,
        saturatedFatPerServing: nutrition.saturatedFatPerServing ? Number(nutrition.saturatedFatPerServing) : null,
        transFatPerServing: nutrition.transFatPerServing ? Number(nutrition.transFatPerServing) : null,
        carbohydratesPerServing: nutrition.carbohydratesPerServing ? Number(nutrition.carbohydratesPerServing) : null,
        sugarsPerServing: nutrition.sugarsPerServing ? Number(nutrition.sugarsPerServing) : null,
        sodiumPerServing: nutrition.sodiumPerServing ? Number(nutrition.sodiumPerServing) : null,
        energyKcalPer100g: nutrition.energyKcalPer100g ? Number(nutrition.energyKcalPer100g) : null,
        energyKjPer100g: nutrition.energyKjPer100g ? Number(nutrition.energyKjPer100g) : null,
        proteinPer100g: nutrition.proteinPer100g ? Number(nutrition.proteinPer100g) : null,
        totalFatPer100g: nutrition.totalFatPer100g ? Number(nutrition.totalFatPer100g) : null,
        saturatedFatPer100g: nutrition.saturatedFatPer100g ? Number(nutrition.saturatedFatPer100g) : null,
        transFatPer100g: nutrition.transFatPer100g ? Number(nutrition.transFatPer100g) : null,
        carbohydratesPer100g: nutrition.carbohydratesPer100g ? Number(nutrition.carbohydratesPer100g) : null,
        sugarsPer100g: nutrition.sugarsPer100g ? Number(nutrition.sugarsPer100g) : null,
        sodiumPer100g: nutrition.sodiumPer100g ? Number(nutrition.sodiumPer100g) : null,
      } : undefined;
      
      const jpgBytes = await generateLabelJPG({ product, nutrition: normalizedNutrition });
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${product.productCode}_label.jpg"`);
      // Ensure we send binary data, not JSON
      if (Buffer.isBuffer(jpgBytes)) {
        res.end(jpgBytes);
      } else if (jpgBytes instanceof Uint8Array) {
        res.end(Buffer.from(jpgBytes));
      } else {
        res.end(Buffer.from(jpgBytes));
      }
    } catch (error) {
      console.error('JPG download error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate JPG' });
    }
  });
  
  // PDF label download route (80mm x 90mm portrait)
  app.get('/api/download-label-pdf/:productCode', async (req, res) => {
    try {
      const { productCode } = req.params;
      const { getProductByCode, getNutritionByProductId } = await import('../db');
      const { generateNutritionLabel } = await import('../pdfGenerator');
      
      const product = await getProductByCode(productCode);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const nutrition = await getNutritionByProductId(product.id);
      const normalizedNutrition = nutrition ? {
        ...nutrition,
        energyKcalPerServing: nutrition.energyKcalPerServing ? Number(nutrition.energyKcalPerServing) : null,
        energyKjPerServing: nutrition.energyKjPerServing ? Number(nutrition.energyKjPerServing) : null,
        proteinPerServing: nutrition.proteinPerServing ? Number(nutrition.proteinPerServing) : null,
        totalFatPerServing: nutrition.totalFatPerServing ? Number(nutrition.totalFatPerServing) : null,
        saturatedFatPerServing: nutrition.saturatedFatPerServing ? Number(nutrition.saturatedFatPerServing) : null,
        transFatPerServing: nutrition.transFatPerServing ? Number(nutrition.transFatPerServing) : null,
        carbohydratesPerServing: nutrition.carbohydratesPerServing ? Number(nutrition.carbohydratesPerServing) : null,
        sugarsPerServing: nutrition.sugarsPerServing ? Number(nutrition.sugarsPerServing) : null,
        sodiumPerServing: nutrition.sodiumPerServing ? Number(nutrition.sodiumPerServing) : null,
        energyKcalPer100g: nutrition.energyKcalPer100g ? Number(nutrition.energyKcalPer100g) : null,
        energyKjPer100g: nutrition.energyKjPer100g ? Number(nutrition.energyKjPer100g) : null,
        proteinPer100g: nutrition.proteinPer100g ? Number(nutrition.proteinPer100g) : null,
        totalFatPer100g: nutrition.totalFatPer100g ? Number(nutrition.totalFatPer100g) : null,
        saturatedFatPer100g: nutrition.saturatedFatPer100g ? Number(nutrition.saturatedFatPer100g) : null,
        transFatPer100g: nutrition.transFatPer100g ? Number(nutrition.transFatPer100g) : null,
        carbohydratesPer100g: nutrition.carbohydratesPer100g ? Number(nutrition.carbohydratesPer100g) : null,
        sugarsPer100g: nutrition.sugarsPer100g ? Number(nutrition.sugarsPer100g) : null,
        sodiumPer100g: nutrition.sodiumPer100g ? Number(nutrition.sodiumPer100g) : null,
      } : undefined;
      
      const pdfBytes = await generateNutritionLabel({ product, nutrition: normalizedNutrition });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${product.productCode}_label.pdf"`);
      if (Buffer.isBuffer(pdfBytes)) {
        res.end(pdfBytes);
      } else if (pdfBytes instanceof Uint8Array) {
        res.end(Buffer.from(pdfBytes));
      } else {
        res.end(Buffer.from(pdfBytes));
      }
    } catch (error) {
      console.error('PDF download error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate PDF' });
    }
  });
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
