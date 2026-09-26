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
  }
};
