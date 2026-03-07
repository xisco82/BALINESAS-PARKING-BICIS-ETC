import { neon } from '@neondatabase/serverless';

// IMPORTANT SECURITY WARNING:
// Hardcoding credentials in a frontend application is a major security risk.
// This allows anyone to access your database. This implementation is based on
// an explicit user request to disregard security. In a real-world application,
// this connection should be handled by a secure backend server.
const connectionString = "postgresql://neondb_owner:npg_H2rKxJqv5fgs@ep-dry-hall-agjjzllv-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Export the sql instance for making queries
export const sql = neon(connectionString);

/**
 * Initializes the database by creating necessary tables if they don't already exist.
 * This function is called once when the application starts.
 */
export async function initializeDatabase() {
    try {
        // --- News Events Table: Robust Creation and Migration ---
        // Step 1: Create the table with the ideal schema if it doesn't exist.
        // This handles the case of a fresh database install.
        await sql`
            CREATE TABLE IF NOT EXISTS news_events (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL
            );
        `;

        // Step 2: Perform migrations if necessary by checking the current schema.
        // These checks are run independently to handle various inconsistent states.
        let columnsResult = await sql`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'news_events' AND table_schema = 'public'
        `;
        let columnNames = columnsResult.map((c: any) => c.column_name);

        // Migration A: The old 'date' column exists, but 'start_date' does not. Rename it.
        if (columnNames.includes('date') && !columnNames.includes('start_date')) {
            console.log("Migrating 'news_events': Renaming 'date' to 'start_date'.");
            await sql`ALTER TABLE news_events RENAME COLUMN date TO start_date;`;
            // Re-fetch column names as the schema has changed.
            columnsResult = await sql`
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'news_events' AND table_schema = 'public'
            `;
            columnNames = columnsResult.map((c: any) => c.column_name);
        }
        
        // Migration B: 'start_date' exists, but 'end_date' is missing. Add and populate it.
        // This runs after Migration A if needed, or on its own for a partially migrated schema.
        if (columnNames.includes('start_date') && !columnNames.includes('end_date')) {
            console.log("Migrating 'news_events': Adding and populating 'end_date'.");
            await sql`ALTER TABLE news_events ADD COLUMN end_date DATE;`;
            await sql`UPDATE news_events SET end_date = start_date;`;
            await sql`ALTER TABLE news_events ALTER COLUMN end_date SET NOT NULL;`;
        }
        
        // Migration C (Defensive): If 'date' still exists with 'start_date', drop the old 'date' column.
        if (columnNames.includes('date') && columnNames.includes('start_date')) {
            console.log("Cleaning 'news_events': Dropping redundant 'date' column.");
            await sql`ALTER TABLE news_events DROP COLUMN date;`;
        }

         await sql`
            CREATE TABLE IF NOT EXISTS parking_bookings (
                spot_id INTEGER NOT NULL,
                date DATE NOT NULL,
                guest_name TEXT NOT NULL,
                room_number TEXT NOT NULL,
                PRIMARY KEY (spot_id, date)
            );
        `;
         await sql`
            CREATE TABLE IF NOT EXISTS bike_bookings (
                bike_id INTEGER NOT NULL,
                date DATE NOT NULL,
                guest_name TEXT NOT NULL,
                room_number TEXT NOT NULL,
                PRIMARY KEY (bike_id, date)
            );
        `;
        // New table for bike availability status
        await sql`
            CREATE TABLE IF NOT EXISTS bike_availability (
                bike_id INTEGER NOT NULL,
                date DATE NOT NULL,
                PRIMARY KEY (bike_id, date)
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS balinese_bookings (
                bed_id INTEGER NOT NULL,
                date DATE NOT NULL,
                guest_name TEXT NOT NULL,
                room_number TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by TEXT,
                PRIMARY KEY (bed_id, date)
            );
        `;
        
        // The ALTER TABLE statements below ensure backward compatibility for databases
        // created before the `created_at` and `created_by` columns were added.
        // `ADD COLUMN IF NOT EXISTS` is non-destructive and safe to run on every startup.
        await sql`ALTER TABLE balinese_bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
        await sql`ALTER TABLE balinese_bookings ADD COLUMN IF NOT EXISTS created_by TEXT`;
        
        // This table is now created with IF NOT EXISTS to prevent data loss on every app reload.
        await sql`
            CREATE TABLE IF NOT EXISTS restaurant_bookings (
                id SERIAL PRIMARY KEY,
                guest_name TEXT NOT NULL,
                room_number TEXT NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                description TEXT NOT NULL
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS sky_dinner_bookings (
                id SERIAL PRIMARY KEY,
                guest_name TEXT NOT NULL,
                room_number TEXT NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                description TEXT NOT NULL
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS day_pass_bookings (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                client_name TEXT NOT NULL,
                service_type TEXT NOT NULL,
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by TEXT,
                number_of_people INTEGER NOT NULL DEFAULT 1,
                created_from TEXT DEFAULT 'direct'
            );
        `;
        
        await sql`ALTER TABLE day_pass_bookings DROP COLUMN IF EXISTS price;`;
        await sql`ALTER TABLE day_pass_bookings ADD COLUMN IF NOT EXISTS number_of_people INTEGER NOT NULL DEFAULT 1;`;
        await sql`ALTER TABLE day_pass_bookings ADD COLUMN IF NOT EXISTS created_from TEXT DEFAULT 'direct';`;

        await sql`
            CREATE TABLE IF NOT EXISTS accessibility_bookings (
                id SERIAL PRIMARY KEY,
                guest_name TEXT NOT NULL,
                room_number TEXT NOT NULL,
                arrival_date DATE NOT NULL,
                departure_date DATE NOT NULL,
                disability_info TEXT NOT NULL
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS sauna_bookings (
                date DATE NOT NULL,
                time_slot TEXT NOT NULL,
                guest_name TEXT NOT NULL,
                room_number TEXT NOT NULL,
                PRIMARY KEY (date, time_slot)
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS email_recipients (
                id SERIAL PRIMARY KEY,
                department TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE
            );
        `;
        
        // Seed the email_recipients table with the specified list of emails.
        const recipients = [
            { department: 'Back office', email: 'rec1granfiesta@hmhotels.com' },
            { department: 'Bar y Restaurante', email: 'bargranfiesta@hmhotels.com' },
            { department: 'Cocina', email: 'cocinagranfiesta@hmhotels.com' },
            { department: 'Dirección', email: 'dirgranfiesta@hmhotels.com' },
            { department: 'Economato', email: 'almgranfiesta@hmhotels.com' },
            { department: 'Front office', email: 'recgranfiesta@hmhotels.com' },
            { department: 'Mantenimiento', email: 'ssttgranfiesta@hmhotels.com' },
            { department: 'Pisos', email: 'pisosgranfiesta@hmhotels.com' },
            { department: 'Subdirección', email: 'subdirgranfiesta@hmhotels.com' },
        ];

        // This two-step process makes the seeding fully corrective.
        // 1. Delete any recipients that are not in our canonical list.
        const canonicalDepartments = recipients.map(r => r.department);
        await sql`DELETE FROM email_recipients WHERE department <> ALL(${canonicalDepartments})`;
        
        // 2. Insert or update all recipients from the canonical list.
        for (const recipient of recipients) {
            await sql`
                INSERT INTO email_recipients (department, email) 
                VALUES (${recipient.department}, ${recipient.email}) 
                ON CONFLICT (department) DO UPDATE SET email = EXCLUDED.email
            `;
        }

        console.log("Database tables checked/created successfully.");
    } catch (error) {
        console.error("Error initializing database:", error);
        throw new Error("Could not initialize the database. Please check the connection string and database permissions.");
    }
}