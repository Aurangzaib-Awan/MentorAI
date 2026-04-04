import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, BookOpen, CheckCircle, Clock, TrendingUp, RefreshCw, ArrowLeft } from 'lucide-react';
import { projectAPI, courseAPI } from '@/services/api';

const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [projectStats, setProjectStats] = useState({
    completed: 0,
    inProgress: 0,
    all: []
  });
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      if (!user) {
        setError('User not authenticated');
        return;
      }

      // Resolve userId — prefer ObjectId, fall back to sessionStorage
      let userId = user.id || user._id;
      if (!userId) {
        try {
          const cached = JSON.parse(sessionStorage.getItem('user') || '{}');
          userId = cached.id || cached._id;
        } catch (e) {
          console.error('Failed to get userId from session:', e);
        }
      }

      if (!userId) {
        setError('Could not determine user ID');
        return;
      }

      console.log('Dashboard userId:', userId);
      console.log('Dashboard user email:', user.email);

      // ── Fetch projects ────────────────────────────────────────────────────
      try {
        // Pass userId — backend now queries by BOTH userId and session email
        const projectsData = await projectAPI.getUserProjects(userId);
        console.log('✓ All projects from backend:', projectsData);
        const allProjects = projectsData.projects || [];

        const activeProjects = allProjects.filter(p => p.status !== 'pending');
        console.log('✓ Active projects:', activeProjects.length);

        // REPLACE the stats block inside fetchData:
const stats = {
  completed: activeProjects.filter(p =>
    p.status === 'completed' || p.quiz_passed === true
  ).length,

  inProgress: activeProjects.filter(p =>
    // ✅ Exclude anything that's completed — even if status lags behind
    !p.quiz_passed &&
    p.status !== 'completed' &&
    (
      p.status === 'in-progress' ||
      p.status === 'submitted' ||
      p.status === 'approved'
    )
  ).length,

  // ✅ Split into two lists so the table is clean
  all: activeProjects.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
};

        console.log('✓ Completed:', stats.completed, '| In Progress:', stats.inProgress);
        setProjectStats(stats);
      } catch (projErr) {
        console.error('❌ Error fetching projects:', projErr);
        setProjectStats({ completed: 0, inProgress: 0, all: [] });
      }

      // ── Fetch certificates ────────────────────────────────────────────────
      try {
        console.log('📜 Fetching certificates for userId:', userId);
        // Backend now queries by both userId and session email — one call is enough
        const certificatesData = await projectAPI.getCertificates(userId);
        const certs = certificatesData.certificates || [];
        console.log('📜 Certificates found:', certs.length);
        setCertificates(certs);
      } catch (certErr) {
        console.error('❌ Error fetching certificates:', certErr);
        setCertificates([]);
      }

      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'Failed to load dashboard');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(248,250,252)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[rgb(37,99,235)] mx-auto mb-4"></div>
          <p className="text-[rgb(71,85,105)]">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const careerPath = user?.selectedCareer
    ? user.selectedCareer.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    : 'Not Selected';

  return (
    <div className="min-h-screen bg-[rgb(248,250,252)] py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-[rgb(37,99,235)] hover:text-[rgb(29,78,216)] font-semibold mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </button>

        {/* Header */}
        <div className="mb-8 sm:mb-12 flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[rgb(37,99,235)] mb-2">
              Welcome Back, {user?.fullname?.split(' ')[0] || user?.name?.split(' ')[0] || 'User'}!
            </h1>
            <p className="text-[rgb(71,85,105)] text-sm sm:text-base">
              Track your learning progress and achievements
            </p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-[rgb(37,99,235)] hover:bg-[rgb(29,78,216)] disabled:opacity-60 text-white rounded-lg font-semibold transition-all duration-300"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

          {/* Card 1: Career Path */}
          <div className="bg-white rounded-xl border border-[rgb(226,232,240)] p-6 sm:p-8 hover:border-[rgb(37,99,235)] transition-all duration-300 shadow-sm hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-[rgb(37,99,235)]" />
              </div>
              <span className="text-xs font-semibold text-[rgb(148,163,184)] uppercase">Career Path</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[rgb(15,23,42)] mb-2">
              {careerPath}
            </h2>
            <p className="text-[rgb(148,163,184)] text-sm mb-4">
              Your selected career trajectory
            </p>
            <button
              onClick={() => navigate('/skill')}
              className="w-full bg-blue-50 hover:bg-blue-100 text-[rgb(37,99,235)] px-4 py-2 rounded-lg font-semibold transition-colors duration-300 text-sm"
            >
              Change Career
            </button>
          </div>

          {/* Card 2: Project Progress */}
          <div className="bg-white rounded-xl border border-[rgb(226,232,240)] p-6 sm:p-8 hover:border-[rgb(37,99,235)] transition-all duration-300 shadow-sm hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-[rgb(37,99,235)]" />
              </div>
              <span className="text-xs font-semibold text-[rgb(148,163,184)] uppercase">Projects</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[rgb(15,23,42)] mb-2">
              {projectStats.all.length} Total
            </h2>
            <p className="text-[rgb(148,163,184)] text-sm mb-4">
              Projects you're actively tracking
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-[rgb(71,85,105)] mb-1">Completed</p>
                <p className="text-2xl font-bold text-green-600">{projectStats.completed}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-[rgb(71,85,105)] mb-1">In Progress</p>
                <p className="text-2xl font-bold text-amber-600">{projectStats.inProgress}</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/projects')}
              className="w-full bg-blue-50 hover:bg-blue-100 text-[rgb(37,99,235)] px-4 py-2 rounded-lg font-semibold transition-colors duration-300 text-sm"
            >
              View All Projects
            </button>
          </div>

          {/* Card 3: Certificates */}
          <div className="bg-white rounded-xl border border-[rgb(226,232,240)] p-6 sm:p-8 hover:border-[rgb(37,99,235)] transition-all duration-300 shadow-sm hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <Award className="w-6 h-6 text-[rgb(37,99,235)]" />
              </div>
              <span className="text-xs font-semibold text-[rgb(148,163,184)] uppercase">Certificates</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[rgb(15,23,42)] mb-2">
              {certificates.length}
            </h2>
            <p className="text-[rgb(148,163,184)] text-sm mb-4">
              {certificates.length === 1 ? 'certificate earned' : 'certificates earned'}
            </p>

            {/* ✅ Show earned certificates list */}
            {certificates.length > 0 && (
              <div className="space-y-2 mb-4">
                {certificates.map((cert, idx) => (
                  <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-2">
                    <p className="text-xs font-semibold text-green-700 truncate">{cert.project_title}</p>
                    <p className="text-xs text-green-600">Score: {cert.quiz_score}%</p>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => navigate('/projects')}
              className="w-full bg-blue-50 hover:bg-blue-100 text-[rgb(37,99,235)] px-4 py-2 rounded-lg font-semibold transition-colors duration-300 text-sm"
            >
              Earn More Certificates
            </button>
          </div>
        </div>

        {/* Projects Table */}
        {projectStats.all.length > 0 && (
          <div className="bg-white rounded-xl border border-[rgb(226,232,240)] p-6 sm:p-8 shadow-sm">
            <h3 className="text-xl sm:text-2xl font-bold text-[rgb(15,23,42)] mb-6">
              Your Projects
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgb(226,232,240)]">
                    <th className="px-4 py-3 text-left font-semibold text-[rgb(71,85,105)]">Project</th>
                    <th className="px-4 py-3 text-left font-semibold text-[rgb(71,85,105)]">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-[rgb(71,85,105)]">Started</th>
                    <th className="px-4 py-3 text-left font-semibold text-[rgb(71,85,105)]">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {projectStats.all.map((project, idx) => {
                    const isCompleted = project.status === 'completed' || project.quiz_passed === true;
                    const isInProgress = !isCompleted && (
                    project.status === 'in-progress' ||
                    project.status === 'submitted' ||
                    project.status === 'approved'
                    );

                    // ✅ Check if this project has a certificate
                    const hasCert = certificates.some(c => c.project_id === (project._id || project.project_id));
                    return (
                      <tr key={idx} className="border-b border-[rgb(226,232,240)] hover:bg-[rgb(248,250,252)] transition-colors">
                        <td className="px-4 py-3 text-[rgb(15,23,42)] font-medium">
  <div className="flex items-center gap-2">
    {isInProgress ? (
      <button
        onClick={() => navigate(`/projects/${project.project_id || project._id}/workspace`)}
        className="text-[rgb(37,99,235)] hover:text-[rgb(29,78,216)] hover:underline cursor-pointer font-semibold transition-colors"
      >
        {project.project_title || project.title}
      </button>
    ) : (
      <span>{project.project_title || project.title}</span>
    )}
    {hasCert && (
      <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full font-semibold">
        🏆 Certified
      </span>
    )}
  </div>
</td>
                        <td className="px-4 py-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                            isCompleted
                              ? 'bg-green-50 text-green-600'
                              : project.status === 'approved'
                              ? 'bg-blue-50 text-blue-600'
                              : project.status === 'submitted'
                              ? 'bg-purple-50 text-purple-600'
                              : project.status === 'in-progress'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-slate-50 text-slate-600'
                          }`}>
                            {isCompleted
                              ? '✅ Completed'
                              : project.status === 'approved'
                              ? '⏳ Approved (Quiz Pending)'
                              : project.status === 'submitted'
                              ? '📋 Submitted (Mentor Review)'
                              : project.status === 'in-progress'
                              ? '▶️ In Progress'
                              : '⭕ Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[rgb(71,85,105)]">
                          {project.created_at ? new Date(project.created_at).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-4 py-3 text-[rgb(71,85,105)]">
                          {project.completed_at ? new Date(project.completed_at).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;