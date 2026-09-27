import Groq from 'groq-sdk';
import { ENV } from '../config/environment';
import { logger } from '../utils/logger';

// Hardcoded preferred models to avoid making a network request to groq.models.list() every time
const PREFERRED_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b'
];

export const aiService = {
  getGroq() {
    if (!process.env.GROQ_API_KEY) {
      logger.warn('GROQ_API_KEY is missing. AI features will be disabled.');
      return null;
    }
    return new Groq({ 
      apiKey: process.env.GROQ_API_KEY,
      baseURL: process.env.GROQ_BASE_URL || undefined
    });
  },

  async executeWithFallback(prompt: string, systemPrompt: string = '', maxTokens: number = 256, temperature: number = 0.7): Promise<string> {
    const groq = this.getGroq();
    if (!groq) throw new Error("API Key missing");

    const errors: any[] = [];

    for (const modelName of PREFERRED_MODELS) {
      try {
        const messages: any[] = [];
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const result = await groq.chat.completions.create({
          messages: messages,
          model: modelName,
          temperature: temperature,
          max_tokens: maxTokens,
        });
        
        return result.choices[0]?.message?.content || "No response generated.";
      } catch (e: any) {
        errors.push({ model: modelName, error: e.message });
        logger.warn(`Model ${modelName} failed, trying next... Error: ${e.message}`);
      }
    }
    
    throw new Error(`All models failed: ${JSON.stringify(errors)}`);
  },

  async generateStandupMotivation(username: string, yesterday: string, today: string, blockers: string): Promise<string> {
    if (!process.env.GROQ_API_KEY) return `Thanks for the standup, ${username}! Keep up the great work!`;

    try {
      const systemPrompt = `You are 'Tempo', the team's relentless 10x senior developer bot. You run on coffee and energy drinks. You are slightly arrogant about your coding speed but deeply care about the team.
      
RULES:
1. Keep it under 150 characters.
2. Use modern developer slang (e.g., ship it, LGTM, refactor, tech debt).
3. Be highly encouraging but in an intense, hyped-up way.
4. Never sound like a generic AI. No corporate jargon.`;
      
      const prompt = `Developer ${username} submitted their standup.
Yesterday: ${yesterday}
Today: ${today}
Blockers: ${blockers}

Give them a short, hyped-up 1-2 sentence response.`;

      return await this.executeWithFallback(prompt, systemPrompt, 150, 0.8);
    } catch (error) {
      logger.error('Error generating AI motivation:', error);
      return `Thanks for the standup, ${username}! Let's crush it today! 🚀`;
    }
  },

  async answerQuestion(username: string, question: string, dashboardContext: string, chatHistory: string = ''): Promise<string> {
    if (!process.env.GROQ_API_KEY) return "Sorry, my AI features are currently disabled because the API key is missing!";

    try {
      const systemPrompt = `You are 'Tempo', a highly intelligent, 10x developer bot who manages the team. 
You are sharp, slightly sarcastic, but incredibly helpful and deeply analytical. You love shipping code and hate bugs.

TONE & RULES:
1. Speak in a confident, slightly snarky, but deeply helpful tone. Use emojis.
2. Refer to yourself as Tempo. NEVER say "As an AI..." or apologize excessively.
3. You have access to real-time dashboard data (provided below). Use this data to answer questions about who worked the most, who is slacking, or what bugs exist. 
4. Analyze the data when asked (e.g. if asked who is working the hardest, look at the netWorkSeconds).
5. Keep your answer strictly under 150 words. Be direct.
6. You CANNOT perform actions (cannot delete messages, write code, etc).

DASHBOARD DATA & CONTEXT:
${dashboardContext}

RECENT CHAT HISTORY:
${chatHistory}`;

      const prompt = `User ${username} asks: "${question}"`;

      // Use a larger max_tokens for analytical answers and lower temperature for facts
      return await this.executeWithFallback(prompt, systemPrompt, 500, 0.4);
    } catch (error: any) {
      logger.error('Error answering question with AI:', error);
      return `I'm sorry, my brain experienced a glitch! Error: ${error?.message || String(error)}`;
    }
  },

  async generateBugFixCelebration(username: string, bugDescription: string): Promise<string> {
    if (!process.env.GROQ_API_KEY) return `✅ Bug fixed: ${bugDescription}. Great job, ${username}!`;

    try {
      const systemPrompt = `You are 'Tempo', the team's hype-man and 10x senior dev. 
RULES:
1. Keep it under 100 characters.
2. Hype them up for crushing the bug.
3. Use a slight edge of sarcasm (e.g. "Only took you 3 days").`;
      const prompt = `Developer ${username} fixed bug: "${bugDescription}". Give them a 1-sentence hype message.`;

      return await this.executeWithFallback(prompt, systemPrompt, 100, 0.8);
    } catch (error) {
      return `✅ Bug fixed: ${bugDescription}. Great job, ${username}!`;
    }
  }
};
