import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));

admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const db = admin.firestore();

async function checkUpcomingEvents() {
  console.log("Checking for upcoming events (2 days ahead)...");
  
  try {
    const today = new Date();
    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(today.getDate() + 2);
    
    // Format to YYYY-MM-DD
    const targetDateStr = twoDaysFromNow.toISOString().split('T')[0];
    console.log(`Target date: ${targetDateStr}`);

    const eventsSnapshot = await db.collection("news_events")
      .where("startDate", "==", targetDateStr)
      .get();

    if (eventsSnapshot.empty) {
      console.log("No events found for this date.");
      return;
    }

    const events = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`Found ${events.length} events. Sending notification...`);

    await sendNotificationEmail(events);
  } catch (error) {
    console.error("Error checking upcoming events:", error);
  }
}

async function sendNotificationEmail(events: any[]) {
  const recipient = "rec1granfiesta@hmhotels.net";
  
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
    console.log("Notification would have been sent to:", recipient);
    console.log("Events:", JSON.stringify(events, null, 2));
    return;
  }

  const transporter = nodemailer.createTransport(smtpConfig);

  const eventList = events.map(e => `- ${e.title}: ${e.description.replace(/<[^>]*>?/gm, '')}`).join("\n");
  
  const mailOptions = {
    from: process.env.SMTP_FROM || "noreply@hmhotels.net",
    to: recipient,
    subject: `Recordatorio: Eventos en 2 días`,
    text: `Hola,\n\nEste es un recordatorio de que los siguientes eventos comenzarán en 2 días:\n\n${eventList}\n\nSaludos,\nSistema de Recepción`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Notification email sent to ${recipient}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// Schedule the task to run every day at 08:00 AM
cron.schedule("0 8 * * *", () => {
  checkUpcomingEvents();
});

// Also run it once on startup for testing/immediate check
// checkUpcomingEvents();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Manual trigger for testing
  app.post("/api/notifications/check", async (req, res) => {
    await checkUpcomingEvents();
    res.json({ message: "Check triggered" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
