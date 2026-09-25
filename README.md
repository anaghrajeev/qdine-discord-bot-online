# QDine Discord Work Monitoring Bot

A production-ready MVP Discord bot for the QDine team to monitor employee/team working sessions through a dedicated Discord voice channel.

## Features
- Automatically tracks work sessions when users join a configured working voice channel.
- Handles breaks and disconnections appropriately.
- Calculates daily and weekly working hours.
- Slash commands for users (`/work`, `/today`, `/week`, `/status`).
- Scheduled automatic daily and weekly reports to a designated channel.
- SQLite database (via Prisma) for easy setup, configurable to PostgreSQL for production.
- Express health server to keep the bot alive on Render Free Web Service with UptimeRobot.

## Setup Instructions

### 1. Create Discord Application and Bot
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it a name (e.g., "QDine Tracker").
3. Navigate to the **Bot** tab on the left menu.
4. Click **Add Bot**.
5. Under the **Privileged Gateway Intents** section, **ENABLE** the following:
   - Server Members Intent (`GuildMembers`)
   - Presence Intent (`GuildPresences`)
   - Message Content Intent (optional, but good to have)
6. Scroll up and click **Reset Token** to get your `DISCORD_TOKEN`. Keep this secret!
7. Navigate to **OAuth2 -> URL Generator**.
8. Select `bot` and `applications.commands` scopes.
9. Select the following Bot Permissions:
   - Read Messages/View Channels
   - Send Messages
   - Embed Links
   - Read Message History
   - Connect
   - View Channel
10. Copy the generated URL and paste it into your browser to invite the bot to your QDine server.

### 2. Get Discord IDs
You will need several IDs to configure the bot:
- **Client ID**: Found on the General Information page of your Discord Application (`DISCORD_CLIENT_ID`).
- **Guild ID**: Right-click your server icon in Discord and select "Copy Server ID" (`DISCORD_GUILD_ID`).
- **Working Channel ID**: Right-click the dedicated working voice channel and select "Copy Channel ID" (`WORKING_CHANNEL_ID`).
- **Report Channel ID**: Right-click the text channel where reports should be sent and select "Copy Channel ID" (`REPORT_CHANNEL_ID`).

*(Note: To copy IDs in Discord, you must first enable **Developer Mode** in User Settings -> Advanced.)*

### 3. Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Copy `.env.example` to `.env` and fill in the values:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here
   DISCORD_GUILD_ID=your_guild_id_here
   DATABASE_URL="postgresql://user:password@hostname/dbname?sslmode=require"
   WORKING_CHANNEL_ID=your_working_voice_channel_id
   REPORT_CHANNEL_ID=your_report_text_channel_id
   TIMEZONE=Asia/Kolkata
   ```

3. **Initialize Database**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

4. **Run the Bot**
   ```bash
   npm run dev
   ```

### 4. Deploying to Render (Free Web Service)

This bot is designed to run on Render's Free Web Service.

1. Create a new **Web Service** on Render connected to your GitHub repository.
2. Select **Node** as the environment.
3. Build Command: `npm install && npx prisma generate && npx prisma db push`
4. Start Command: `npm start`
5. Add all your environment variables in the Render dashboard (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, etc.).
   - Make sure to set `NODE_ENV=production`.
6. **Important for Production (Neon PostgreSQL)**: The free tier of Render uses an ephemeral filesystem, and Render's free PostgreSQL tier expires after 30 days.
   - Create a free PostgreSQL database on [Neon](https://neon.tech/).
   - Copy the connection string provided by Neon.
   - Set the `DATABASE_URL` in your Render environment variables to the Neon connection string (e.g., `postgresql://...`).

### 5. Configuring UptimeRobot

Render's free tier spins down inactive web services after 15 minutes. To prevent this, the bot runs a small Express server exposing a `/health` endpoint.

1. Go to [UptimeRobot](https://uptimerobot.com/).
2. Create a new **HTTP(s) Monitor**.
3. Set the URL to `https://your-render-app-name.onrender.com/health`.
4. Set the monitoring interval to **5 minutes**.
5. Save the monitor. This will ping the bot every 5 minutes to keep it awake!

## Troubleshooting

- **Bot disconnects**: The bot uses `discord.js`, which automatically handles reconnecting to the Discord gateway. The database state is also reconciled automatically when the bot restarts.
- **Commands aren't showing up**: The bot registers slash commands automatically when it connects. If they don't appear, try kicking the bot and re-inviting it with the correct scopes (`bot` + `applications.commands`).
- **Cannot read properties of undefined (reading 'id')**: Ensure that you have enabled the Privileged Gateway Intents in the Discord Developer Portal.
