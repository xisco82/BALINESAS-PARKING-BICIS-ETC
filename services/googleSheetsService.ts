/* global gapi, google */

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// --- --- --- --- IMPORTANT: CONFIGURATION REQUIRED --- --- --- --- --- ---
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// Find and replace these placeholder values with your actual credentials.
// 1. Go to https://console.cloud.google.com/ and create a project.
// 2. Enable the "Google Sheets API".
// 3. Go to "Credentials" and create:
//    - An "OAuth 2.0 Client ID" for a "Web Application".
//      - Add your app's URL (e.g., https://your-app-url.com) to "Authorized JavaScript origins".
// 4. Create a Google Sheet and get its ID from the URL (e.g., the ... part in docs.google.com/spreadsheets/d/.../edit).

const CLIENT_ID = '287309315545-56k3s52aol7rmq47v7eintkgd1pf2ts4.apps.googleusercontent.com'; // REPLACE with your OAuth Client ID
const SPREADSHEET_ID = '11Qe9MBkoAmDjJCyVaN4AUwFOc108e3Z4rmDJ2kI_zDE'; // REPLACE with your Spreadsheet ID

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// --- --- --- --- --- --- --- END OF CONFIGURATION --- --- --- --- --- ---
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---

// Define types for gapi and google to avoid TypeScript errors.
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient: any = null;
let updateSigninStatusCallback: (isSignedIn: boolean) => void;
let gapiInitialized = false;

// A promise that resolves when the GAPI and GIS clients are fully loaded and initialized.
// Any function that needs the client (e.g., writeData) will await this promise.
const initializationPromise = new Promise<void>((resolve, reject) => {
  
  // 1. Critical configuration check
  if (CLIENT_ID.startsWith('YOUR_') || SPREADSHEET_ID.startsWith('YOUR_')) {
    return reject(new Error("Configuration required. Please replace placeholder values in services/googleSheetsService.ts."));
  }

  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.async = true;
  gapiScript.defer = true;
  gapiScript.onload = () => window.gapi.load('client', initializeGapiClient);
  gapiScript.onerror = () => reject(new Error('Failed to load Google API script. Check network or ad-blockers.'));
  document.body.appendChild(gapiScript);

  const gisScript = document.createElement('script');
  gisScript.src = 'https://accounts.google.com/gsi/client';
  gisScript.async = true;
  gisScript.defer = true;
  gisScript.onload = initializeGisClient;
  gisScript.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
  document.body.appendChild(gisScript);

  async function initializeGapiClient() {
    try {
      await window.gapi.client.init({
        discoveryDocs: DISCOVERY_DOCS,
      });
      gapiInitialized = true;
      checkInitialization();
    } catch (error) {
      reject(error);
    }
  }

  function initializeGisClient() {
    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse: any) => {
          if (tokenResponse && tokenResponse.access_token) {
            if(updateSigninStatusCallback) updateSigninStatusCallback(true);
          }
        },
      });
      checkInitialization();
    } catch (error) {
       reject(error);
    }
  }
  
  function checkInitialization() {
    if (gapiInitialized && tokenClient) {
      resolve();
    }
  }
});


/**
 * Initializes the API client library. This should be called once when the application loads.
 */
export async function initClient(updateSigninStatusCb: (isSignedIn: boolean) => void): Promise<void> {
  updateSigninStatusCallback = updateSigninStatusCb;
  // The promise handles the actual initialization. We just await it here.
  return initializationPromise;
}

/**
 * Append a row of values to the spreadsheet.
 */
export async function writeData(sheetName: string, values: any[][]) {
  await initializationPromise; // Ensure client is ready before writing
  
  if (!window.gapi.client.sheets) {
      console.error("GAPI sheets client not loaded yet.");
      throw new Error("GAPI sheets client not loaded yet.");
  }

  try {
    const response = await window.gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
    return response;
  } catch (err: any) {
    if (err.status === 401) {
      window.gapi.client.setToken(null);
       if(updateSigninStatusCallback) updateSigninStatusCallback(false);
    }
    console.error("Error writing to Google Sheet:", err);
    throw err;
  }
}