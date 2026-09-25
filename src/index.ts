import { ENV, validateEnv } from './config/environment';
import { logger } from './utils/logger';
import { connectDatabase } from './database/connection';
import { client } from './bot/client';
import { startHealthServer } from './web/healthServer';
import { handleReady } from './bot/events/ready';
import { handleVoiceStateUpdate } from './bot/events/voiceStateUpdate';
import { handlePresenceUpdate } from './bot/events/presenceUpdate';
import { handleInteractionCreate } from './bot/events/interactionCreate';

async function bootstrap() {
  try {
    logger.info('Starting QDine Discord Bot...');
    
    // Validate Environment Variables
    validateEnv();

    // Connect Database
    await connectDatabase();

    // Start Health Server
    startHealthServer();

    // Register Event Listeners
    client.once('ready', () => handleReady(client));
    
    client.on('voiceStateUpdate', handleVoiceStateUpdate);
    client.on('presenceUpdate', handlePresenceUpdate);
    client.on('interactionCreate', handleInteractionCreate);

    client.on('disconnect', () => {
      logger.warn('Bot disconnected from Discord. It will attempt to reconnect automatically.');
    });

    client.on('error', (error) => {
      logger.error('Discord client error', error);
    });

    client.on('warn', (info) => {
      logger.warn(`Discord client warning: ${info}`);
    });

    client.on('debug', (info) => {
      // Very verbose, but necessary to debug login hangs
      console.log(`[DISCORD DEBUG] ${info}`);
    });

    // Login to Discord
    logger.info('Attempting to login to Discord...');
    await client.login(ENV.DISCORD_TOKEN);
    
  } catch (error) {
    logger.error('Failed to start the bot', error);
    process.exit(1);
  }
}

bootstrap();
