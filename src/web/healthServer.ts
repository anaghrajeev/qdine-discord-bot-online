import express from 'express';
import { logger } from '../utils/logger';
import { ENV } from '../config/environment';
import { prisma } from '../database/connection';
import { client } from '../bot/client';

export const startHealthServer = () => {
  const app = express();

  app.get('/', (req, res) => {
    res.send('QDine Discord Bot is running.');
  });

  app.get('/health', async (req, res) => {
    let dbStatus = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (e) {
      dbStatus = 'error';
    }

    const discordStatus = client.isReady() ? 'connected' : 'disconnected';

    res.status(200).json({
      status: 'ok',
      discord: discordStatus,
      database: dbStatus,
      uptime: process.uptime()
    });
  });

  app.get('/status', (req, res) => {
    res.status(200).json({
      status: 'online'
    });
  });

  app.listen(ENV.PORT, () => {
    logger.info(`Health server listening on port ${ENV.PORT}`);
  });
};
