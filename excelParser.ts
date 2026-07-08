import * as XLSX from 'xlsx';
import type { Product, NutritionData } from '../drizzle/schema';

/**
 * Parse Excel file and extract product and nutrition data
 * Expected format:
 * Row 4: First product data
 * Row 5: Second product data
 * Columns: A-O (Product info), P-AG (Nutrition info)
 */
export interface ParsedProductData {
  product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
  nutrition: Omit<NutritionData, 'id' | 'productId' | 'createdAt' | 'updatedAt'>;
}

export async function parseExcelFile(fileBuffer: Buffer): Promise<{
  products: ParsedProductData[];
  errors: string[];
}> {
  const errors: string[] = [];
  const products: ParsedProductData[] = [];

  try {
    // Read Excel file
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    if (!worksheet) {
      errors.push('No worksheet found in Excel file');
      return { products, errors };
    }

    // Get all rows as arrays
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Parse each data row (starting from row 4, which is index 3)
    // Skip header rows (rows 1-3: empty, headers, units)
    const startRow = rows.length > 3 ? 3 : 0;
    for (let rowIndex = startRow; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];

      if (!row || row.length === 0) continue;
      
      // Skip if this looks like a header row (contains text like "Brand", "Page ID")
      if (row[0] === 'Brand' || row[0] === 'brand') continue;

      try {
        const parsedData = parseExcelRow(row, rowIndex + 1);
        if (parsedData) {
          products.push(parsedData);
        }
      } catch (error) {
        errors.push(`Row ${rowIndex + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (products.length === 0 && errors.length === 0) {
      errors.push('No valid product data found in Excel file');
    }
  } catch (error) {
    errors.push(`Excel parsing error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { products, errors };
}

/**
 * Parse a single row from Excel
 */
function parseExcelRow(row: any[], rowNumber: number): ParsedProductData | null {
  // Extract product information from columns A-O (indices 0-14)
  const brand = String(row[0] || '').trim();
  const pageId = String(row[1] || '').trim();
  const productName = String(row[2] || '').trim();
  const ingredients = String(row[3] || '').trim();
  const netWeight = String(row[4] || '').trim();
  const storageLife = String(row[5] || '').trim(); // F行: 保存期限
  const storageInstructions = String(row[6] || '').trim(); // G行: 保存方式
  const expiryDateDisplay = String(row[7] || '').trim(); // H行: 有效期顯示文本
  const expiryDateType = String(row[7] || '').trim().toLowerCase();
  const expiryDate = parseDate(String(row[7] || '').trim());
  const manufacturerName = String(row[8] || '').trim(); // I行: 製造商
  const manufacturerAddress = String(row[9] || '').trim(); // J行: 地址
  const manufacturerPhone = String(row[10] || '').trim(); // K行: 電話
  const countryOfOrigin = String(row[11] || '').trim(); // L行: 原產地
  const allergenInfo = String(row[12] || '').trim(); // M行: 過敏原資訊
  const vegetarianStatus = String(row[13] || '').trim(); // N行: 葷素
  const precautions = String(row[14] || '').trim(); // O行: 注意事項

  // Validate required fields
  if (!pageId || !productName) {
    throw new Error('Page ID and Product Name are required');
  }

  // Generate product code from pageId only
  const productCode = pageId;

  // Extract nutrition information
  // P行(索引 15): 每一份量
  // Q行(索引 16): 本包裝含数
  // R行(索引 17): 熱量/每一份量
  // S行(索引 18): 蛋白質/每一份量
  // T行(索引 19): 脂肪/每一份量
  // U行(索引 20): 飽和脂肪/每一份量
  // V行(索引 21): 反式脂肪/每一份量
  // W行(索引 22): 碩水化合物/每一份量
  // X行(索引 23): 糖/每一份量
  // Y行(索引 24): 鸛/每一份量
  // Z行(索引 25): 熱量/每100g
  // AA行(索引 26): 蛋白質/每100g
  // AB行(索引 27): 脂肪/每100g
  // AC行(索引 28): 飽和脂肪/每100g
  const servingSize = String(row[15] || '').trim(); // P行
  const servingsPerPackage = parseDecimal(row[16]); // Q行

  // Per Serving Nutrition
  const energyKcalPerServing = parseDecimal(row[17]); // R行
  const energyKjPerServing = parseDecimal(row[17]); // R行 (kJ 不有子欄，暅時使用相同值)
  const proteinPerServing = parseDecimal(row[18]); // S行
  const totalFatPerServing = parseDecimal(row[19]); // T行
  const saturatedFatPerServing = parseDecimal(row[20]); // U行
  const transFatPerServing = parseDecimal(row[21]); // V行
  const carbohydratesPerServing = parseDecimal(row[22]); // W行
  const sugarsPerServing = parseDecimal(row[23]); // X行
  const sodiumPerServing = parseDecimal(row[24]); // Y行

  // Per 100g Nutrition
  // Z行(索引 25): 熱量/每100g
  // AA行(索引 26): 蛋白質/每100g
  // AB行(索引 27): 脂肪/每100g
  // AC行(索引 28): 飽和脂肪/每100g
  // AD行(索引 29): 反式脂肪/每100g
  // AE行(索引 30): 碩水化合物/每100g
  // AF行(索引 31): 糖/每100g
  // AG行(索引 32): 鸛/每100g
  const energyKcalPer100g = parseDecimal(row[25]); // Z行
  const energyKjPer100g = parseDecimal(row[25]); // Z行 (kJ 不有子欄，暅時使用相同值)
  const proteinPer100g = parseDecimal(row[26]); // AA行
  const totalFatPer100g = parseDecimal(row[27]); // AB行
  const saturatedFatPer100g = parseDecimal(row[28]); // AC行
  const transFatPer100g = parseDecimal(row[29]); // AD行
  const carbohydratesPer100g = parseDecimal(row[30]); // AE行
  const sugarsPer100g = parseDecimal(row[31]); // AF行
  const sodiumPer100g = parseDecimal(row[32]); // AG行

  const product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
    brand,
    pageId: pageId || null,
    productName,
    ingredients: ingredients || null,
    netWeight: netWeight || null,
    storageLife: storageLife || null,
    storageInstructions: storageInstructions || null,
    expiryDateType: (expiryDateType === 'use_by' || expiryDateType === 'best_before')
      ? (expiryDateType as 'use_by' | 'best_before')
      : null,
    expiryDate: expiryDate || null,
    expiryDateDisplay: expiryDateDisplay || null,
    manufacturerName: manufacturerName || null,
    manufacturerAddress: manufacturerAddress || null,
    manufacturerPhone: manufacturerPhone || null,
    countryOfOrigin: countryOfOrigin || null,
    allergenInfo: allergenInfo || null,
    vegetarianStatus: vegetarianStatus || null,
    precautions: precautions || null,
    productCode,
  };

  const nutrition: Omit<NutritionData, 'id' | 'productId' | 'createdAt' | 'updatedAt'> = {
    servingSize: servingSize || null,
    servingsPerPackage: servingsPerPackage as any,
    energyKcalPerServing: energyKcalPerServing as any,
    energyKjPerServing: energyKjPerServing as any,
    proteinPerServing: proteinPerServing as any,
    totalFatPerServing: totalFatPerServing as any,
    saturatedFatPerServing: saturatedFatPerServing as any,
    transFatPerServing: transFatPerServing as any,
    carbohydratesPerServing: carbohydratesPerServing as any,
    sugarsPerServing: sugarsPerServing as any,
    sodiumPerServing: sodiumPerServing as any,
    energyKcalPer100g: energyKcalPer100g as any,
    energyKjPer100g: energyKjPer100g as any,
    proteinPer100g: proteinPer100g as any,
    totalFatPer100g: totalFatPer100g as any,
    saturatedFatPer100g: saturatedFatPer100g as any,
    transFatPer100g: transFatPer100g as any,
    carbohydratesPer100g: carbohydratesPer100g as any,
    sugarsPer100g: sugarsPer100g as any,
    sodiumPer100g: sodiumPer100g as any,
  };

  return { product, nutrition };
}

/**
 * Parse date string in various formats
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Try to parse as YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse as YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) {
    return dateStr.replace(/\//g, '-');
  }

  // Try to parse as MM/DD/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const parts = dateStr.split('/');
    return `${parts[2]}-${parts[0]}-${parts[1]}`;
  }

  return null;
}

/**
 * Parse decimal value from cell
 */
function parseDecimal(value: any): number | null {
  if (!value || value === '') return null;

  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(num) ? null : num;
}
