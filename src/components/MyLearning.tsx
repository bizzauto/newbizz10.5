import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Play, Clock, BarChart3, Loader2, GraduationCap, ArrowRight, CheckCircle, Users } from 'lucide-react';
import { coursesAPI } from '../lib/api';

interface EnrolledCourse {
  enrollment: {
    id: string;
    status: string;
    progress: number;
    enrolledAt: string;
    lastAccessedAt?: string;
    completedAt?: string;
  };
  course: {
    id: string;
    name: string;
    description?: string;
    thumbnail?: string;
    price: number;
    currency: string;
    accessType: string;
    totalModules: number;
    totalLessons: number;
  };
}

export default function MyLearning() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEnrolledCourses();
  }, []);

  const loadEnrolledCourses = async () => {
    try {
      setLoading(true);
      const res = await coursesAPI.getMyEnrolled();
      if (res.data.success) {
        setCourses(res.data.data);
      } else {
        setError(res.data.error || 'Failed to load courses');
      }
    } catch {
      setError('Network error loading courses');
    } finally {
      setLoading(false);
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'from-emerald-500 to-green-500';
    if (progress >= 40) return 'from-blue-500 to-blue-600';
    return 'from-yellow-500 to-orange-500';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <GraduationCap size={24} className="text-blue-600" />
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">My Learning</h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400">{courses.length} course{courses.length !== 1 ? 's' : ''} enrolled</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={loadEnrolledCourses} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Retry</button>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No courses yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Enroll in a course to start learning</p>
            <button onClick={() => navigate('/course-store')} className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-xl font-medium hover:shadow-lg transition-all">
              Browse Courses <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {courses.map(({ enrollment, course }) => (
              <div
                key={enrollment.id}
                onClick={() => navigate(`/course-player/${course.id}`)}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all cursor-pointer group"
              >
                <div className="flex flex-col sm:flex-row">
                  {/* Thumbnail */}
                  {course.thumbnail ? (
                    <img src={course.thumbnail} alt={course.name} className="w-full sm:w-48 h-32 sm:h-40 object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-full sm:w-48 h-32 sm:h-40 bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center flex-shrink-0">
                      <GraduationCap size={36} className="text-white/60" />
                    </div>
                  )}

                  <div className="flex-1 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-1 group-hover:text-blue-600 transition-colors">{course.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{course.description || 'No description'}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          enrollment.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                          enrollment.status === 'active' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                          {enrollment.status === 'completed' ? 'Completed' : enrollment.status === 'active' ? 'In Progress' : enrollment.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
                      <span className="flex items-center gap-1"><BookOpen size={14} /> {course.totalModules} modules</span>
                      <span className="flex items-center gap-1"><Play size={14} /> {course.totalLessons} lessons</span>
                      {course.price > 0 && (
                        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">{course.currency} {course.price}</span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-auto">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Progress</span>
                        <span>{Math.round(enrollment.progress)}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(enrollment.progress)} transition-all duration-500`}
                          style={{ width: `${enrollment.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
