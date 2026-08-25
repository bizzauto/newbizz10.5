import axios from 'axios';
import { AIService } from './ai.service.js';

/**
 * Course AI Service
 * Generates course descriptions, curriculum outlines, and powers the AI doubt solver.
 * Uses Gemini API as primary provider, falls back to OpenRouter → Nvidia NIM.
 */

interface CurriculumItem {
  title: string;
  description: string;
  duration: string;
  lessons: Array<{ title: string; description: string; type: string }>;
}

interface CourseGenerationResult {
  description: string;
  curriculum: CurriculumItem[];
}

interface DoubtSolverResult {
  answer: string;
  relatedTopics: string[];
}

export class CourseAIService {
  /**
   * Generate course description + curriculum from a course title
   */
  static async generateCourseContent(
    courseTitle: string,
    context?: { targetAudience?: string; difficulty?: string; language?: string }
  ): Promise<CourseGenerationResult> {
    const audience = context?.targetAudience || 'students and professionals';
    const difficulty = context?.difficulty || 'beginner to intermediate';
    const language = context?.language || 'English';

    const systemPrompt = `You are an expert course curriculum designer. Generate a comprehensive course outline.
Course Title: "${courseTitle}"
Target Audience: ${audience}
Difficulty: ${difficulty}
Language: ${language}

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "description": "An SEO-optimized 2-3 sentence course description",
  "curriculum": [
    {
      "title": "Module title",
      "description": "Brief module description",
      "duration": "X hours/minutes",
      "lessons": [
        { "title": "Lesson title", "description": "Lesson description", "type": "video" }
      ]
    }
  ]
}

Generate 4-6 modules with 3-5 lessons each. Make descriptions SEO-friendly and engaging.`;

    const userPrompt = `Create a detailed course outline for: "${courseTitle}"`;

    try {
      // 1) Try Gemini first
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey && geminiKey !== 'your_gemini_api_key') {
        try {
          const result = await this.callGemini(systemPrompt + '\n\n' + userPrompt);
          return this.parseResult(result);
        } catch (geminiError: any) {
          console.warn('[CourseAI] Gemini failed, falling back:', geminiError.message);
        }
      }

      // 2) Try OpenRouter
      try {
        const text = await AIService.generateText(systemPrompt + '\n\n' + userPrompt, {
          model: 'meta-llama/llama-3.1-70b-instruct',
          maxTokens: 3000,
          temperature: 0.7,
          type: 'text',
        });
        return this.parseResult(text);
      } catch (openrouterError: any) {
        console.warn('[CourseAI] OpenRouter failed:', openrouterError.message);
      }

      // 3) Try direct OpenRouter API call as last resort
      const openrouterKey = process.env.OPENROUTER_API_KEY;
      if (openrouterKey) {
        try {
          const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              model: 'google/gemini-flash-1.5',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_tokens: 3000,
              temperature: 0.7,
            },
            {
              headers: {
                Authorization: `Bearer ${openrouterKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://bizzautoai.com',
                'X-Title': 'BizzAuto Courses',
              },
              timeout: 30000,
            }
          );
          return this.parseResult(response.data.choices[0].message.content);
        } catch (err: any) {
          console.warn('[CourseAI] OpenRouter fallback failed:', err.message);
        }
      }

      // Fallback: return basic structure
      return this.getFallbackResult(courseTitle);
    } catch (error: any) {
      console.error('[CourseAI] All providers failed:', error.message);
      return this.getFallbackResult(courseTitle);
    }
  }

  /**
   * AI Doubt Solver - answers student questions with course context
   */
  static async solveDoubt(
    question: string,
    context: {
      courseTitle: string;
      lessonTitle?: string;
      moduleTitle?: string;
      courseContent?: string;
    }
  ): Promise<DoubtSolverResult> {
    const systemPrompt = `You are an expert course tutor assistant. Answer the student's question based on the course context provided.
Be concise, clear, and helpful. Use examples where appropriate.

Course: ${context.courseTitle}
${context.moduleTitle ? `Module: ${context.moduleTitle}` : ''}
${context.lessonTitle ? `Lesson: ${context.lessonTitle}` : ''}
${context.courseContent ? `Course Content: ${context.courseContent.substring(0, 2000)}` : ''}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "answer": "Your detailed answer here, 2-4 paragraphs with practical examples",
  "relatedTopics": ["Related topic 1", "Related topic 2", "Related topic 3"]
}`;

    const userPrompt = `Student Question: "${question}"`;

    try {
      // 1) Try Gemini first
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey && geminiKey !== 'your_gemini_api_key') {
        try {
          const result = await this.callGemini(systemPrompt + '\n\n' + userPrompt);
          return this.parseDoubtResult(result);
        } catch (geminiError: any) {
          console.warn('[CourseAI Doubt] Gemini failed:', geminiError.message);
        }
      }

      // 2) Try AIService
      try {
        const text = await AIService.generateText(systemPrompt + '\n\n' + userPrompt, {
          model: 'meta-llama/llama-3.1-70b-instruct',
          maxTokens: 1000,
          temperature: 0.5,
          type: 'text',
        });
        return this.parseDoubtResult(text);
      } catch (err: any) {
        console.warn('[CourseAI Doubt] AIService failed:', err.message);
      }

      // 3) Try OpenRouter directly
      const openrouterKey = process.env.OPENROUTER_API_KEY;
      if (openrouterKey) {
        try {
          const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              model: 'meta-llama/llama-3.1-8b-instruct:free',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_tokens: 1000,
              temperature: 0.5,
            },
            {
              headers: {
                Authorization: `Bearer ${openrouterKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 20000,
            }
          );
          return this.parseDoubtResult(response.data.choices[0].message.content);
        } catch (err: any) {
          console.warn('[CourseAI Doubt] OpenRouter fallback failed:', err.message);
        }
      }

      return {
        answer: "I'm unable to process your question right now. Please try again later or contact your instructor for clarification.",
        relatedTopics: [],
      };
    } catch (error: any) {
      console.error('[CourseAI Doubt] All providers failed:', error.message);
      return {
        answer: "I'm unable to process your question right now. Please try again later.",
        relatedTopics: [],
      };
    }
  }

  /**
   * Call Gemini API directly via REST
   */
  private static async callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 3000,
          topP: 0.95,
        },
      },
      { timeout: 30000 }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');
    return text;
  }

  /**
   * Parse the AI response into structured course content
   */
  private static parseResult(text: string): CourseGenerationResult {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.description && Array.isArray(parsed.curriculum)) {
          return {
            description: parsed.description,
            curriculum: parsed.curriculum.slice(0, 8), // Max 8 modules
          };
        }
      } catch {
        // Parse failed, use fallback
      }
    }
    return this.getFallbackResult('Course');
  }

  /**
   * Parse doubt solver response
   */
  private static parseDoubtResult(text: string): DoubtSolverResult {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.answer) {
          return {
            answer: parsed.answer,
            relatedTopics: Array.isArray(parsed.relatedTopics) ? parsed.relatedTopics.slice(0, 5) : [],
          };
        }
      } catch {
        // If parsing fails, use the raw text as answer
      }
    }
    return {
      answer: text.replace(/```json|```/g, '').trim(),
      relatedTopics: [],
    };
  }

  /**
   * Fallback result when AI is unavailable
   */
  private static getFallbackResult(courseTitle: string): CourseGenerationResult {
    return {
      description: `Master ${courseTitle} with our comprehensive course. Learn from industry experts with practical examples, hands-on projects, and real-world applications. Perfect for beginners and professionals looking to upskill.`,
      curriculum: [
        {
          title: 'Introduction',
          description: `Overview of ${courseTitle} and key concepts`,
          duration: '1 hour',
          lessons: [
            { title: 'What is this course about?', description: 'Course overview and learning objectives', type: 'video' },
            { title: 'Getting Started', description: 'Prerequisites and setup guide', type: 'video' },
            { title: 'Key Concepts', description: 'Introduction to core concepts', type: 'video' },
          ],
        },
        {
          title: 'Core Fundamentals',
          description: 'Build a strong foundation in the core concepts',
          duration: '2 hours',
          lessons: [
            { title: 'Fundamental Principles', description: 'Learn the essential principles', type: 'video' },
            { title: 'Practical Applications', description: 'Apply concepts to real scenarios', type: 'video' },
            { title: 'Hands-on Exercise', description: 'Practice what you learned', type: 'video' },
            { title: 'Quiz', description: 'Test your understanding', type: 'quiz' },
          ],
        },
        {
          title: 'Advanced Topics',
          description: 'Dive deeper into advanced concepts and techniques',
          duration: '2 hours',
          lessons: [
            { title: 'Advanced Concepts', description: 'Explore advanced topics in depth', type: 'video' },
            { title: 'Case Studies', description: 'Real-world case studies and examples', type: 'video' },
            { title: 'Project Work', description: 'Apply your knowledge to a project', type: 'assignment' },
          ],
        },
        {
          title: 'Final Project & Wrap-up',
          description: 'Complete a capstone project and review key takeaways',
          duration: '1.5 hours',
          lessons: [
            { title: 'Capstone Project', description: 'Build something amazing', type: 'assignment' },
            { title: 'Course Review', description: 'Summary of everything learned', type: 'video' },
            { title: 'Next Steps', description: 'Resources and next learning path', type: 'text' },
          ],
        },
      ],
    };
  }
}

export default CourseAIService;
