import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { CourseAIService } from '../services/course-ai.service.js';
import crypto from 'crypto';

const router = Router();

// Multer for video/image upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024, files: 1 }, // 500MB max
});

// ==================== COURSES ====================

// List courses for business
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '20', search, isPublished, accessType } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { businessId: req.user.businessId };
    if (search) where.name = { contains: search as string, mode: 'insensitive' };
    if (isPublished !== undefined) where.isPublished = isPublished === 'true';
    if (accessType) where.accessType = accessType;

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { modules: true, enrollments: true } },
        },
      }),
      prisma.course.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        courses,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error: any) {
    console.error('Get courses error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch courses', details: error.message });
  }
});

// List published courses (public — for student store)
router.get('/published/list', async (req: any, res: Response) => {
  try {
    const { page = '1', limit = '20', search, businessId } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { isPublished: true, isActive: true };
    if (businessId) where.businessId = businessId;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          thumbnail: true,
          price: true,
          currency: true,
          accessType: true,
          enrollmentCount: true,
          rating: true,
          business: { select: { name: true, logoUrl: true } },
          modules: {
            where: { isPublished: true },
            select: { lessons: { where: { isPublished: true, isFree: true }, select: { id: true } } },
          },
          _count: { select: { modules: true, enrollments: true } },
        },
      }),
      prisma.course.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        courses: courses.map(c => ({
          ...c,
          freeLessonCount: c.modules.reduce((sum, m) => sum + m.lessons.length, 0),
          modules: undefined,
        })),
        pagination: {
          total,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error: any) {
    console.error('List published courses error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch courses', details: error.message });
  }
});

// Public course view (no auth — for student store)
router.get('/public/:courseId', async (req: any, res: Response) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.courseId, isPublished: true, isActive: true },
      include: {
        modules: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              where: { isPublished: true },
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
                duration: true,
                isFree: true,
                order: true,
              },
            },
          },
        },
        business: { select: { name: true, logoUrl: true } },
      },
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    res.json({ success: true, data: course });
  } catch (error: any) {
    console.error('Public course view error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch course', details: error.message });
  }
});

// Get course with modules and lessons
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    res.json({ success: true, data: course });
  } catch (error: any) {
    console.error('Get course error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch course', details: error.message });
  }
});

// Get student view of course (with enrollment + progress)
router.get('/:id/student-view', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, isPublished: true, isActive: true },
      include: {
        modules: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              where: { isPublished: true },
              orderBy: { order: 'asc' },
            },
          },
        },
        business: { select: { name: true, logoUrl: true } },
      },
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    // Check enrollment
    const enrollment = await prisma.courseEnrollment.findFirst({
      where: { courseId: course.id, userId: req.user.id },
    });

    res.json({
      success: true,
      data: {
        ...course,
        isEnrolled: !!enrollment,
        enrollment,
      },
    });
  } catch (error: any) {
    console.error('Student view error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch course', details: error.message });
  }
});

// Create course
router.post('/', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, thumbnail, price, currency, accessType, dripContent, dripInterval, isActive, isPublished } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const validAccessTypes = ['free', 'paid', 'subscription'];
    if (accessType && !validAccessTypes.includes(accessType)) {
      return res.status(400).json({ success: false, error: `Invalid accessType. Must be one of: ${validAccessTypes.join(', ')}` });
    }

    const course = await prisma.course.create({
      data: {
        businessId: req.user.businessId,
        name,
        description,
        thumbnail,
        price: price ?? 0,
        currency: currency || 'INR',
        accessType: accessType || 'free',
        dripContent: dripContent ?? false,
        dripInterval: dripInterval ?? null,
        isActive: isActive ?? true,
        isPublished: isPublished ?? false,
      },
    });

    res.status(201).json({ success: true, data: course });
  } catch (error: any) {
    console.error('Create course error:', error);
    res.status(500).json({ success: false, error: 'Failed to create course', details: error.message });
  }
});

// Update course
router.put('/:id', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.course.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const { name, description, thumbnail, price, currency, accessType, dripContent, dripInterval, isActive, isPublished } = req.body;

    const validAccessTypes = ['free', 'paid', 'subscription'];
    if (accessType && !validAccessTypes.includes(accessType)) {
      return res.status(400).json({ success: false, error: `Invalid accessType. Must be one of: ${validAccessTypes.join(', ')}` });
    }

    const course = await prisma.course.update({
      where: { id: req.params.id },
      data: { name, description, thumbnail, price, currency, accessType, dripContent, dripInterval, isActive, isPublished },
    });

    res.json({ success: true, data: course });
  } catch (error: any) {
    console.error('Update course error:', error);
    res.status(500).json({ success: false, error: 'Failed to update course', details: error.message });
  }
});

// Delete course
router.delete('/:id', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.course.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    await prisma.course.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'Course deleted' });
  } catch (error: any) {
    console.error('Delete course error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete course', details: error.message });
  }
});

// ==================== AI COURSE CONTENT GENERATION ====================

// Generate course description + curriculum using AI
router.post('/ai/generate', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { courseTitle, targetAudience, difficulty, language } = req.body;

    if (!courseTitle) {
      return res.status(400).json({ success: false, error: 'Course title is required' });
    }

    const result = await CourseAIService.generateCourseContent(courseTitle, {
      targetAudience,
      difficulty,
      language,
    });

    res.json({
      success: true,
      data: {
        description: result.description,
        curriculum: result.curriculum,
      },
    });
  } catch (error: any) {
    console.error('AI course generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate course content', details: error.message });
  }
});

// AI Doubt Solver
router.post('/:id/doubt-solver', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { question, lessonTitle, moduleTitle } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, error: 'Question is required' });
    }

    // Get course context
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, isPublished: true, isActive: true },
      select: { id: true, name: true, description: true },
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const result = await CourseAIService.solveDoubt(question, {
      courseTitle: course.name,
      lessonTitle,
      moduleTitle,
      courseContent: course.description || '',
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Doubt solver error:', error);
    res.status(500).json({ success: false, error: 'Failed to solve doubt', details: error.message });
  }
});

// ==================== CLOUDINARY UPLOAD ====================

// Get Cloudinary upload config
router.get('/cloudinary/config', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const config = CloudinaryService.getUploadSignature();
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to get Cloudinary config', details: error.message });
  }
});

// Upload video to Cloudinary
router.post('/upload/video', authenticate, requireRole('OWNER', 'ADMIN'), upload.single('video'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No video file provided' });
    }

    const result = await CloudinaryService.uploadVideo(req.file.buffer, {
      folder: `courses/${req.user.businessId}/videos`,
    });

    res.json({
      success: true,
      data: {
        url: result.secureUrl,
        publicId: result.publicId,
        duration: result.duration,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
      },
    });
  } catch (error: any) {
    console.error('Video upload error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to upload video' });
  }
});

// Upload thumbnail to Cloudinary
router.post('/upload/thumbnail', authenticate, requireRole('OWNER', 'ADMIN'), upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const result = await CloudinaryService.uploadImage(req.file.buffer, {
      folder: `courses/${req.user.businessId}/thumbnails`,
    });

    res.json({
      success: true,
      data: {
        url: result.secureUrl,
        publicId: result.publicId,
        width: result.width,
        height: result.height,
      },
    });
  } catch (error: any) {
    console.error('Thumbnail upload error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to upload thumbnail' });
  }
});

// ==================== COURSE PURCHASE & CHECKOUT ====================

// Create checkout (Razorpay order) for a course
router.post('/:id/checkout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, isPublished: true, isActive: true },
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    if (course.accessType === 'free' || course.price === 0) {
      return res.status(400).json({ success: false, error: 'Free courses can be enrolled directly' });
    }

    // Check if already enrolled
    const existingEnrollment = await prisma.courseEnrollment.findFirst({
      where: { courseId: course.id, userId: req.user.id },
    });

    if (existingEnrollment) {
      return res.status(409).json({ success: false, error: 'Already enrolled in this course' });
    }

    // Create Razorpay order
    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    const amountInPaise = Math.round(course.price * 100);
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: course.currency || 'INR',
      receipt: `course_${course.id}_${Date.now()}`,
      notes: {
        courseId: course.id,
        businessId: course.businessId,
        userId: req.user.id,
        type: 'course_purchase',
      },
    });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        course: {
          id: course.id,
          name: course.name,
          price: course.price,
        },
      },
    });
  } catch (error: any) {
    console.error('Course checkout error:', error);
    res.status(500).json({ success: false, error: 'Failed to create checkout', details: error.message });
  }
});

// Verify payment and enroll
router.post('/:id/purchase/verify', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing payment verification details' });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }

    const course = await prisma.course.findFirst({
      where: { id: req.params.id, isPublished: true, isActive: true },
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    // Create enrollment
    const enrollment = await prisma.courseEnrollment.create({
      data: {
        courseId: course.id,
        businessId: course.businessId,
        userId: req.user.id,
        status: 'active',
        progress: 0,
        enrolledAt: new Date(),
      },
    });

    // Increment enrollment count
    await prisma.course.update({
      where: { id: course.id },
      data: { enrollmentCount: { increment: 1 } },
    });

    res.json({
      success: true,
      data: {
        enrollment,
        message: 'Successfully enrolled in course',
      },
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Already enrolled in this course' });
    }
    console.error('Course purchase verify error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete purchase', details: error.message });
  }
});

// ==================== COURSE MODULES ====================

// Add module to course
router.post('/:id/modules', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
      include: { modules: true },
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const { name, description, isPublished } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const maxOrder = course.modules.length > 0
      ? Math.max(...course.modules.map((m) => m.order))
      : -1;

    const module = await prisma.courseModule.create({
      data: {
        courseId: course.id,
        name,
        description,
        isPublished: isPublished ?? false,
        order: maxOrder + 1,
      },
    });

    res.status(201).json({ success: true, data: module });
  } catch (error: any) {
    console.error('Create course module error:', error);
    res.status(500).json({ success: false, error: 'Failed to create module', details: error.message });
  }
});

// Update module
router.put('/modules/:moduleId', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.courseModule.findFirst({
      where: { id: req.params.moduleId, course: { businessId: req.user.businessId } },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    const { name, description, order, isPublished } = req.body;

    const module = await prisma.courseModule.update({
      where: { id: req.params.moduleId },
      data: { name, description, order, isPublished },
    });

    res.json({ success: true, data: module });
  } catch (error: any) {
    console.error('Update course module error:', error);
    res.status(500).json({ success: false, error: 'Failed to update module', details: error.message });
  }
});

// Delete module
router.delete('/modules/:moduleId', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.courseModule.findFirst({
      where: { id: req.params.moduleId, course: { businessId: req.user.businessId } },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    await prisma.courseModule.delete({ where: { id: req.params.moduleId } });

    res.json({ success: true, message: 'Module deleted' });
  } catch (error: any) {
    console.error('Delete course module error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete module', details: error.message });
  }
});

// ==================== QUIZZES ====================

interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_blank';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  points: number;
}

// Submit quiz attempt - auto-grades and returns results
router.post('/lessons/:lessonId/submit-quiz', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { answers } = req.body;
    
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, error: 'Answers object is required' });
    }

    const lesson = await prisma.courseLesson.findFirst({
      where: { id: req.params.lessonId },
      include: { module: { select: { courseId: true } } },
    });

    if (!lesson) {
      return res.status(404).json({ success: false, error: 'Lesson not found' });
    }

    // Extract quiz from lesson content
    const content = lesson.content as any || {};
    const quiz = content.quiz;
    
    if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      return res.status(400).json({ success: false, error: 'No quiz found in this lesson' });
    }

    const questions: QuizQuestion[] = quiz.questions;
    let score = 0;
    let totalPoints = 0;
    const results: Array<{
      questionId: string;
      question: string;
      correctAnswer: string;
      userAnswer: string;
      isCorrect: boolean;
      pointsEarned: number;
      explanation?: string;
    }> = [];

    for (const q of questions) {
      totalPoints += q.points || 1;
      const userAnswer = (answers[q.id] || '').trim();
      const isCorrect = userAnswer.toLowerCase() === (q.correctAnswer || '').trim().toLowerCase();
      const pointsEarned = isCorrect ? (q.points || 1) : 0;
      if (isCorrect) score += pointsEarned;

      results.push({
        questionId: q.id,
        question: q.question,
        correctAnswer: q.correctAnswer,
        userAnswer,
        isCorrect,
        pointsEarned,
        explanation: q.explanation,
      });
    }

    const passingScore = quiz.passingScore || 70;
    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const passed = percentage >= passingScore;

    // Store attempt result in lesson content or return it
    res.json({
      success: true,
      data: {
        score,
        totalPoints,
        percentage,
        passingScore,
        passed,
        totalQuestions: questions.length,
        correctCount: results.filter(r => r.isCorrect).length,
        results,
      },
    });
  } catch (error: any) {
    console.error('Quiz submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to grade quiz', details: error.message });
  }
});

// Get quiz attempts for a lesson
router.get('/lessons/:lessonId/quiz-attempts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const lesson = await prisma.courseLesson.findFirst({
      where: { id: req.params.lessonId },
    });

    if (!lesson) {
      return res.status(404).json({ success: false, error: 'Lesson not found' });
    }

    // For now, return empty attempts (no persistent storage yet)
    // In future, add CourseQuizAttempt model
    res.json({
      success: true,
      data: { attempts: [], lessonId: lesson.id },
    });
  } catch (error: any) {
    console.error('Get quiz attempts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch attempts', details: error.message });
  }
});

// ==================== COURSE LESSONS ====================

// Add lesson to module
router.post('/modules/:moduleId/lessons', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const existingModule = await prisma.courseModule.findFirst({
      where: { id: req.params.moduleId, course: { businessId: req.user.businessId } },
      include: { lessons: true },
    });

    if (!existingModule) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    const { title, description, type, content, duration, videoUrl, isFree, isPublished } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const validTypes = ['video', 'text', 'quiz', 'assignment', 'download'];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    const maxOrder = existingModule.lessons.length > 0
      ? Math.max(...existingModule.lessons.map((l) => l.order))
      : -1;

    const lessonData: any = {
      moduleId: existingModule.id,
      title,
      description,
      type: type || 'text',
      content: { ...(content || {}), ...(videoUrl ? { videoUrl } : {}) },
      duration: duration ?? null,
      isFree: isFree ?? false,
      isPublished: isPublished ?? false,
      order: maxOrder + 1,
    };

    const lesson = await prisma.courseLesson.create({ data: lessonData });

    res.status(201).json({ success: true, data: lesson });
  } catch (error: any) {
    console.error('Create course lesson error:', error);
    res.status(500).json({ success: false, error: 'Failed to create lesson', details: error.message });
  }
});

// Update lesson
router.put('/lessons/:lessonId', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.courseLesson.findFirst({
      where: { id: req.params.lessonId, module: { course: { businessId: req.user.businessId } } },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lesson not found' });
    }

    const { title, description, type, content, duration, videoUrl, order, isFree, isPublished } = req.body;

    const validTypes = ['video', 'text', 'quiz', 'assignment', 'download'];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    const updatedContent = { ...(existing.content as any || {}), ...(content || {}) };
    if (videoUrl) updatedContent.videoUrl = videoUrl;

    const lesson = await prisma.courseLesson.update({
      where: { id: req.params.lessonId },
      data: { title, description, type, content: updatedContent, duration, order, isFree, isPublished },
    });

    res.json({ success: true, data: lesson });
  } catch (error: any) {
    console.error('Update course lesson error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lesson', details: error.message });
  }
});

// Delete lesson
router.delete('/lessons/:lessonId', authenticate, requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.courseLesson.findFirst({
      where: { id: req.params.lessonId, module: { course: { businessId: req.user.businessId } } },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lesson not found' });
    }

    await prisma.courseLesson.delete({ where: { id: req.params.lessonId } });

    res.json({ success: true, message: 'Lesson deleted' });
  } catch (error: any) {
    console.error('Delete course lesson error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete lesson', details: error.message });
  }
});

// ==================== ENROLLMENTS ====================

// Enroll user in course (direct — for free courses)
router.post('/:id/enroll', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, isPublished: true, isActive: true },
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    // Check if already enrolled
    const existingEnrollment = await prisma.courseEnrollment.findFirst({
      where: { courseId: course.id, userId: req.user.id },
    });

    if (existingEnrollment) {
      return res.status(409).json({ success: false, error: 'Already enrolled in this course' });
    }

    const enrollment = await prisma.courseEnrollment.create({
      data: {
        courseId: course.id,
        businessId: course.businessId,
        userId: req.user.id,
        status: 'active',
        progress: 0,
        enrolledAt: new Date(),
      },
    });

    await prisma.course.update({
      where: { id: course.id },
      data: { enrollmentCount: { increment: 1 } },
    });

    res.status(201).json({ success: true, data: enrollment });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Already enrolled' });
    }
    console.error('Enroll error:', error);
    res.status(500).json({ success: false, error: 'Failed to enroll', details: error.message });
  }
});

// List enrollments for course
router.get('/:id/enrollments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const { page = '1', limit = '20', status } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { courseId: course.id };
    if (status) where.status = status;

    const [enrollments, total] = await Promise.all([
      prisma.courseEnrollment.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { enrolledAt: 'desc' },
        include: {} as any,
      }),
      prisma.courseEnrollment.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        enrollments,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error: any) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch enrollments', details: error.message });
  }
});

// Get student's enrolled courses
router.get('/my/enrolled', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { userId: req.user.id },
      include: {
        course: {
          include: {
            _count: { select: { modules: true } },
            modules: {
              where: { isPublished: true },
              select: {
                lessons: {
                  where: { isPublished: true },
                  select: { id: true, type: true },
                },
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    // Calculate total lessons per course
    const data = enrollments.map(e => {
      const totalLessons = e.course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
      return {
        enrollment: {
          id: e.id,
          status: e.status,
          progress: e.progress,
          enrolledAt: e.enrolledAt,
          lastAccessedAt: e.lastAccessedAt,
          completedAt: e.completedAt,
        },
        course: {
          id: e.course.id,
          name: e.course.name,
          description: e.course.description,
          thumbnail: e.course.thumbnail,
          price: e.course.price,
          currency: e.course.currency,
          accessType: e.course.accessType,
          totalModules: e.course._count.modules,
          totalLessons,
        },
      };
    });

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('My enrolled courses error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch enrolled courses', details: error.message });
  }
});

// Update enrollment progress
router.patch('/enrollments/:enrollmentId/progress', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.courseEnrollment.findFirst({
      where: { id: req.params.enrollmentId, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Enrollment not found' });
    }

    const { progress, status } = req.body;

    const validStatuses = ['active', 'completed', 'expired', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    if (progress !== undefined && (progress < 0 || progress > 100)) {
      return res.status(400).json({ success: false, error: 'Progress must be between 0 and 100' });
    }

    const updateData: any = { lastAccessedAt: new Date() };
    if (progress !== undefined) updateData.progress = progress;
    if (status) {
      updateData.status = status;
      if (status === 'completed') updateData.completedAt = new Date();
    }

    const enrollment = await prisma.courseEnrollment.update({
      where: { id: req.params.enrollmentId },
      data: updateData,
    });

    res.json({ success: true, data: enrollment });
  } catch (error: any) {
    console.error('Update enrollment progress error:', error);
    res.status(500).json({ success: false, error: 'Failed to update progress', details: error.message });
  }
});

export default router;
