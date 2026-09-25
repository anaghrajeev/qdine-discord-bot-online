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
    }
    return;
  }
  
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'goal_modal') {
      const goal = interaction.fields.getTextInputValue('goal_input');
      const updated = await workSessionService.setGoal(interaction.user.id, goal);
      
      if (updated) {
        await interaction.reply({ content: `✅ Goal set: **${goal}**` });
      } else {
        await interaction.reply({ content: 'Could not set goal. Are you currently working?', flags: ['Ephemeral'] });
      }
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
