import cron from 'node-cron';
import { Client, TextChannel } from 'discord.js';
import { reportService } from './reportService';
import { prisma } from '../database/connection';
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
    
    // Daily Standup cron (10:00 AM Monday-Saturday)
    cron.schedule('0 10 * * 1-6', async () => {
      logger.info('Running scheduled daily standup prompt...');
      await this.sendStandupPrompt(client);
    }, {
      timezone: ENV.TIMEZONE
    });
    
    // CRM Follow-up cron (Every 10 minutes)
    cron.schedule('*/10 * * * *', async () => {
      await this.sendLeadFollowups(client);
    });
    
    // Daily Bug Reminders cron (6:00 PM every day)
    cron.schedule('0 18 * * *', async () => {
      logger.info('Running scheduled daily bug reminders...');
      await this.sendDailyBugReminders(client);
    }, {
      timezone: ENV.TIMEZONE
    });
    
    logger.info(`Scheduler initialized. Daily at ${ENV.DAILY_REPORT_TIME}, Weekly at ${ENV.WEEKLY_REPORT_TIME} on ${ENV.WEEKLY_REPORT_DAY}, Scrum at 10:00 AM, Bug Reminders at 6:00 PM`);
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
  },

  async sendStandupPrompt(client: Client) {
    try {
      const channel = await client.channels.fetch(ENV.REPORT_CHANNEL_ID) as TextChannel;
      if (!channel) return;

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('submit_standup')
            .setLabel('📝 Submit Standup')
            .setStyle(ButtonStyle.Success),
        );

      await channel.send({
        content: `🌅 **Good morning @everyone! It's time for our Daily Stand-up!**\n\nPlease click the button below to answer the 3 standard questions:\n1️⃣ What did you do yesterday?\n2️⃣ What are you doing today?\n3️⃣ Any blockers?`,
        components: [row]
      });
    } catch (error) {
      logger.error('Failed to send standup prompt', error);
    }
  },

  async sendLeadFollowups(client: Client) {
    try {
      const now = new Date();
      const leadsToFollowUp = await prisma.lead.findMany({
        where: {
          followup_date: { lte: now },
          followup_sent: false,
          status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] }
        },
        include: { owner: true }
      });

      for (const lead of leadsToFollowUp) {
        try {
          const user = await client.users.fetch(lead.owner.discord_user_id);
          if (user) {
            await user.send(`🔔 **Lead Follow-up Reminder!**\n\nIt's time to follow up with **${lead.client_name}** (${lead.company || 'No Company'}).\n**Notes:** ${lead.notes || 'None'}`);
            await prisma.lead.update({
              where: { id: lead.id },
              data: { followup_sent: true }
            });
          }
        } catch (e) {
          logger.error(`Failed to DM user ${lead.owner.discord_user_id} for lead ${lead.id}`, e);
        }
      }
    } catch (error) {
      logger.error('Failed to process lead follow-ups', error);
    }
  },

  async sendDailyBugReminders(client: Client) {
    try {
      const channel = await client.channels.fetch(ENV.REPORT_CHANNEL_ID) as TextChannel;
      if (!channel) return;

      const openBugs = await prisma.bug.findMany({
        where: { status: { notIn: ['COMPLETED'] } },
        include: { assignee: true }
      });

      if (openBugs.length === 0) return;

      const bugsByAssignee = new Map<string, any[]>();
      let unassignedBugs: any[] = [];
      
      openBugs.forEach((bug: any) => {
        if (!bug.assignee) {
          unassignedBugs.push(bug);
          return;
        }
        const userId = bug.assignee.discord_user_id;
        if (!bugsByAssignee.has(userId)) {
          bugsByAssignee.set(userId, []);
        }
        bugsByAssignee.get(userId)!.push(bug);
      });

      let message = `🐛 **DAILY BUG REMINDERS (6:00 PM)** 🐛\n\n`;
      bugsByAssignee.forEach((bugs, discordUserId) => {
        message += `<@${discordUserId}> You have **${bugs.length}** open bugs:\n`;
        bugs.forEach(b => {
          message += `- Bug #${b.id}: ${b.description} [${b.status}]\n`;
        });
        message += `\n`;
      });
      
      if (unassignedBugs.length > 0) {
        message += `⚠️ **Unassigned Bugs:**\n`;
        unassignedBugs.forEach(b => {
          message += `- Bug #${b.id}: ${b.description} [${b.status}]\n`;
        });
      }

      await channel.send({ content: message });
    } catch (error) {
      logger.error('Failed to send bug reminders', error);
    }
  }
};
