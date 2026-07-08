import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import puppeteer from 'puppeteer';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import type { Product } from '../drizzle/schema';

export interface LabelData {
  product: Product;
  nutrition?: {
    servingSize?: string | null;
    servingsPerPackage?: string | number | null;
    energyKcalPerServing?: number | null;
    energyKjPerServing?: number | null;
    proteinPerServing?: number | null;
    totalFatPerServing?: number | null;
    saturatedFatPerServing?: number | null;
    transFatPerServing?: number | null;
    carbohydratesPerServing?: number | null;
    sugarsPerServing?: number | null;
    sodiumPerServing?: number | null;
    energyKcalPer100g?: number | null;
    energyKjPer100g?: number | null;
    proteinPer100g?: number | null;
    totalFatPer100g?: number | null;
    saturatedFatPer100g?: number | null;
    transFatPer100g?: number | null;
    carbohydratesPer100g?: number | null;
    sugarsPer100g?: number | null;
    sodiumPer100g?: number | null;
  };
}

/**
 * Generate a hash of product and nutrition data for cache validation
 */
export function generateDataHash(labelData: LabelData): string {
  const dataString = JSON.stringify({
    version: '2.0', // Increment version to invalidate old cache
    product: {
      id: labelData.product.id,
      brand: labelData.product.brand,
      productName: labelData.product.productName,
      ingredients: labelData.product.ingredients,
      netWeight: labelData.product.netWeight,
      storageInstructions: labelData.product.storageInstructions,
      expiryDateType: labelData.product.expiryDateType,
      expiryDate: labelData.product.expiryDate,
      expiryDateDisplay: labelData.product.expiryDateDisplay,
      manufacturerName: labelData.product.manufacturerName,
      manufacturerAddress: labelData.product.manufacturerAddress,
      manufacturerPhone: labelData.product.manufacturerPhone,
      countryOfOrigin: labelData.product.countryOfOrigin,
      allergenInfo: labelData.product.allergenInfo,
      vegetarianStatus: labelData.product.vegetarianStatus,
      precautions: labelData.product.precautions,
    },
    nutrition: labelData.nutrition,
  });
  return createHash('sha256').update(dataString).digest('hex');
}

/**
 * Generate Hong Kong nutrition label in 80mm x 60mm format using WeasyPrint
 * Layout: Left side - Product info, Right side - Nutrition table
 */
/**
 * Generate a JPG image of the nutrition label (80mm x 60mm)
 */
export async function generateLabelJPG(labelData: LabelData): Promise<Uint8Array> {
  const { product, nutrition } = labelData;
  
  // Generate HTML content
  const html = generateLabelHTML(product, nutrition);
  
  // Create temporary files
  const tmpDir = tmpdir();
  const htmlFile = join(tmpDir, `label-jpg-${Date.now()}.html`);
  
  let browser: any = null;
  
  try {
    // Write HTML to temporary file
    writeFileSync(htmlFile, html, 'utf-8');
    
    // Launch Puppeteer browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    
    // Set viewport to 800px width with flexible height for JPG download
    // 80mm x 90mm = 227px x 255px (at 72 DPI)
    await page.setViewport({
      width: 800,
      height: 900,
      deviceScaleFactor: 1,
    });
    
    // Load HTML file
    await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle0' });
    
    // Add CSS to scale the content to fill the viewport
    // Scale factor: 3.52 (800/227 to fill the 800px width)
    await page.addStyleTag({
      content: `
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: auto;
        }
        .container {
          transform: scale(3.52);
          transform-origin: top left;
          width: 227px;
          height: auto;
          min-height: 255px;
        }
      `
    });
    
    // Wait a bit for CSS to apply
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Take screenshot as JPG
    const jpgBuffer = await page.screenshot({
      type: 'jpeg',
      quality: 95,
      fullPage: true,
    });
    
    await page.close();
    
    return new Uint8Array(jpgBuffer as Buffer);
  } finally {
    // Close browser
    if (browser) {
      await browser.close();
    }
    
    // Clean up temporary files
    try {
      unlinkSync(htmlFile);
    } catch (e) {
      // Ignore
    }
  }
}

export async function generateNutritionLabel(labelData: LabelData): Promise<Uint8Array> {
  const { product, nutrition } = labelData;
  
  // Generate HTML content
  const html = generateLabelHTML(product, nutrition);
  
  // Create temporary files
  const tmpDir = tmpdir();
  const htmlFile = join(tmpDir, `label-${Date.now()}.html`);
  const pdfFile = join(tmpDir, `label-${Date.now()}.pdf`);
  
  try {
    // Write HTML to temporary file
    writeFileSync(htmlFile, html, 'utf-8');
    
    // Use WeasyPrint to convert HTML to PDF
    // 80mm x 90mm = 226.77 x 255.12 points
    const command = `python3 -m weasyprint "${htmlFile}" "${pdfFile}" 2>&1`;
    execSync(command, { encoding: 'utf-8' });
    
    // Read PDF file
    const pdfBuffer = readFileSync(pdfFile);
    return new Uint8Array(pdfBuffer);
  } finally {
    // Clean up temporary files
    try {
      unlinkSync(htmlFile);
    } catch (e) {
      // Ignore
    }
    try {
      unlinkSync(pdfFile);
    } catch (e) {
      // Ignore
    }
  }
}

function generateLabelHTML(product: Product, nutrition: any): string {
  // H行: 有效期資訊 (expiryDateDisplay 欄位)
  const expiryDateDisplay = product.expiryDateDisplay || '';
  
  // Nutrition data mapping
  const nutrients = [
    { label: '熱量', keyServing: 'energyKcalPerServing', key100g: 'energyKcalPer100g', unit: '千卡' },
    { label: '蛋白質', keyServing: 'proteinPerServing', key100g: 'proteinPer100g', unit: '克' },
    { label: '脂肪', keyServing: 'totalFatPerServing', key100g: 'totalFatPer100g', unit: '克' },
    { label: '飽和脂肪', keyServing: 'saturatedFatPerServing', key100g: 'saturatedFatPer100g', unit: '克' },
    { label: '反式脂肪', keyServing: 'transFatPerServing', key100g: 'transFatPer100g', unit: '克' },
    { label: '碳水化合物', keyServing: 'carbohydratesPerServing', key100g: 'carbohydratesPer100g', unit: '克' },
    { label: '糖', keyServing: 'sugarsPerServing', key100g: 'sugarsPer100g', unit: '克' },
    { label: '鈉', keyServing: 'sodiumPerServing', key100g: 'sodiumPer100g', unit: '毫克' },
  ];
  
  let nutritionRows = '';
  for (const nutrient of nutrients) {
    const valueServing = nutrition?.[nutrient.keyServing];
    const value100g = nutrition?.[nutrient.key100g];
    let servingText = valueServing !== null && valueServing !== undefined ? String(valueServing) : '-';
    let per100gText = value100g !== null && value100g !== undefined ? String(value100g) : '-';
    
    // Add unit for all nutrients
    if (servingText !== '-') servingText += ` ${nutrient.unit}`;
    if (per100gText !== '-') per100gText += ` ${nutrient.unit}`;
    
    nutritionRows += `
      <tr>
        <td class="nutrient-name">${nutrient.label}</td>
        <td class="nutrient-value">${servingText}</td>
        <td class="nutrient-value">${per100gText}</td>
      </tr>
    `;
  }
  
  // P行: 每一份量 (servingSize)
  const servingSize = nutrition?.servingSize || '';
  // Q行: 本包裝份數 (servingsPerPackage) - 只顯示整數
  const servingsPerPackageRaw = nutrition?.servingsPerPackage || '';
  const servingsPerPackage = servingsPerPackageRaw ? Math.floor(Number(servingsPerPackageRaw)) : '';
  // I行: 製造商名稱 (manufacturerName)
  const manufacturerName = product.manufacturerName || '';
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: 80mm 90mm;
      margin: 1mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans CJK TC', 'Noto Sans CJK HK', sans-serif;
      font-size: 5pt;
      line-height: 1.15;
      height: auto;
    }
    
    .container {
      display: flex;
      height: auto;
      border: 0.5pt solid #000;
    }
    
    .left-section {
      width: 55%;
      border-right: 0.5pt solid #000;
      padding: 1.5mm;
      overflow: visible;
      display: flex;
      flex-direction: column;
      font-size: 5pt;
      height: auto;
    }
    
    .right-section {
      width: 45%;
      padding: 1mm;
      overflow: visible;
      display: flex;
      flex-direction: column;
      font-size: 5pt;
      height: auto;
    }
    
    .section-title {
      font-weight: bold;
      font-size: 7pt;
      margin-bottom: 0.4mm;
      border-bottom: 0.5pt solid #000;
      padding-bottom: 0.3mm;
    }
    
    .field {
      margin-bottom: 0.4mm;
      flex-shrink: 0;
    }
    
    .field-label {
      font-weight: bold;
      font-size: 5pt;
    }
    
    .field-value {
      font-size: 5pt;
      border: 0.5pt solid #000;
      padding: 0.4mm;
      min-height: 4mm;
      word-break: break-word;
      overflow: hidden;
    }
    
    .field-row {
      display: flex;
      gap: 0.5mm;
      margin-bottom: 0.3mm;
      flex-shrink: 0;
    }
    
    .field-col {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    .field-col .field-label {
      font-weight: bold;
      font-size: 5pt;
    }
    
    .field-col .field-value {
      font-size: 5pt;
      border: 0.5pt solid #000;
      padding: 0.4mm;
      min-height: 4mm;
      word-break: break-word;
      overflow: hidden;
    }
    
    .nutrition-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 5pt;
      flex-shrink: 0;
      margin-top: 0.3mm;
      max-height: 25mm;
    }
    
    .nutrition-table th,
    .nutrition-table td {
      border: 0.5pt solid #000;
      padding: 0.15mm;
      text-align: center;
      height: 2mm;
    }
    
    .nutrition-table th {
      font-weight: bold;
      background-color: #f5f5f5;
      font-size: 7pt;
    }
    
    .nutrient-name {
      text-align: left;
      width: 35%;
      font-weight: normal;
    }
    
    .nutrient-value {
      width: 32.5%;
      font-size: 5pt;
    }
    
    .serving-info {
      display: flex;
      gap: 0.3mm;
      margin-bottom: 0.4mm;
      font-size: 5pt;
    }
    
    .serving-box {
      flex: 1;
      border: 0.5pt solid #000;
      padding: 0.3mm;
      text-align: center;
    }
    
    .serving-label {
      font-weight: bold;
      font-size: 7pt;
    }
    
    .serving-value {
      font-size: 5pt;
    }
    
    .manufacturer-info {
      font-size: 5pt;
      margin-top: 0.4mm;
      border-top: 0.5pt solid #000;
      padding-top: 0.3mm;
      flex-shrink: 0;
    }
    
    .manufacturer-info div {
      margin-bottom: 0.3mm;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- LEFT SECTION -->
    <div class="left-section">
      <div class="section-title">品名</div>
      <div class="field-value">${(product.productName || '').substring(0, 30)}</div>
      
      <div class="section-title" style="margin-top: 0.2mm;">成分</div>
      <div class="field-value" style="min-height: 12mm; font-size: 5pt; overflow-y: auto;">${(product.ingredients || '').split('\n').filter((line: string) => line.trim()).join(', ')}</div>
      
      <div class="field-row" style="margin-top: 0.2mm;">
        <div class="field-col">
          <div class="field-label">淨重</div>
          <div class="field-value">${(product.netWeight || '').substring(0, 15)}</div>
        </div>
        <div class="field-col">
          <div class="field-label">保存期限</div>
          <div class="field-value">${(product.storageLife || '').substring(0, 12)}</div>
        </div>
      </div>
      
      <div class="field-row">
        <div class="field-col">
          <div class="field-label">保存方式</div>
          <div class="field-value" style="font-size: 5pt; min-height: 5mm; overflow-y: auto;">${(product.storageInstructions || '').substring(0, 50)}</div>
        </div>
        <div class="field-col">
          <div class="field-label">產地</div>
          <div class="field-value" style="font-size: 5pt;">${(product.countryOfOrigin || '').substring(0, 15)}</div>
        </div>
      </div>
      
      <div class="field">
        <div class="field-label">best before 此日期前最佳</div>
        <div class="field-value">${expiryDateDisplay}</div>
      </div>
      
      <div class="section-title" style="margin-top: 0.2mm;">注意事項</div>
      <div class="field-value" style="min-height: 12mm; font-size: 5pt; overflow-y: auto;">${(product.precautions || '').split('\n').filter((line: string) => line.trim()).join(', ')}</div>
      
    </div>
    
    <!-- RIGHT SECTION -->
    <div class="right-section">
      <div class="field" style="margin-bottom: 0.3mm;">
        <div class="field-label">葷素</div>
        <div class="field-value" style="font-size: 5pt;">${(product.vegetarianStatus || '').substring(0, 15)}</div>
      </div>
      
      <div class="field" style="margin-bottom: 0.3mm;">
        <div class="field-label">過敏原資訊</div>
        <div class="field-value" style="min-height: 3.5mm; font-size: 5pt;">${(product.allergenInfo || '')}</div>
      </div>
      
      
      <div class="section-title" style="margin-bottom: 0.3mm;">營養標籤</div>
      
      <div class="serving-info">
        <div class="serving-box">
          <div class="serving-label">每一份量</div>
          <div class="serving-value">${servingSize}克</div>
        </div>
        <div class="serving-box">
          <div class="serving-label">本包裝</div>
          <div class="serving-value">${servingsPerPackage}份</div>
        </div>
      </div>
      
      <table class="nutrition-table">
        <thead>
          <tr>
            <th style="width: 35%;">營養成分</th>
            <th style="width: 32.5%;">每一份量</th>
            <th style="width: 32.5%;">每100克</th>
          </tr>
        </thead>
        <tbody>
          ${nutritionRows}
        </tbody>
      </table>
      
      <div class="manufacturer-info" style="font-size: 4pt;">
        <div><span style="font-weight: bold;">製造商</span> ${manufacturerName}</div>
        <div>地址: ${(product.manufacturerAddress || '').substring(0, 30)}</div>
        <div>電話: ${(product.manufacturerPhone || '').substring(0, 15)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
