
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ReceiptData, ActionItem, InboxAnalysisResult, CalendarEvent, IntegrationAccount, BankTransaction, ReconciliationSuggestion, TimesheetEntry, ContractData, InvoiceTemplate } from "../types";
import JSZip from 'jszip';

// Use import.meta.env for Vite support, fallback to process.env for Node/Test environments if needed
const API_KEY = import.meta.env.VITE_API_KEY || process.env.API_KEY;

const ai = new GoogleGenAI({ apiKey: API_KEY });

const RECEIPT_MODEL = "gemini-2.5-flash";
const OPS_MODEL = "gemini-2.5-flash";
const BRIEFING_MODEL = "gemini-2.5-flash"; 
const CONTRACT_MODEL = "gemini-2.5-flash";

// --- Schemas ---

const receiptSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    vendor: { type: Type.STRING },
    amount: { type: Type.NUMBER },
    currency: { type: Type.STRING },
    date: { type: Type.STRING },
    category: { type: Type.STRING },
    description: { type: Type.STRING },
    vatAmount: { type: Type.NUMBER },
    taxDeductible: { type: Type.BOOLEAN },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    notes: { type: Type.STRING },
  },
  required: ["vendor", "amount", "date", "description"]
};

const actionItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    task: { type: Type.STRING },
    assignee: { type: Type.STRING },
    deadline: { type: Type.STRING },
    priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["task", "priority"]
};

const calendarEventSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        startTime: { type: Type.STRING },
        endTime: { type: Type.STRING },
        location: { type: Type.STRING },
        type: { type: Type.STRING, enum: ['Meeting', 'Flight', 'Hotel', 'Reminder'] },
        description: { type: Type.STRING }
    },
    required: ["title", "startTime", "type"]
};

const inboxAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    receipts: { type: Type.ARRAY, items: receiptSchema },
    tasks: { type: Type.ARRAY, items: actionItemSchema },
    events: { type: Type.ARRAY, items: calendarEventSchema },
  },
};

const reconciliationSchema: Schema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            transactionId: { type: Type.STRING },
            receiptId: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING }
        },
        required: ["transactionId", "receiptId", "confidence"]
    }
};

const bankStatementSchema: Schema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            date: { type: Type.STRING },
            description: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            currency: { type: Type.STRING }
        },
        required: ["date", "description", "amount"]
    }
};

const timesheetEntrySchema: Schema = {
    type: Type.OBJECT,
    properties: {
        date: { type: Type.STRING },
        employee: { type: Type.STRING },
        project: { type: Type.STRING },
        task: { type: Type.STRING },
        hours: { type: Type.NUMBER },
    },
    required: ["date", "hours"]
};

const contractAnalysisSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        summary: { type: Type.STRING },
        keyConstraints: { type: Type.ARRAY, items: { type: Type.STRING } },
        expirationDate: { type: Type.STRING },
        parties: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["summary", "keyConstraints", "parties"]
};

const fieldSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        label: { type: Type.STRING, description: "The extracted label text (e.g. 'Invoice No') - for reference only." },
        defaultValue: { type: Type.STRING, description: "The value extracted from the sample (e.g. 'INV-001')." },
        type: { type: Type.STRING, enum: ['text', 'date', 'number', 'textarea', 'currency'] },
        section: { type: Type.STRING, enum: ['header', 'company', 'client', 'footer'] },
        geometry: {
            type: Type.OBJECT,
            properties: {
                top: { type: Type.NUMBER, description: "Top Y position of the VALUE ONLY (percentage 0-100)" },
                left: { type: Type.NUMBER, description: "Left X position of the VALUE ONLY (percentage 0-100)" },
                width: { type: Type.NUMBER, description: "Width of the value area (percentage 0-100)" }
            },
            required: ["top", "left"]
        }
    },
    required: ["label", "type", "section", "geometry"]
};

const invoiceStructureSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        templateName: { type: Type.STRING, description: "Suggested name for this template" },
        allFields: { 
            type: Type.ARRAY, 
            items: fieldSchema,
            description: "List variable fields. CRITICAL: Geometry must cover the VALUE, not the LABEL. We will overlay new text here."
        },
        itemsTableHeaders: {
            type: Type.OBJECT,
            properties: {
                description: { type: Type.STRING, description: "Header text for description column" },
                quantity: { type: Type.STRING, description: "Header text for qty" },
                price: { type: Type.STRING, description: "Header text for unit price" },
                total: { type: Type.STRING, description: "Header text for line total" }
            },
            required: ["description", "quantity", "price", "total"]
        },
        itemsTableTop: { type: Type.NUMBER, description: "The Y position (%) where the table headers END and the first data row begins. The background below this line will be cleared." },
        itemsTableLeft: { type: Type.NUMBER, description: "Left X position (percentage 0-100)." },
        itemsTableWidth: { type: Type.NUMBER, description: "Width (percentage 0-100)." },
        rowHeight: { type: Type.NUMBER, description: "Approximate height of a single row in %." },
        columnLayout: {
            type: Type.OBJECT,
            properties: {
                descriptionX: { type: Type.NUMBER, description: "X % for Description column start" },
                quantityX: { type: Type.NUMBER, description: "X % for Quantity column start" },
                priceX: { type: Type.NUMBER, description: "X % for Price column start" },
                totalX: { type: Type.NUMBER, description: "X % for Total column start" }
            },
            required: ["descriptionX", "quantityX", "priceX", "totalX"]
        },
        contentTopOffset: { type: Type.NUMBER },
        contentLeftOffset: { type: Type.NUMBER }
    },
    required: ["templateName", "allFields", "itemsTableHeaders", "itemsTableTop", "columnLayout"]
};

// Mock Data
const MOCK_EMAILS_DATA = [
    { accountId: '1', content: "Subject: Lunch Invoice\nTotal: $25.50\nVendor: Burger King\nDate: 2024-05-01" },
    { accountId: '2', content: "Subject: Software License\nTotal: $100.00\nVendor: Adobe\nDate: 2024-05-02" }
];

const safeJSONParse = (text: string) => {
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("JSON Parse Error", e);
        return {};
    }
};

export const analyzeInvoiceTemplate = async (base64Data: string, mimeType: string): Promise<Partial<InvoiceTemplate>> => {
    try {
        const response = await ai.models.generateContent({
            model: OPS_MODEL,
            contents: [ // Pass as array
                {
                    parts: [
                        { inlineData: { mimeType, data: base64Data } },
                        { text: "Analyze this invoice to create a 'Form Filling' template overlay.\n\nInstructions:\n1. **Identify Variable Fields (Red Zones)**: Identify ONLY the values that change (e.g. the actual Date '2024-01-01', the actual Inv# '001', the Client Name). \n2. **Exclude Labels**: Do NOT include static labels (like 'Invoice No:', 'Bill To:', 'Total:') in the geometry. We want to keep the original labels visible on the background image.\n3. **Table Analysis**: Find the Y-position where the *headers end*. This is `itemsTableTop`. We will clear everything below this line to draw new rows, but keep the headers intact.\n4. **Column Mapping**: Identify X-positions for columns." }
                    ]
                }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: invoiceStructureSchema,
                temperature: 0.1
            }
        });
        
        const parsed = safeJSONParse(response.text || "{}");
        const allFields = parsed.allFields || [];

        // Fallback
        if (allFields.length === 0) {
            allFields.push(
                { label: "Invoice No", defaultValue: "INV-001", type: "text", section: "header", geometry: { top: 10, left: 70, width: 20 } },
                { label: "Date", defaultValue: new Date().toISOString().split('T')[0], type: "date", section: "header", geometry: { top: 15, left: 70, width: 20 } },
                { label: "Bill To", defaultValue: "Client Name", type: "textarea", section: "client", geometry: { top: 20, left: 10, width: 40 } },
                { label: "Total", defaultValue: "0.00", type: "currency", section: "footer", geometry: { top: 80, left: 70, width: 20 } }
            );
        }

        const structure = {
            header: allFields.filter((f: any) => f.section === 'header').map((f: any) => ({ ...f, id: crypto.randomUUID() })),
            company: allFields.filter((f: any) => f.section === 'company').map((f: any) => ({ ...f, id: crypto.randomUUID() })),
            client: allFields.filter((f: any) => f.section === 'client').map((f: any) => ({ ...f, id: crypto.randomUUID() })),
            footer: allFields.filter((f: any) => f.section === 'footer').map((f: any) => ({ ...f, id: crypto.randomUUID() })),
            itemsColumns: parsed.itemsTableHeaders || { description: 'Description', quantity: 'Qty', price: 'Price', total: 'Total' },
            itemsTableGeometry: { 
                top: parsed.itemsTableTop || 40,
                left: parsed.itemsTableLeft || 5,
                width: parsed.itemsTableWidth || 90,
                rowHeight: parsed.rowHeight || 5
            },
            columnLayout: parsed.columnLayout || { descriptionX: 5, quantityX: 50, priceX: 65, totalX: 80 },
            systemMapping: {} 
        };

        return {
            name: parsed.templateName || "New Template",
            structure: structure as any,
            defaults: {
                useGlobalBranding: true,
                contentTopOffset: parsed.contentTopOffset || 0,
                contentLeftOffset: parsed.contentLeftOffset || 0,
            }
        };
    } catch (e) {
        console.error("Template Analysis Error", e);
        throw e;
    }
}

export const suggestMatches = async (
    transactions: BankTransaction[], 
    receipts: ReceiptData[]
): Promise<ReconciliationSuggestion[]> => {
    // Only send simplified data to save tokens
    const simpleTxs = transactions.filter(t => !t.matchedReceiptId).map(t => ({ id: t.id, date: t.date, desc: t.description, amt: t.amount }));
    const simpleReceipts = receipts.map(r => ({ id: r.id, date: r.date, vendor: r.vendor, amt: r.amount }));

    if (simpleTxs.length === 0 || simpleReceipts.length === 0) return [];

    try {
        const prompt = `
            Act as an expert forensic accountant. I have a list of unmatched bank transactions and a list of receipts.
            Find matches where the amount is roughly the same (within 5% variance for currency conversion or fees) AND the date is close (within 10 days).
            Also consider vendor name fuzzy matching.
            
            Bank Transactions: ${JSON.stringify(simpleTxs)}
            Receipts: ${JSON.stringify(simpleReceipts)}
            
            Return a JSON list of matches. Only include confident matches (>70%).
        `;

        const response = await ai.models.generateContent({
            model: RECEIPT_MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: reconciliationSchema,
                temperature: 0.1
            }
        });

        return safeJSONParse(response.text || "[]");
    } catch (e) {
        console.error("Match Suggestion Error", e);
        return [];
    }
}

export const parseBankStatement = async (base64Data: string, mimeType: string): Promise<BankTransaction[]> => {
  try {
    const response = await ai.models.generateContent({
      model: RECEIPT_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: "Analyze this bank statement. Extract transaction rows. Use negative amounts for expenses, positive for income. Return JSON."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: bankStatementSchema,
        temperature: 0.1
      }
    });

    const parsed = safeJSONParse(response.text || "[]");
    return parsed.map((t: any) => ({
      ...t,
      id: crypto.randomUUID(),
      status: 'Unreconciled'
    }));
  } catch (error) {
    console.error("Bank Statement Analysis Error:", error);
    throw new Error("Failed to parse bank statement.");
  }
};

export const fetchMockInbox = async (connectedAccounts: IntegrationAccount[]): Promise<string[]> => {
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const allEmails: string[] = [];

  for (const account of connectedAccounts) {
      if (account.apiConfig?.clientId) {
          console.log(`[Integration] Attempting to connect to ${account.provider}`);
      }

      const mocks = MOCK_EMAILS_DATA.filter(email => email.accountId === account.id);
      if (mocks.length > 0) {
          allEmails.push(...mocks.map(e => e.content));
          continue;
      }

      if (account.provider === 'Gmail') {
          const domain = account.name.includes('@') ? account.name.split('@')[1] : 'gmail.com';
          const username = account.name.split('@')[0];
          
          allEmails.push(`From: billing@${domain}
Subject: Service Subscription Invoice for ${username}
Body: Hi ${username}, please find attached your invoice.
Amount: $49.00 USD
Date: ${new Date().toISOString().split('T')[0]}
Vendor: ${domain.split('.')[0].toUpperCase()} Services
Tax Deductible: Yes.`);

          allEmails.push(`From: calendar@${domain}
Subject: Team Sync
Body: Weekly sync with the ${domain.split('.')[0]} team.
Time: ${new Date(Date.now() + 86400000).toISOString()}
Location: Video Call`);
      }
  }

  return allEmails;
};

export const analyzeInbox = async (emailBodies: string[]): Promise<InboxAnalysisResult> => {
  if (emailBodies.length === 0) {
      return { receipts: [], tasks: [], events: [] };
  }

  try {
    const response = await ai.models.generateContent({
      model: OPS_MODEL,
      contents: `You are an intelligent executive assistant. Process these emails and extract:
      1. Financial Receipts (expenses, invoices) - Ensure VAT and Currency are extracted for accounting.
      2. Calendar Events (meetings, flights, hotel stays)
      3. Action Items (tasks, follow-ups)
      4. Auto-tag items with useful labels like #Client, #Urgent, #Travel.
      
      EMAILS:
      ${emailBodies.join('\n---\n')}
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: inboxAnalysisSchema,
        temperature: 0.2
      }
    });

    const parsed = safeJSONParse(response.text || "{}");
    
    return {
      receipts: (parsed.receipts || []).map((r: any) => ({ 
          ...r, 
          id: crypto.randomUUID(), 
          source: 'Gmail',
          sourceUrl: 'https://mail.google.com/mail/u/0/#inbox',
          currency: r.currency || 'USD' 
      })),
      tasks: (parsed.tasks || []).map((t: any) => ({ ...t, id: crypto.randomUUID(), status: 'Pending', originEmail: 'Imported' })),
      events: (parsed.events || []).map((e: any) => ({ ...e, id: crypto.randomUUID() })),
    };
  } catch (error) {
    console.error("Inbox Analysis Error:", error);
    throw new Error("Failed to analyze inbox.");
  }
};

export const analyzeReceipt = async (base64Data: string, mimeType: string, filename?: string): Promise<ReceiptData> => {
  try {
    const response = await ai.models.generateContent({
      model: RECEIPT_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: "Analyze this document for accounting. Extract vendor, amount, currency, VAT Amount, date, and categorize. Create a formal Description for the ledger. Generate 2-3 relevant tags."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: receiptSchema,
        temperature: 0.1 
      }
    });

    const data = safeJSONParse(response.text || "{}");
    return {
      ...data,
      id: crypto.randomUUID(),
      imageUrl: mimeType.startsWith('image/') ? `data:${mimeType};base64,${base64Data}` : undefined,
      source: 'Upload',
      sourceUrl: filename || 'Upload',
      currency: data.currency || 'USD'
    };
  } catch (error) {
    console.error("Receipt Analysis Error:", error);
    throw new Error(`Failed to analyze receipt: ${filename}`);
  }
};

export const analyzeReceiptBatch = async (files: File[], onProgress?: (completed: number, total: number) => void): Promise<ReceiptData[]> => {
    const results: ReceiptData[] = [];
    let completed = 0;

    const promises = files.map(async (file) => {
        try {
            const buffer = await file.arrayBuffer();
            const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            const result = await analyzeReceipt(base64, file.type, file.name);
            completed++;
            if (onProgress) onProgress(completed, files.length);
            return result;
        } catch (e) {
            console.error(`Failed to process ${file.name}`, e);
            completed++;
            if (onProgress) onProgress(completed, files.length);
            return null;
        }
    });

    const analyzed = await Promise.all(promises);
    return analyzed.filter(r => r !== null) as ReceiptData[];
};

export const extractReceiptsFromZip = async (zipBuffer: ArrayBuffer, zipName: string, onProgress?: (completed: number, total: number) => void): Promise<ReceiptData[]> => {
    try {
        const zip = await JSZip.loadAsync(zipBuffer);
        const imageFiles: {name: string, data: string, type: string}[] = [];

        // 1. Extract valid files from Zip
        for (const filename of Object.keys(zip.files)) {
            const file = zip.files[filename];
            if (file.dir) continue;
            
            const lowerName = filename.toLowerCase();
            if (lowerName.match(/\.(jpg|jpeg|png|webp|pdf)$/)) {
                const base64 = await file.async('base64');
                let type = 'application/octet-stream';
                if (lowerName.endsWith('pdf')) type = 'application/pdf';
                else if (lowerName.endsWith('png')) type = 'image/png';
                else if (lowerName.endsWith('webp')) type = 'image/webp';
                else type = 'image/jpeg';

                imageFiles.push({ name: filename, data: base64, type });
            }
        }

        // 2. Process extracted files
        const results: ReceiptData[] = [];
        let completed = 0;
        
        const promises = imageFiles.map(async (file) => {
            try {
                const result = await analyzeReceipt(file.data, file.type, `${zipName}/${file.name}`);
                completed++;
                if (onProgress) onProgress(completed, imageFiles.length);
                return result;
            } catch (e) {
                console.error(`Failed to analyze zip entry: ${file.name}`, e);
                completed++;
                if (onProgress) onProgress(completed, imageFiles.length);
                return null;
            }
        });

        const analyzed = await Promise.all(promises);
        return analyzed.filter(r => r !== null) as ReceiptData[];

    } catch (e) {
        console.error("Zip Extraction Error", e);
        throw new Error("Failed to process Zip file");
    }
};

export const extractActionItems = async (textLogs: string): Promise<ActionItem[]> => {
  try {
    const response = await ai.models.generateContent({
      model: OPS_MODEL,
      contents: `Analyze the following communication logs (Slack/Email/Notes). Extract concrete action items, assignees, and priorities. Add context tags (e.g. #Dev, #Sales).\n\nLOGS:\n${textLogs}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: actionItemSchema
        },
        temperature: 0.3
      }
    });

    const items = safeJSONParse(response.text || "[]");
    return items.map((item: any) => ({
      ...item,
      id: crypto.randomUUID(),
      status: 'Pending'
    }));
  } catch (error) {
    console.error("Ops Analysis Error:", error);
    throw new Error("Failed to extract action items.");
  }
};

export const extractActionItemsFromFile = async (base64Data: string, mimeType: string): Promise<ActionItem[]> => {
  try {
    const response = await ai.models.generateContent({
      model: OPS_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: "Analyze this document (meeting notes, spec sheet, or logs). Extract concrete action items, assignees, priorities, and tags."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.ARRAY,
            items: actionItemSchema
        },
        temperature: 0.3
      }
    });

    const items = safeJSONParse(response.text || "[]");
    return items.map((item: any) => ({
      ...item,
      id: crypto.randomUUID(),
      status: 'Pending'
    }));
  } catch (error) {
    console.error("Ops File Analysis Error:", error);
    throw new Error("Failed to extract action items from file.");
  }
};

export const parseTimesheet = async (data: string | object, mimeType: string): Promise<TimesheetEntry[]> => {
    try {
        const contents = (typeof data === 'object' || mimeType === 'application/json')
            ? `Normalize this raw timesheet data into a standard JSON format. Raw Data: ${JSON.stringify(data)}`
            : {
                parts: [
                    { inlineData: { mimeType, data: data as string } },
                    { text: "Parse this timesheet image/pdf. Extract row-by-row entries including Date, Employee, Project, Task, Hours. Normalize date to YYYY-MM-DD." }
                ]
            };

        const response = await ai.models.generateContent({
            model: OPS_MODEL,
            contents: contents,
            config: {
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: timesheetEntrySchema },
                temperature: 0.1
            }
        });
        const parsed = safeJSONParse(response.text || "[]");
        return parsed.map((e: any) => ({ ...e, id: crypto.randomUUID() }));
    } catch (e) {
        console.error("Timesheet Parsing Error", e);
        throw new Error("Failed to parse timesheet");
    }
};

export const analyzeContract = async (base64Data: string, mimeType: string): Promise<Omit<ContractData, 'id' | 'category' | 'name'>> => {
    try {
        const response = await ai.models.generateContent({
            model: CONTRACT_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType, data: base64Data } },
                    { text: "Analyze this contract (image or pdf). Extract a summary, key constraints/deadlines, expiration date, and involved parties. Return structured JSON." }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: contractAnalysisSchema,
                temperature: 0.1
            }
        });
        const parsed = safeJSONParse(response.text || "{}");
        return {
            summary: parsed.summary || "",
            keyConstraints: parsed.keyConstraints || [],
            expirationDate: parsed.expirationDate,
            parties: parsed.parties || [],
            uploadDate: new Date().toISOString(),
            sourceUrl: ""
        };
    } catch (e) {
        console.error("Contract Analysis Error", e);
        throw new Error("Failed to analyze contract");
    }
};

export const queryTimesheetData = async (entries: TimesheetEntry[], query: string): Promise<string> => {
     const prompt = `
        You are a timesheet analyst. Answer the user query based on the following data:
        ${JSON.stringify(entries.slice(0, 500))} 
        
        Query: ${query}
        Provide a concise, formatted summary.
    `;
    const response = await ai.models.generateContent({
        model: OPS_MODEL,
        contents: prompt
    });
    return response.text || "No data.";
};

export const queryContractData = async (contracts: ContractData[], query: string): Promise<string> => {
    const context = contracts.map(c => 
        `[Contract: ${c.name} (${c.category})] Expiration: ${c.expirationDate || 'N/A'}. Constraints: ${c.keyConstraints.join(', ')}. Summary: ${c.summary}`
    ).join('\n\n');

    const prompt = `
        You are a legal assistant. Answer the user query based on the contracts in your database.
        
        CONTRACTS DB:
        ${context}
        
        USER QUERY: ${query}
        
        Answer clearly and reference specific contracts if applicable.
    `;
    const response = await ai.models.generateContent({
        model: CONTRACT_MODEL,
        contents: prompt
    });
    return response.text || "Unable to answer.";
};

export const generateDailyBriefing = async (receipts: ReceiptData[], tasks: ActionItem[]): Promise<string> => {
  try {
    const receiptSummary = receipts.map(r => `${r.vendor}: ${r.amount} ${r.currency} (${r.category})`).join("\n");
    const taskSummary = tasks.filter(t => t.status === 'Pending').map(t => `[${t.priority}] ${t.task} (@${t.assignee}) #${t.tags?.join(' #')}`).join("\n");

    const prompt = `
      You are FounderOS, an intelligent business brain. 
      Generate a concise, professional "Start-of-Day" executive briefing in Markdown.
      
      Recent Financials:
      ${receiptSummary || "No recent receipts."}

      Pending Action Items:
      ${taskSummary || "No pending tasks."}

      Structure the response with:
      1. 🌞 **Morning Vibe Check**: One sentence summary of current status.
      2. 🚨 **Urgent Attention**: High priority tasks or large expenses.
      3. 💼 **Financial Snapshot**: Brief comment on spending.
      4. ✅ **Recommended Focus**: What to do first.
    `;

    const response = await ai.models.generateContent({
      model: BRIEFING_MODEL,
      contents: prompt,
      config: {
        temperature: 0.7
      }
    });

    return response.text || "Unable to generate briefing.";
  } catch (error) {
    console.error("Briefing Error:", error);
    return "Failed to generate briefing due to an API error.";
  }
};
