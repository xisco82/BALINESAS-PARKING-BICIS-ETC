import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;
function getDb() {
  if (db) return db;
  try {
    const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(firebaseConfigPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
      if (admin.apps.length === 0) {
        admin.initializeApp({
          projectId: firebaseConfig.projectId,
          credential: admin.credential.applicationDefault(),
        });
      }
      // Use the database ID from config if available, default to '(default)'
      const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
      db = getFirestore(dbId);
      console.log(`[Firebase] Initialized Admin SDK with Project: ${firebaseConfig.projectId}, DB: ${dbId}`);
      return db;
    }
  } catch (err) {
    console.error("[Firebase] Initialization error:", err);
  }
  return null;
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

async function fetchEmailRecipients(): Promise<string[]> {
  const defaultRecipients = [
    "xiscoquin@gmail.com", 
    "recgranfiesta@hmhotels.com", 
    "rec1granfiesta@hmhotels.com",
    "cocinagranfiesta@hmhotels.com",
    "pisosgranfiesta@hmhotels.com",
    "subdirgranfiesta@hmhotels.com",
    "bargranfiesta@hmhotels.com",
    "ssttgranfiesta@hmhotels.com",
    "dirgranfiesta@hmhotels.com"
  ];

  try {
    const firestore = getDb();
    if (!firestore) return defaultRecipients;

    const snapshot = await firestore.collection("email_recipients").get();
    
    if (snapshot.empty) {
      console.log("[Notification] No recipients found in DB collection 'email_recipients', using defaults.");
      return defaultRecipients;
    }

    const dbEmails = snapshot.docs
      .map(doc => doc.data().email?.toString().trim().toLowerCase())
      .filter(email => typeof email === 'string' && email.includes('@'));
    
    if (dbEmails.length === 0) return defaultRecipients;

    // Combine default and DB emails, removing duplicates
    const combined = Array.from(new Set([...defaultRecipients, ...dbEmails]));
    console.log(`[Notification] Successfully fetched ${dbEmails.length} recipients from DB. Total unique: ${combined.length}`);
    return combined;
  } catch (err: any) {
    // If it's a permission error, we log it clearly and move on with defaults
    if (err.message && err.message.includes("PERMISSION_DENIED")) {
      console.warn("[Notification] Firestore Permission Denied for Recipients. This usually means the server identity lacks permissions. Falling back to hardcoded defaults.");
    } else if (err.code === 7 || err.code === 'permission-denied') {
      console.warn("[Notification] Firestore Permission Denied (code 7). Falling back to hardcoded defaults.");
    } else {
      console.error("[Notification] Error fetching recipients from DB:", err.message || err);
    }
    return defaultRecipients;
  }
}

async function notifyAppsScript(type: string, data: any): Promise<{ success: boolean; error?: string }> {
  const envUrl = process.env.APPSCRIPT_URL;
  const defaultUrl = "https://script.google.com/macros/s/AKfycbzcqyO3SWf8F5ghsZ21Msk0LEVIOi5r9gzsS5qzMusHFQhSbYUs4ZGrH64SQ1paBtMv/exec";
  const appScriptUrl = (envUrl || defaultUrl).trim();
  
  // Use passed recipients if available, otherwise fetch all
  const recipients = data.recipients || await fetchEmailRecipients();
  
  console.log(`[Notification] Env APPSCRIPT_URL: ${envUrl ? 'Configured' : 'Using Default'}`);

  if (!appScriptUrl || appScriptUrl === "TODO_APPSCRIPT_URL") {
    return { success: false, error: "Apps Script URL not configured" };
  }

  // Clean description if present
  const cleanData = { ...data };
  if (cleanData.description && typeof cleanData.description === 'string') {
    cleanData.description = stripHtml(cleanData.description);
  }

  // Remove recipients from data to avoid doubling up in the payload nested data
  const { recipients: _, ...payloadData } = cleanData;

  const payload = {
    type: type,
    data: { ...payloadData, recipients },
    secret: process.env.APPSCRIPT_SECRET || null
  };

  console.log(`[Notification] Attempting ${type} to: ${appScriptUrl}`);
  // console.log(`[Notification] Payload: ${JSON.stringify(payload)}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(appScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseText = await response.text().catch(() => "No response body");
    console.log(`[Notification] Status: ${response.status}, Body: ${responseText}`);
    
    if (!response.ok) {
      return { success: false, error: `Apps Script HTTP Error ${response.status}: ${responseText}` };
    }

    // Try to parse as JSON to check for internal script errors
    try {
      const json = JSON.parse(responseText);
      if (json.status === "error") {
        return { success: false, error: `Apps Script Logic Error: ${json.message || 'Unknown error'}` };
      }
    } catch (e) {
      // Not JSON or other parse error, but response.ok was true, so we assume success
      // unless the body is clearly an error message
      if (responseText.toLowerCase().includes("error")) {
        return { success: false, error: `Apps Script Response contains error: ${responseText}` };
      }
    }

    return { success: true };
  } catch (error: any) {
    const msg = error.name === 'AbortError' ? "Timeout after 30s" : (error.message || String(error));
    console.error(`[Notification] Connection Error:`, msg);
    return { success: false, error: `Connection Error: ${msg}` };
  }
}

async function checkUpcomingEvents() {
  const firestore = getDb();
  if (!firestore) {
    console.warn("[Cron] Firestore not initialized. Skipping check.");
    return;
  }
  console.log("Checking for upcoming events (1 and 2 days ahead)...");
  
  try {
    const today = new Date();
    
    // Check for 1 day ahead
    const oneDayFromNow = new Date(today);
    oneDayFromNow.setDate(today.getDate() + 1);
    const date1Str = oneDayFromNow.toISOString().split('T')[0];
    
    // Check for 2 days ahead
    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(today.getDate() + 2);
    const date2Str = twoDaysFromNow.toISOString().split('T')[0];

    const collectionsToCheck = [
      { name: "news_events", dateField: "startDate" },
      { name: "event_pdfs", dateField: "eventDate" }
    ];

    for (const coll of collectionsToCheck) {
      // Query for 1 day ahead
      const events1Snapshot = await firestore.collection(coll.name)
        .where(coll.dateField, "==", date1Str)
        .get();
      
      for (const doc of events1Snapshot.docs) {
        const data = doc.data();
        await notifyAppsScript("event_reminder_1d", { 
          ...data, 
          startDate: data.startDate || data.eventDate || "No especificada",
          collection: coll.name 
        });
      }

      // Query for 2 days ahead
      const events2Snapshot = await firestore.collection(coll.name)
        .where(coll.dateField, "==", date2Str)
        .get();

      for (const doc of events2Snapshot.docs) {
        const data = doc.data();
        await notifyAppsScript("event_reminder_2d", { 
          ...data, 
          startDate: data.startDate || data.eventDate || "No especificada",
          collection: coll.name 
        });
      }
    }
  } catch (error) {
    console.error("Error checking upcoming events:", error);
  }
}

async function sendNotificationEmail(events: any[]) {
  const recipients = [
    "xiscoquin@gmail.com", 
    "recgranfiesta@hmhotels.com", 
    "rec1granfiesta@hmhotels.com",
    "cocinagranfiesta@hmhotels.com",
    "pisosgranfiesta@hmhotels.com",
    "subdirgranfiesta@hmhotels.com",
    "bargranfiesta@hmhotels.com",
    "ssttgranfiesta@hmhotels.com",
    "dirgranfiesta@hmhotels.com"
  ];
  
  // SMTP Configuration from environment variables
  const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  if (!smtpConfig.host || !smtpConfig.auth.user || !smtpConfig.auth.pass) {
    console.warn("SMTP is not fully configured. Skipping email sending.");
    console.log("Notification would have been sent to:", recipients.join(", "));
    console.log("Events:", JSON.stringify(events, null, 2));
    return;
  }

  const transporter = nodemailer.createTransport(smtpConfig);

  const eventList = events.map(e => `- ${e.title}: ${stripHtml(e.description)}`).join("\n");
  
  const mailOptions = {
    from: process.env.SMTP_FROM || "noreply@hmhotels.net",
    to: recipients.join(", "),
    subject: `Recordatorio: Eventos en 2 días`,
    text: `Hola,\n\nEste es un recordatorio de que los siguientes eventos comenzarán en 2 días:\n\n${eventList}\n\nSaludos,\nSistema de Recepción`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Notification email sent to ${recipients.join(", ")}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// Only schedule cron if not on Vercel
if (process.env.VERCEL !== '1') {
  cron.schedule("0 8 * * *", () => {
    checkUpcomingEvents();
  });
}

// Also run it once on startup for testing/immediate check
// checkUpcomingEvents();

const app = express();
const PORT = 3000;

// Global middleware
app.use(express.json());

// API routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/recipients", async (req, res) => {
  try {
    const recipients = await fetchEmailRecipients();
    res.json(recipients);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual trigger for testing
app.post("/api/notifications/check", async (req, res) => {
  await checkUpcomingEvents();
  res.json({ message: "Check triggered" });
});

app.post("/api/notifications/novedad", async (req, res) => {
  try {
    const event = req.body;
    const type = event.type || "new_novedad";
    console.log(`[API] Received notification request for: ${event.title || 'Untitled'} (Type: ${type})`);
    
    if (!event || Object.keys(event).length === 0) {
      console.warn("[API] Received empty body in notification request");
      return res.status(400).json({ error: "Empty request body" });
    }

    const result = await notifyAppsScript(type, event);
    if (result.success) {
      res.json({ message: "Notification sent" });
    } else {
      res.status(500).json({ error: result.error || "Failed to send notification to Apps Script." });
    }
  } catch (err: any) {
    console.error("[API] Error in notification endpoint:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

async function startServer() {
  console.log("[Server] Starting server...");
  
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      console.warn("[Server] Dist folder not found. Static serving disabled.");
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Server] API Routes: /api/health, /api/notifications/check, /api/notifications/novedad`);
  });
}

// Export for Vercel
export default app;

// Only start if not on Vercel
if (process.env.VERCEL !== '1') {
  startServer();
}
