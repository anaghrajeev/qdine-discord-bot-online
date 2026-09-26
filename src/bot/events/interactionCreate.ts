import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ModalActionRowComponentBuilder } from 'discord.js';
import { workSessionService } from '../../services/workSessionService';
import { reportService } from '../../services/reportService';
import { formatDurationString } from '../../utils/time';
import { logger } from '../../utils/logger';
import { ENV } from '../../config/environment';

export const handleInteractionCreate = async (interaction: Interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('set_goal_')) {
      const targetUserId = interaction.customId.replace('set_goal_', '');
      
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: 'You can only set your own goals!', flags: ['Ephemeral'] });
        return;
      }
      
      const modal = new ModalBuilder()
        .setCustomId('goal_modal')
        .setTitle('Set Focus Goal');
        
      const goalInput = new TextInputBuilder()
        .setCustomId('goal_input')
        .setLabel("What's your main focus?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);
        
      const firstActionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(goalInput);
      modal.addComponents(firstActionRow);
      
      await interaction.showModal(modal);
    } else if (interaction.customId === 'submit_standup') {
      const modal = new ModalBuilder()
        .setCustomId('standup_modal')
        .setTitle('Daily Stand-up');
        
      const yesterdayInput = new TextInputBuilder()
        .setCustomId('yesterday_input')
        .setLabel("What did you do yesterday?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(300);

      const todayInput = new TextInputBuilder()
        .setCustomId('today_input')
        .setLabel("What are you doing today?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(300);

      const blockersInput = new TextInputBuilder()
        .setCustomId('blockers_input')
        .setLabel("Any blockers?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder("None")
        .setMaxLength(200);
        
      modal.addComponents(
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(yesterdayInput),
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(todayInput),
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(blockersInput)
      );
      
      await interaction.showModal(modal);
    }
    return;
  }
  
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'goal_modal') {
      const goal = interaction.fields.getTextInputValue('goal_input');
      const updated = await workSessionService.setGoal(interaction.user.id, goal);
      
      if (updated) {
        await interaction.reply({ content: `✅ Goal set: **${goal}**`, flags: ['Ephemeral'] });
      } else {
        await interaction.reply({ content: 'Could not set goal. Are you currently working?', flags: ['Ephemeral'] });
      }
    } else if (interaction.customId === 'standup_modal') {
      const yesterday = interaction.fields.getTextInputValue('yesterday_input');
      const today = interaction.fields.getTextInputValue('today_input');
      const blockers = interaction.fields.getTextInputValue('blockers_input') || 'None';
      
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      // Ensure user exists
      await prisma.user.upsert({
        where: { discord_user_id: interaction.user.id },
        update: { username: interaction.user.username, display_name: (interaction.member as any)?.displayName },
        create: {
          discord_user_id: interaction.user.id,
          username: interaction.user.username,
          display_name: (interaction.member as any)?.displayName,
        }
      });
      
      const user = await prisma.user.findUnique({ where: { discord_user_id: interaction.user.id }});
      
      await prisma.standup.create({
        data: {
          user_id: user.id,
          yesterday,
          today,
          blockers
        }
      });
      
      // Reply to interaction so the user knows it succeeded
      await interaction.reply({ content: '✅ Your stand-up has been submitted!', flags: ['Ephemeral'] });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    if (commandName === 'work') {
      const activeSession = await workSessionService.getActiveSession(userId);
      const todayReport = await reportService.getUserTodayReport(userId);
      
      let message = `🟢 **WORK STATUS**\n\nUser: ${username}\n\n`;
      
      if (activeSession) {
        const currentSessionSeconds = Math.floor((new Date().getTime() - activeSession.start_time.getTime()) / 1000);
        message += `Status: Working\nStarted: <t:${Math.floor(activeSession.start_time.getTime() / 1000)}:t>\nCurrent session: ${formatDurationString(currentSessionSeconds)}\n`;
        if (activeSession.goal) {
          message += `🎯 Focus: **${activeSession.goal}**\n\n`;
        } else {
          message += `\n`;
        }
      } else {
        message += `Status: Not working right now\n\n`;
      }
      
      if (todayReport) {
        message += `Today's total: ${formatDurationString(todayReport.netWorkSeconds)}`;
      } else {
        message += `Today's total: 0s`;
      }
      
      await interaction.reply({ content: message, ephemeral: true });
    } 
    
    else if (commandName === 'today') {
      const todayReport = await reportService.getUserTodayReport(userId);
      
      let message = `📊 **TODAY**\n\n${username}\n`;
      if (todayReport) {
        message += `Working: ${formatDurationString(todayReport.netWorkSeconds)}\n`;
        message += `Sessions: ${todayReport.sessionCount}\n`;
        message += `Breaks: ${formatDurationString(todayReport.totalBreakSeconds)}`;
      } else {
        message += `Working: 0s\nSessions: 0\nBreaks: 0s`;
      }
      
      await interaction.reply({ content: message, ephemeral: true });
    }
    
    else if (commandName === 'week') {
      const weeklyReports = await reportService.getWeeklyReport();
      const myReport = weeklyReports.find(r => r.discordUserId === userId);
      
      let message = `📅 **THIS WEEK**\n\n`;
      if (myReport) {
        message += `Total: ${formatDurationString(myReport.netWorkSeconds)}\n`;
        message += `Sessions: ${myReport.sessionCount}`;
      } else {
        message += `Total: 0s\nSessions: 0`;
      }
      
      await interaction.reply({ content: message, ephemeral: true });
    }
    
    else if (commandName === 'status') {
      // Defer reply since fetching status might take a bit
      await interaction.deferReply({ ephemeral: true });
      
      const reports = await reportService.getDailyReport();
      let message = `🟢 **CURRENT TEAM STATUS**\n\n**Working**\n`;
      let hasWorking = false;
      
      for (const report of reports) {
        const activeSession = await workSessionService.getActiveSession(report.discordUserId);
        if (activeSession) {
          const currentSessionSeconds = Math.floor((new Date().getTime() - activeSession.start_time.getTime()) / 1000);
          message += `• ${report.displayName || report.username} — ${formatDurationString(currentSessionSeconds)}`;
          if (activeSession.goal) {
            message += ` *(Focus: ${activeSession.goal})*\n`;
          } else {
            message += `\n`;
          }
          hasWorking = true;
        }
      }
      
      if (!hasWorking) {
        message += `• No one is currently working.\n`;
      }
      
      await interaction.editReply({ content: message });
    }
    
    else if (commandName === 'leaderboard') {
      const { reportService } = require('../../services/reportService');
      const { formatDurationString } = require('../../utils/time');
      const reports = await reportService.getWeeklyReport();
      
      if (reports.length === 0) {
        await interaction.reply({ content: 'No work has been logged this week yet!', flags: ['Ephemeral'] });
        return;
      }
      
      reports.sort((a: any, b: any) => b.netWorkSeconds - a.netWorkSeconds);
      
      const medals = ['🥇', '🥈', '🥉'];
      let leaderboardText = `🏆 **Weekly Productivity Leaderboard** 🏆\n\n`;
      
      for (let i = 0; i < reports.length; i++) {
        if (reports[i].netWorkSeconds <= 0) continue;
        
        const rank = i < 3 ? medals[i] : `**#${i + 1}**`;
        leaderboardText += `${rank} **${reports[i].displayName || reports[i].username}**: ${formatDurationString(reports[i].netWorkSeconds)}\n`;
      }
      
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const settings = await prisma.settings.findFirst();
      if (settings?.monthly_reward) {
        leaderboardText += `\n🎁 *Monthly Top Performer Reward: ${settings.monthly_reward}*`;
      }
      
      await interaction.reply({ content: leaderboardText });
    }
    
    else if (commandName === 'guide') {
      const guideText = `🤖 **Tempo - Quick Guide**\n\n` +
        `**How to use:**\n` +
        `1️⃣ **Start Working**: Join the \`🔊 working\` voice channel. Your timer starts automatically.\n` +
        `2️⃣ **Set a Goal**: When you join, click the **[🎯 Set Focus Goal]** button in the \`💬 work-reports\` channel to tell the team what you're working on.\n` +
        `3️⃣ **Take a Break**: If you need to step away for 5+ minutes, Discord will move you to the \`🔊 break-room\` automatically. Or, you can manually join it. Your timer will pause.\n` +
        `4️⃣ **Finish Working**: Disconnect from the voice channel entirely. Your session is saved!\n\n` +
        `**Commands:**\n` +
        `\`/work\` - Check your own active session and goal\n` +
        `\`/today\` - Check your total hours for today\n` +
        `\`/week\` - Check your total hours for this week\n` +
        `\`/status\` - See who is currently working and what their goals are`;
        
      await interaction.reply({ content: guideText, flags: ['Ephemeral'] });
    }
    
    else if (commandName === 'dashboard') {
      const channel = interaction.channel;
      // Strictly enforce that this command MUST be run inside the Admin Category
      const isInsideAdminCategory = (channel && 'parentId' in channel && channel.parentId === ENV.ADMIN_CATEGORY_ID);
                      
      if (!isInsideAdminCategory) {
        await interaction.reply({ content: '🚫 You must run this command inside the restricted Admin category.', flags: ['Ephemeral'] });
        return;
      }
      
      const dashboardLink = 'https://qdine-work-dashboard.vercel.app'; // Placeholder link
      await interaction.reply({ 
        content: `📊 **QDine Admin Dashboard**\n\nAccess the dashboard here to view team analytics, export payroll CSVs, and manage schedules:\n🔗 ${dashboardLink}`, 
        flags: ['Ephemeral'] 
      });
    }

    else if (commandName === 'assign') {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const targetUser = interaction.options.getUser('user', true);
      const description = interaction.options.getString('description', true);
      
      // Ensure reporter exists
      await prisma.user.upsert({
        where: { discord_user_id: interaction.user.id },
        update: { username: interaction.user.username, display_name: (interaction.member as any)?.displayName },
        create: { discord_user_id: interaction.user.id, username: interaction.user.username, display_name: (interaction.member as any)?.displayName }
      });
      
      // Ensure assignee exists
      await prisma.user.upsert({
        where: { discord_user_id: targetUser.id },
        update: { username: targetUser.username },
        create: { discord_user_id: targetUser.id, username: targetUser.username, display_name: targetUser.username }
      });
      
      const reporter = await prisma.user.findUnique({ where: { discord_user_id: interaction.user.id }});
      const assignee = await prisma.user.findUnique({ where: { discord_user_id: targetUser.id }});
      
      const bug = await prisma.bug.create({
        data: {
          description,
          assignee_id: assignee!.id,
          reporter_id: reporter!.id,
          status: 'OPEN'
        }
      });
      
      await interaction.reply({ content: `✅ Bug **#${bug.id}** assigned to <@${targetUser.id}>!\n**Description:** ${description}` });
    }
    
    else if (commandName === 'bugs') {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const user = await prisma.user.findUnique({ where: { discord_user_id: interaction.user.id }});
      if (!user) {
        await interaction.reply({ content: 'You have no assigned bugs.', flags: ['Ephemeral'] });
        return;
      }
      
      const bugs = await prisma.bug.findMany({
        where: { assignee_id: user.id, status: 'OPEN' },
        orderBy: { created_at: 'asc' }
      });
      
      if (bugs.length === 0) {
        await interaction.reply({ content: '🎉 You have no open bugs!', flags: ['Ephemeral'] });
        return;
      }
      
      let message = `🐛 **Your Open Bugs** 🐛\n\n`;
      bugs.forEach((b: any) => {
        message += `**#${b.id}** - ${b.description}\n`;
      });
      message += `\nUse \`/fix <id>\` to mark a bug as fixed.`;
      
      await interaction.reply({ content: message, flags: ['Ephemeral'] });
    }
    
    else if (commandName === 'fix') {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const bugIdStr = interaction.options.getString('id', true);
      const bugId = parseInt(bugIdStr, 10);
      
      if (isNaN(bugId)) {
        await interaction.reply({ content: 'Invalid bug ID.', flags: ['Ephemeral'] });
        return;
      }
      
      const user = await prisma.user.findUnique({ where: { discord_user_id: interaction.user.id }});
      if (!user) {
        await interaction.reply({ content: 'User not found.', flags: ['Ephemeral'] });
        return;
      }
      
      const bug = await prisma.bug.findUnique({ where: { id: bugId } });
      if (!bug) {
        await interaction.reply({ content: `Bug #${bugId} not found.`, flags: ['Ephemeral'] });
        return;
      }
      
      if (bug.assignee_id !== user.id) {
        await interaction.reply({ content: `Bug #${bugId} is not assigned to you!`, flags: ['Ephemeral'] });
        return;
      }
      
      if (bug.status === 'COMPLETED') {
        await interaction.reply({ content: `Bug #${bugId} is already completed!`, flags: ['Ephemeral'] });
        return;
      }
      
      await prisma.bug.update({
        where: { id: bugId },
        data: { status: 'COMPLETED' }
      });
      
      await interaction.reply({ content: `✅ Bug **#${bugId}** has been marked as completed! Great job!` });
    }
    
    else if (commandName === 'purge') {
      const isAdmin = interaction.memberPermissions && interaction.memberPermissions.has('Administrator');
      if (!isAdmin) {
        await interaction.reply({ content: '🚫 You do not have permission to use this command.', flags: ['Ephemeral'] });
        return;
      }
      
      const amount = interaction.options.getInteger('amount', true);
      const channel = interaction.channel;
      
      if (!channel || !('bulkDelete' in channel)) {
        await interaction.reply({ content: '🚫 Cannot purge messages in this type of channel.', flags: ['Ephemeral'] });
        return;
      }
      
      try {
        const deleted = await channel.bulkDelete(amount, true);
        await interaction.reply({ content: `✅ Successfully deleted ${deleted.size} messages.`, flags: ['Ephemeral'] });
      } catch (err) {
        await interaction.reply({ content: '❌ Failed to delete messages. Messages older than 14 days cannot be bulk deleted by bots.', flags: ['Ephemeral'] });
      }
    }
  } catch (error) {
    logger.error(`Error executing command ${commandName}`, error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true });
    }
  }
};
