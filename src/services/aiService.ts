import { GoogleGenerativeAI } from '@google/generative-ai';
import { ENV } from '../config/environment';
import { logger } from '../utils/logger';

export const aiService = {
  getGenAI() {
    if (!process.env.GEMINI_API_KEY) {
      logger.warn('GEMINI_API_KEY is missing. AI features will be disabled.');
      return null;
    }
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  },

  async generateStandupMotivation(username: string, yesterday: string, today: string, blockers: string): Promise<string> {
    const genAI = this.getGenAI();
    if (!genAI) return `Thanks for the standup, ${username}! Keep up the great work!`;

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `You are a highly encouraging, casual, and energetic team motivator bot for a Discord server.
A developer named ${username} just submitted their daily standup.
Yesterday they did: ${yesterday}
Today they will do: ${today}
Blockers/Issues: ${blockers}

Write a short, 1-2 sentence encouraging response to them. 
If they have a blocker, offer brief sympathy or tell the team to help out. 
Do not be overly formal. Use emojis. Keep it under 150 characters.`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      logger.error('Error generating AI motivation:', error);
      return `Thanks for the standup, ${username}! Let's crush it today! 🚀`;
    }
  },

  async answerQuestion(username: string, question: string, bugContext: string): Promise<string> {
    const genAI = this.getGenAI();
    if (!genAI) return "Sorry, my AI features are currently disabled because the API key is missing!";

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `You are Tempo AI, a highly intelligent and helpful bot for a software development team on Discord.
The user asking the question is named: ${username}.

Here is the current state of the team's bug tracker:
${bugContext}

The user asked: "${question}"

Instructions:
1. Provide the best crafted, most helpful answer.
2. If they ask about bugs, use the context provided.
3. Keep your reply strictly under 100 words. Be concise and direct.
4. Keep the tone friendly and lively.`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      logger.error('Error answering question with AI:', error);
      return "I'm sorry, my brain experienced a glitch while trying to answer that. Please try again later!";
    }
  },

  async generateBugFixCelebration(username: string, bugDescription: string): Promise<string> {
    const genAI = this.getGenAI();
    if (!genAI) return `✅ Bug fixed: ${bugDescription}. Great job, ${username}!`;

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `You are Tempo AI, a hype-man bot for a dev team.
Developer ${username} just completed this bug/task: "${bugDescription}"
Write a 1-sentence public celebration message to hype them up. Use an emoji. Keep it under 100 characters.`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      return `✅ Bug fixed: ${bugDescription}. Great job, ${username}!`;
    }
  }
};
