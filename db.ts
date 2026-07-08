import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, products, nutritionData, pdfLabelCache, type InsertProduct, type InsertNutritionData, type InsertPdfLabelCache } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Product operations
export async function createProductWithNutrition(
  product: InsertProduct,
  nutrition: InsertNutritionData
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    const result = await db.insert(products).values(product);
    const productId = (result as any)[0]?.insertId || 0;

    await db.insert(nutritionData).values({
      ...nutrition,
      productId: Number(productId),
    } as any);

    return productId;
  } catch (error) {
    console.error("[Database] Failed to create product with nutrition:", error);
    throw error;
  }
}

export async function upsertProductWithNutrition(
  product: InsertProduct,
  nutrition: InsertNutritionData
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    // Check if product with this code already exists
    if (!product.productCode) {
      throw new Error("Product code is required for upsert");
    }
    const existingProduct = await getProductByCode(product.productCode);
    
    if (existingProduct) {
      // Update existing product
      await db.update(products).set(product).where(eq(products.id, existingProduct.id));
      
      // Update nutrition data
      const existingNutrition = await getNutritionByProductId(existingProduct.id);
      if (existingNutrition) {
        await db.update(nutritionData).set(nutrition).where(eq(nutritionData.id, existingNutrition.id));
      } else {
        // Insert nutrition data if it doesn't exist
        await db.insert(nutritionData).values({
          ...nutrition,
          productId: existingProduct.id,
        } as any);
      }
      
      return existingProduct.id;
    } else {
      // Insert new product
      const result = await db.insert(products).values(product);
      const productId = (result as any)[0]?.insertId || 0;

      await db.insert(nutritionData).values({
        ...nutrition,
        productId: Number(productId),
      } as any);

      return productId;
    }
  } catch (error) {
    console.error("[Database] Failed to upsert product with nutrition:", error);
    throw error;
  }
}

export async function getAllProducts() {
  const db = await getDb();
  if (!db) {
    return [];
  }

  try {
    return await db.select().from(products);
  } catch (error) {
    console.error("[Database] Failed to get all products:", error);
    return [];
  }
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) {
    return null;
  }

  try {
    const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get product by id:", error);
    return null;
  }
}

export async function getProductByCode(productCode: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Database not available for getProductByCode");
    return null;
  }

  try {
    console.log(`[Database] Fetching product with code: ${productCode}`);
    const result = await db.select().from(products).where(eq(products.productCode, productCode)).limit(1);
    console.log(`[Database] Query result: ${result.length} products found`);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get product by code:", error);
    return null;
  }
}

export async function getNutritionByProductId(productId: number) {
  const db = await getDb();
  if (!db) {
    return null;
  }

  try {
    const result = await db.select().from(nutritionData).where(eq(nutritionData.productId, productId)).limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get nutrition data:", error);
    return null;
  }
}

export async function updateProduct(id: number, updates: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.update(products).set(updates).where(eq(products.id, id));
  } catch (error) {
    console.error("[Database] Failed to update product:", error);
    throw error;
  }
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.delete(products).where(eq(products.id, id));
  } catch (error) {
    console.error("[Database] Failed to delete product:", error);
    throw error;
  }
}

export async function updateNutritionData(id: number, updates: Partial<InsertNutritionData>) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.update(nutritionData).set(updates).where(eq(nutritionData.id, id));
  } catch (error) {
    console.error("[Database] Failed to update nutrition data:", error);
    throw error;
  }
}

// PDF Label Cache functions
export async function getPdfLabelCache(productId: number) {
  const db = await getDb();
  if (!db) {
    return null;
  }

  try {
    const result = await db.select().from(pdfLabelCache).where(eq(pdfLabelCache.productId, productId)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get PDF cache:", error);
    return null;
  }
}

export async function savePdfLabelCache(productId: number, pdfBase64: string, dataHash: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    console.log(`[Database] Attempting to save PDF cache for product ${productId}`);
    
    // Try to update first, if no rows affected, insert
    const updateResult = await db.update(pdfLabelCache)
      .set({ pdfBase64, dataHash, updatedAt: new Date() })
      .where(eq(pdfLabelCache.productId, productId));
    
    console.log(`[Database] Update result type:`, typeof updateResult, `value:`, updateResult);
    
    // Check if update affected any rows
    const affectedRows = (updateResult as any).rowsAffected || (updateResult as any).changes || 0;
    console.log(`[Database] Rows affected by update: ${affectedRows}`);
    
    // If no rows were updated, insert a new record
    if (affectedRows === 0) {
      console.log(`[Database] No rows updated, inserting new record for product ${productId}`);
      const insertResult = await db.insert(pdfLabelCache).values({
        productId,
        pdfBase64,
        dataHash,
      });
      console.log(`[Database] Insert completed for product ${productId}`);
    } else {
      console.log(`[Database] Updated existing cache for product ${productId}`);
    }
  } catch (error) {
    console.error("[Database] Failed to save PDF cache:", error);
    throw error;
  }
}

export async function invalidatePdfLabelCache(productId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.delete(pdfLabelCache).where(eq(pdfLabelCache.productId, productId));
  } catch (error) {
    console.error("[Database] Failed to invalidate PDF cache:", error);
    throw error;
  }
}
