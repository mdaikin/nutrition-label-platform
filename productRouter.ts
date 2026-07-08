import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { Buffer } from "buffer";
import { parseExcelFile } from "./excelParser";
import { generateNutritionLabel, generateDataHash, generateLabelJPG } from "./pdfGenerator";
import {
  createProductWithNutrition,
  upsertProductWithNutrition,
  getAllProducts,
  getProductById,
  getProductByCode,
  getNutritionByProductId,
  updateProduct,
  deleteProduct,
  updateNutritionData,
  getPdfLabelCache,
  savePdfLabelCache,
} from "./db";

export const productRouter = router({
  // Get all products
  list: publicProcedure.query(async () => {
    return await getAllProducts();
  }),

  // Get product by ID with nutrition data
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const product = await getProductById(input.id);
      if (!product) return null;

      const nutrition = await getNutritionByProductId(input.id);
      return { product, nutrition };
    }),

  // Get product by code with nutrition data
  getByCode: publicProcedure
    .input(z.object({ productCode: z.string() }))
    .query(async ({ input }) => {
      const product = await getProductByCode(input.productCode);
      if (!product) return null;

      const nutrition = await getNutritionByProductId(product.id);
      // Convert string values to numbers for nutrition data
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
      } : null;
      return { product, nutrition: normalizedNutrition };
    }),

  // Import products from Excel file
  importExcel: protectedProcedure
    .input(
      z.object({
        // Preferred: base64-encoded file content (reliable across tRPC/superjson)
        fileBase64: z.string().optional(),
        // Legacy: raw buffer / Uint8Array / array (kept for backward compatibility)
        fileBuffer: z.any().optional(),
        fileName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Normalize the incoming file payload into a real Node Buffer
        let buffer: Buffer;
        if (input.fileBase64) {
          buffer = Buffer.from(input.fileBase64, "base64");
        } else if (input.fileBuffer) {
          const fb: any = input.fileBuffer;
          if (Buffer.isBuffer(fb)) {
            buffer = fb;
          } else if (fb instanceof Uint8Array) {
            buffer = Buffer.from(fb);
          } else if (Array.isArray(fb)) {
            buffer = Buffer.from(fb);
          } else if (fb && typeof fb === "object") {
            // superjson may serialize a Uint8Array into a plain object {0:.., 1:..}
            buffer = Buffer.from(Object.values(fb) as number[]);
          } else {
            buffer = Buffer.from(fb);
          }
        } else {
          return {
            success: false,
            message: "No file content received",
            importedCount: 0,
            errors: ["No file content received"],
          };
        }

        const { products, errors } = await parseExcelFile(buffer);

        if (errors.length > 0) {
          return {
            success: false,
            message: `Import failed with errors: ${errors.join("; ")}`,
            importedCount: 0,
            errors,
          };
        }

        let importedCount = 0;
        const importErrors: string[] = [];

        for (const { product, nutrition } of products) {
          try {
            await upsertProductWithNutrition(product, nutrition as any);
            importedCount++;
          } catch (error) {
            importErrors.push(
              `Failed to import product ${product.productCode}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        return {
          success: importErrors.length === 0,
          message: `Imported ${importedCount} products${
            importErrors.length > 0 ? ` with ${importErrors.length} errors` : ""
          }`,
          importedCount,
          errors: importErrors,
        };
      } catch (error) {
        return {
          success: false,
          message: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
          importedCount: 0,
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }
    }),

  // Update product
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.record(z.string(), z.any()),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await updateProduct(input.id, input.data as any);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }),

  // Delete product
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await deleteProduct(input.id);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }),

  // Generate JPG label
  generateLabelJpg: publicProcedure
    .input(z.object({ productCode: z.string() }))
    .mutation(async ({ input }) => {
      const product = await getProductByCode(input.productCode);
      if (!product) {
        throw new Error(`Product not found: ${input.productCode}`);
      }

      const nutrition = await getNutritionByProductId(product.id);
      // Convert string values to numbers for nutrition data
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
      try {
        // Generate JPG
        const jpgBytes = await generateLabelJPG({ product, nutrition: normalizedNutrition });
        const jpgBase64 = Buffer.from(jpgBytes).toString('base64');
        
        return {
          success: true,
          jpgBase64,
          fileName: `${product.productCode}_label.jpg`,
        };
      } catch (error) {
        throw new Error(`Failed to generate JPG label: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),

  // Generate PDF label
  generateLabel: publicProcedure
    .input(z.object({ productCode: z.string() }))
    .mutation(async ({ input }) => {
      const product = await getProductByCode(input.productCode);
      if (!product) {
        throw new Error(`Product not found: ${input.productCode}`);
      }

      const nutrition = await getNutritionByProductId(product.id);
      // Convert string values to numbers for nutrition data
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
      try {
        // Generate data hash for cache validation
        const dataHash = generateDataHash({ product, nutrition: normalizedNutrition });
        console.log(`[PDF Cache] Generated dataHash for product ${product.id}: ${dataHash}`);
        
        // Check if cached PDF exists and is still valid
        const cachedLabel = await getPdfLabelCache(product.id);
        console.log(`[PDF Cache] Cached label found: ${cachedLabel ? 'yes' : 'no'}`);
        
        if (cachedLabel && cachedLabel.dataHash === dataHash) {
          // Return cached PDF
          console.log(`[PDF Cache] Using cached PDF for product ${product.id}`);
          return {
            success: true,
            pdfBase64: cachedLabel.pdfBase64,
            fileName: `${product.productCode}_label.pdf`,
            fromCache: true,
          };
        }
        
        console.log(`[PDF Cache] Generating new PDF for product ${product.id}...`);
        // Generate new PDF if not cached or data changed
        const pdfBytes = await generateNutritionLabel({ product, nutrition: normalizedNutrition });
        const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
        console.log(`[PDF Cache] PDF generated, size: ${pdfBase64.length} bytes`);
        
        // Save to cache
        try {
          console.log(`[PDF Cache] Saving cache for product ${product.id}...`);
          await savePdfLabelCache(product.id, pdfBase64, dataHash);
          console.log(`[PDF Cache] Cache saved successfully for product ${product.id}`);
        } catch (cacheError) {
          console.warn('[PDF Cache] Failed to save cache:', cacheError);
          // Don't fail the request if caching fails
        }
        
        return {
          success: true,
          pdfBase64,
          fileName: `${product.productCode}_label.pdf`,
          fromCache: false,
        };
      } catch (error) {
        throw new Error(`Failed to generate label: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),

  // Nutrition sub-router
  nutrition: router({
    // Update nutrition data
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ input }) => {
        try {
          await updateNutritionData(input.id, input.data as any);
          return { success: true };
        } catch (error) {
          throw new Error(
            error instanceof Error ? error.message : String(error)
          );
        }
      }),

    // Delete product (by productId)
    delete: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .mutation(async ({ input }) => {
        try {
          await deleteProduct(input.productId);
          return { success: true };
        } catch (error) {
          throw new Error(
            error instanceof Error ? error.message : String(error)
          );
        }
      }),
  }),
});
