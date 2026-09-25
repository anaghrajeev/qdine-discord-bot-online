import cron from 'node-cron';
import { Client, TextChannel } from 'discord.js';
import { reportService } from './reportService';
import { ENV } from '../config/environment';
import { logger } from '../utils/logger';
import { formatDurationString, formatDate } from '../utils/time';

export const schedulerService = {
  init(client: Client) {
    if (!ENV.REPORT_CHANNEL_ID) {
      logger.warn('REPORT_CHANNEL_ID not set. Automatic reports are disabled.');
      return;
    }

    // Daily report cron
    const dailyTime = ENV.DAILY_REPORT_TIME.split(':');
    const dailyCron = `${dailyTime[1]} ${dailyTime[0]} * * *`;
    
    cron.schedule(dailyCron, async () => {
      logger.info('Running scheduled daily report...');
      await this.sendDailyReport(client);
    }, {
      timezone: ENV.TIMEZONE
    });

    // Weekly report cron
    const weeklyTime = ENV.WEEKLY_REPORT_TIME.split(':');
    const dayOfWeek = this.getDayOfWeek(ENV.WEEKLY_REPORT_DAY);
    const weeklyCron = `${weeklyTime[1]} ${weeklyTime[0]} * * ${dayOfWeek}`;

    cron.schedule(weeklyCron, async () => {
      logger.info('Running scheduled weekly report...');
      await this.sendWeeklyReport(client);
    }, {
      timezone: ENV.TIMEZONE
    });
    
    logger.info(`Scheduler initialized. Daily at ${ENV.DAILY_REPORT_TIME}, Weekly at ${ENV.WEEKLY_REPORT_TIME} on ${ENV.WEEKLY_REPORT_DAY}`);
  },

  async sendDailyReport(client: Client) {
    try {
      const channel = await client.channels.fetch(ENV.REPORT_CHANNEL_ID) as TextChannel;
      if (!channel) {
        logger.error(`Report channel ${ENV.REPORT_CHANNEL_ID} not found.`);
        return;
      }

      const reports = await reportService.getDailyReport();
      if (reports.length === 0) {
        return; // No work recorded today
      }

      const dateStr = formatDate(new Date());
      let message = `📊 **DAILY WORK REPORT**\n${dateStr}\n\n`;
      let teamTotal = 0;

      for (const report of reports) {
        if (report.netWorkSeconds > 0) {
          message += `🟢 **${report.displayName || report.username}**\n${formatDurationString(report.netWorkSeconds)}\n\n`;
          teamTotal += report.netWorkSeconds;
        }
      }

      message += `────────────────\n\n**Team total:**\n${formatDurationString(teamTotal)}`;

      await channel.send(message);
    } catch (error) {
      logger.error('Failed to send daily report', error);
    }
  },

  async sendWeeklyReport(client: Client) {
    try {
      const channel = await client.channels.fetch(ENV.REPORT_CHANNEL_ID) as TextChannel;
      if (!channel) {
        logger.error(`Report channel ${ENV.REPORT_CHANNEL_ID} not found.`);
        return;
      }

      const reports = await reportService.getWeeklyReport();
      if (reports.length === 0) {
        return;
      }

      let message = `📅 **WEEKLY REPORT**\n\n`;

      for (const report of reports) {
        if (report.netWorkSeconds > 0) {
          message += `**${report.displayName || report.username}**\nTotal: ${formatDurationString(report.netWorkSeconds)}\n\n`;
        }
      }

      await channel.send(message);
    } catch (error) {
      logger.error('Failed to send weekly report', error);
    }
  },

  getDayOfWeek(dayString: string): number {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const index = days.indexOf(dayString.toUpperCase());
    return index !== -1 ? index : 5; // Default to Friday
  }
};
