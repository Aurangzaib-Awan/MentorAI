// components/ProjectDetail.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Clock, Users, ChevronRight, BookOpen, ArrowLeft, Award, CheckCircle, Clock as ClockIcon, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import { projectAPI } from '../../services/api';

const ProjectDetail = ({ user }) => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userProjectId, setUserProjectId] = useState(null);

  // ── Certificate / progress state ──────────────────────────────────────────
  const [certificate, setCertificate]       = useState(null);
  const [certLoading, setCertLoading]       = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [projectData, setProjectData]       = useState(null);
  const [showProgress, setShowProgress]     = useState(false);

  const renderMarkdown = (text) => {
    if (!text) return '';
    return text
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-[rgb(15,23,42)] mt-6 mb-3">$1</h3>')
      .replace(/^## (.*$)/gim,  '<h2 class="text-xl font-bold text-[rgb(15,23,42)] mt-7 mb-4">$1</h2>')
      .replace(/^# (.*$)/gim,   '<h1 class="text-2xl font-bold text-[rgb(15,23,42)] mt-8 mb-5">$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-bold text-[rgb(15,23,42)]">$1</strong>')
      .replace(/\*(.*?)\*/gim,     '<em class="italic text-[rgb(71,85,105)]">$1</em>')
      .replace(/^- (.*$)/gim,   '<li class="ml-6 text-[rgb(71,85,105)] mb-1">$1</li>')
      .replace(/(<li.*?<\/li>)/gims, '<ul class="list-disc mb-4">$1</ul>')
      .replace(/\n\n/g, '</p><p class="mb-4">')
      .replace(/\n/g,   '<br>')
      .replace(/`(.*?)`/g, '<code class="bg-[rgb(241,245,249)] px-2 py-1 rounded text-sm font-mono text-[rgb(37,99,235)]">$1</code>')
      .replace(/^(?!<[hu])(.*)$/gim, '<p class="mb-4 text-[rgb(71,85,105)] leading-relaxed">$1</p>');
  };

  const userId = user?.id || user?._id || (() => {
    try { return JSON.parse(sessionStorage.getItem('user') || '{}')?.id; } catch { return null; }
  })();

  // ── Fetch curated project ─────────────────────────────────────────────────
  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true);
        const response = await projectAPI.getProjects();
        const projectsArray = response.projects || response.data || response || [];

        let foundProject = projectsArray.find(p => {
          const id_str = String(p.id || p._id || '');
          return id_str === projectId || (p.id && p.id.toString && p.id.toString() === projectId);
        });

        if (!foundProject) {
          try {
            const userProj = await projectAPI.getUserProject(projectId);
            if (userProj?.title) {
              foundProject = projectsArray.find(p => p.title === userProj.title);
              if (userProj) setUserProjectId(projectId);
            }
          } catch (fallbackErr) {
            console.error('Fallback user project fetch failed:', fallbackErr);
          }
        }

        if (!foundProject) throw new Error('Project not found');
        setProject(foundProject);
      } catch (err) {
        setError('Failed to load project details. Please try again later.');
        console.error('Error fetching project:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  // ── Find existing user project ────────────────────────────────────────────
  useEffect(() => {
    if (!user || !project) return;
    const findExistingUserProject = async () => {
      try {
        const uid = user.id || user._id;
        if (!uid) return;
        const data = await projectAPI.getUserProjects(uid);
        const projects = data.projects || [];
        const match = projects.find(p => p.title === project.title);
        if (match) {
          const id = match._id || match.project_id;
          setUserProjectId(id);
          console.log('✅ Found existing user project id:', id);
        }
      } catch (err) {
        console.warn('Could not find existing user project:', err);
      }
    };
    findExistingUserProject();
  }, [user, project]);

  // ── Fetch ALL progress data (cert + project + submission) ─────────────────
  // ✅ FIX: extracted into useCallback so both useEffect and refresh button
  //         call the exact same logic — no stale submission status on refresh
  const fetchAllProgress = useCallback(async () => {
    if (!userId || !userProjectId) return;
    setCertLoading(true);
    try {
      // 1. Certificate check
      const certData = await projectAPI.getCertificates(userId);
      const certs    = certData.certificates || [];
      const match    = certs.find(c => c.project_id === userProjectId);
      if (match) {
        setCertificate(match);
        setCertLoading(false);
        return;
      }

      // 2. Project data (quiz status)
      try {
        const projData = await projectAPI.getUserProject(userProjectId);
        setProjectData(projData);
      } catch (err) {
        console.error('Failed to fetch project data:', err);
      }

      // 3. ✅ FIX: Always fetch LATEST submission — sort by submitted_at desc
      //    so after resubmission we pick the new "pending" not the old "rejected"
      const subRes  = await fetch(`http://localhost:8000/api/submissions`, { credentials: 'include' });
      const subData = await subRes.json();
      const subs    = (subData.submissions || [])
        .filter(s => s.user_id === userId && s.project_id === userProjectId)
        .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)); // newest first

      if (subs.length > 0) {
        setSubmissionStatus(subs[0].status); // ✅ always use the most recent submission
        console.log('Latest submission status:', subs[0].status, '— submitted:', subs[0].submitted_at);
      } else {
        setSubmissionStatus(null);
      }

    } catch (err) {
      console.error('Progress fetch failed:', err);
    } finally {
      setCertLoading(false);
    }
  }, [userId, userProjectId]);

  // Run on mount / when userProjectId resolves
  useEffect(() => {
    fetchAllProgress();
  }, [fetchAllProgress]);

  // ── Render certificate / progress section ─────────────────────────────────
  const renderCertificateSection = () => {
    if (certLoading) {
      return (
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-[rgb(37,99,235)] border-t-transparent rounded-full animate-spin" />
          <span className="ml-2 text-sm text-[rgb(148,163,184)]">Loading progress...</span>
        </div>
      );
    }

    // Certificate earned
    if (certificate) {
      return (
        <div
          style={{ background: 'linear-gradient(135deg, rgb(37,99,235) 0%, rgb(79,70,229) 100%)' }}
          className="rounded-xl p-4 mt-1"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-lg flex items-center justify-center shrink-0">
              <Award className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-white font-bold text-sm">Certificate Earned!</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">✓</span>
              </div>
              <p className="text-blue-100 text-xs font-semibold truncate">{certificate.project_title}</p>
              <p className="text-blue-200 text-xs font-semibold mt-1">
                Score: {certificate.quiz_score}% · {new Date(certificate.issued_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Step-by-step progress
    const steps = [
      {
        label:    'Project Submitted',
        done:     !!submissionStatus,
        active:   !submissionStatus,
        rejected: false,
        desc:     submissionStatus ? `Status: ${submissionStatus}` : 'Submit your project for mentor review',
      },
      {
        label:    'Mentor Approved',
        done:     submissionStatus === 'approved',
        active:   submissionStatus === 'pending',
        rejected: submissionStatus === 'rejected',
        desc:
          submissionStatus === 'approved' ? 'Project approved ✓'
          : submissionStatus === 'rejected' ? 'Rejected — fix and resubmit'
          : 'Waiting for mentor review',
      },
      {
        label:    'Quiz Passed',
        done:     projectData?.status === 'completed' || projectData?.quiz_passed === true,
        active:   submissionStatus === 'approved' &&
                  !(projectData?.status === 'completed' || projectData?.quiz_passed === true),
        rejected: false,
        desc:
          projectData?.status === 'completed' || projectData?.quiz_passed === true
            ? `Quiz passed with ${projectData?.quiz_score ? Math.round((projectData.quiz_score / 7) * 100) : 0}% ✓`
            : submissionStatus !== 'approved'
            ? 'Complete submission and mentor approval first'
            : 'Pass the project quiz with ≥ 70%',
      },
    ];

    return (
      <div className="mt-1 space-y-2">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 p-2.5 rounded-lg border ${
              step.done     ? 'bg-green-50 border-green-200'
              : step.rejected ? 'bg-red-50 border-red-200'
              : step.active   ? 'bg-blue-50 border-blue-200'
              : 'bg-[rgb(248,250,252)] border-[rgb(226,232,240)]'
            }`}
          >
            {/* Circle icon */}
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              step.done     ? 'bg-green-500'
              : step.rejected ? 'bg-red-500'
              : step.active   ? 'bg-[rgb(37,99,235)]'
              : 'bg-[rgb(226,232,240)]'
            }`}>
              {step.done
                ? <CheckCircle className="w-3.5 h-3.5 text-white" />
                : step.rejected
                ? <XCircle className="w-3.5 h-3.5 text-white" />
                : <ClockIcon className="w-3.5 h-3.5 text-white" />
              }
            </div>

            {/* Label + desc */}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${
                step.done     ? 'text-green-700'
                : step.rejected ? 'text-red-700'
                : step.active   ? 'text-[rgb(37,99,235)]'
                : 'text-[rgb(148,163,184)]'
              }`}>
                {step.label}
              </p>
              <p className="text-xs font-semibold text-[rgb(148,163,184)] truncate">{step.desc}</p>
            </div>

            {/* Badge */}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
              step.done     ? 'bg-green-100 text-green-700'
              : step.rejected ? 'bg-red-100 text-red-700'
              : step.active   ? 'bg-blue-100 text-[rgb(37,99,235)]'
              : 'bg-[rgb(241,245,249)] text-[rgb(148,163,184)]'
            }`}>
              {step.done ? 'Done' : step.rejected ? 'Rejected' : step.active ? 'Active' : 'Pending'}
            </span>
          </div>
        ))}

        <button
          onClick={fetchAllProgress}
          className="w-full text-xs py-1.5 bg-blue-50 text-[rgb(37,99,235)] rounded-lg hover:bg-blue-100 transition font-semibold mt-1"
        >
          Refresh Progress
        </button>
      </div>
    );
  };

  const getDifficultyColor = (level) => {
    switch (level) {
      case 'Beginner':     return 'text-green-700 bg-green-50';
      case 'Intermediate': return 'text-yellow-700 bg-yellow-50';
      case 'Advanced':     return 'text-red-700 bg-red-50';
      default:             return 'text-[rgb(148,163,184)] bg-[rgb(241,245,249)]';
    }
  };

  const handleStartProject = async () => {
    if (!user) { navigate('/login', { state: { from: location } }); return; }
    try {
      const uid = user.id || user._id;
      if (!uid) { alert('Could not determine user ID'); return; }

      const userProjectData = {
        user_id:             uid,
        title:               project.title,
        description:         project.description,
        category:            project.category,
        difficulty:          project.difficulty,
        duration:            project.duration,
        technologies:        project.technologies || [],
        prerequisites:       project.prerequisites || [],
        project_description: project.project_description,
        tasks:               project.tasks || [],
        learning_outcomes:   project.learning_outcomes,
        status:              'pending',
      };

      const response     = await projectAPI.createUserProject(userProjectData);
      const newProjectId = response._id || response.project_id || response.id;
      setUserProjectId(newProjectId);
      navigate(`/projects/${newProjectId}/workspace`);
    } catch (err) {
      console.error('Error starting project:', err);
      alert('Failed to start project. Please try again.');
    }
  };

  const handleTakeQuiz = () => {
    if (!user) { navigate('/login', { state: { from: location } }); return; }
    if (!userProjectId) { alert('Please click "Start Project" first before taking the quiz.'); return; }
    navigate(`/project-quiz/${userProjectId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(248,250,252)] text-[rgb(15,23,42)] p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="w-16 h-16 border-4 border-[rgb(37,99,235)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[rgb(71,85,105)] text-lg">Loading project details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-[rgb(248,250,252)] text-[rgb(15,23,42)] p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="text-red-500 text-lg mb-4">{error || 'Project not found'}</div>
            <Link to="/projects" className="bg-[rgb(37,99,235)] hover:bg-[rgb(29,78,216)] text-white px-6 py-3 rounded-lg transition-colors duration-300 inline-block">
              Back to Projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(248,250,252)] text-[rgb(15,23,42)]">
      <div className="bg-white border-b border-[rgb(226,232,240)]">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center gap-2 text-[rgb(37,99,235)] hover:text-[rgb(29,78,216)] font-semibold mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Projects
          </button>

          <nav className="flex items-center space-x-2 text-sm text-[rgb(148,163,184)] mb-6">
            <Link to="/projects" className="hover:text-[rgb(37,99,235)] transition-colors duration-300">Projects</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-[rgb(71,85,105)]">{project.category}</span>
          </nav>

          <div className="flex flex-col lg:flex-row justify-between items-start gap-8">
            <div className="flex-1">
              <span className="text-sm font-medium text-[rgb(37,99,235)] bg-blue-50 px-3 py-1 rounded-full mb-4 inline-block">
                {project.category}
              </span>
              <h1 className="text-4xl font-bold text-[rgb(37,99,235)] mb-4">{project.title}</h1>
              <p className="text-xl text-[rgb(71,85,105)] mb-6">{project.description}</p>
              <div className="flex flex-wrap gap-6 text-sm text-[rgb(148,163,184)]">
                <div className="flex items-center gap-2"><Clock className="w-5 h-5" /><span>{project.duration}</span></div>
                <div className="flex items-center gap-2"><Users className="w-5 h-5" /><span>Curated by: {project.curator}</span></div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="border border-[rgb(226,232,240)] rounded-xl w-full lg:w-80">
              <div className="bg-white rounded-xl p-6 h-full">
                <div className="text-center mb-6">
                  <span className={`text-sm font-medium px-4 py-2 rounded-full ${getDifficultyColor(project.difficulty)}`}>
                    {project.difficulty}
                  </span>
                </div>

                <button
                  onClick={handleStartProject}
                  className="w-full font-semibold py-4 px-6 rounded-lg mb-4 border-2 border-[rgb(37,99,235)] bg-[rgb(37,99,235)] text-white transition-all duration-200"
                >
                  {user ? (userProjectId ? 'Continue Project' : 'Start Project') : 'Login to Start Project'}
                </button>

                {user && (
                  <button
                    onClick={handleTakeQuiz}
                    className="w-full font-semibold py-4 px-6 rounded-lg mb-4 border-2 border-[rgb(37,99,235)] bg-white text-[rgb(37,99,235)] transition-all duration-200"
                  >
                    {userProjectId ? 'Take Quiz' : 'Start Project First'}
                  </button>
                )}

                {user && userProjectId && (
                  <div className="border border-[rgb(226,232,240)] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowProgress(prev => !prev)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[rgb(248,250,252)] hover:bg-[rgb(241,245,249)] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-[rgb(37,99,235)]" />
                        <span className="text-sm font-bold text-[rgb(15,23,42)]">Certificate Progress</span>
                      </div>
                      {showProgress
                        ? <ChevronUp className="w-4 h-4 text-[rgb(148,163,184)]" />
                        : <ChevronDown className="w-4 h-4 text-[rgb(148,163,184)]" />
                      }
                    </button>
                    {showProgress && (
                      <div className="px-4 pb-4 pt-2 bg-white">
                        {renderCertificateSection()}
                      </div>
                    )}
                  </div>
                )}

                {!user && (
                  <div className="text-center text-sm text-[rgb(148,163,184)] mb-4">
                    <p>You need to be logged in to start this project</p>
                    <div className="flex gap-2 mt-3">
                      <Link to="/login" state={{ from: { pathname: `/projects/${projectId}` } }}
                        className="flex-1 bg-[rgb(241,245,249)] hover:bg-[rgb(226,232,240)] text-[rgb(15,23,42)] py-2 px-4 rounded-lg transition-colors duration-300 text-center">
                        Login
                      </Link>
                      <Link to="/signup" state={{ from: { pathname: `/projects/${projectId}` } }}
                        className="flex-1 bg-[rgb(37,99,235)] hover:bg-[rgb(29,78,216)] text-white py-2 px-4 rounded-lg transition-colors duration-300 text-center">
                        Register
                      </Link>
                    </div>
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-[rgb(226,232,240)]">
                  <div className="text-sm text-[rgb(148,163,184)]">
                    <div className="font-medium text-[rgb(71,85,105)] mb-2">Curated by:</div>
                    <div>{project.curator}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-white border border-[rgb(226,232,240)] rounded-xl p-6">
              <h2 className="text-2xl font-bold text-[rgb(15,23,42)] mb-4 flex items-center gap-3">
                <BookOpen className="w-6 h-6 text-[rgb(37,99,235)]" />
                Project Description
              </h2>
              <div
                className="markdown-content text-[rgb(71,85,105)] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(project.project_description || project.description) }}
              />
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-white border border-[rgb(226,232,240)] rounded-xl p-6">
              <h3 className="text-lg font-bold text-[rgb(15,23,42)] mb-4">Technologies Used</h3>
              <div className="flex flex-wrap gap-2">
                {project.technologies?.map((tech, index) => (
                  <span key={index} className="text-sm text-[rgb(37,99,235)] bg-blue-50 px-3 py-2 rounded-lg border border-[rgb(37,99,235)]/20">
                    {tech}
                  </span>
                ))}
              </div>
            </section>

            <section className="bg-white border border-[rgb(226,232,240)] rounded-xl p-6">
              <h3 className="text-lg font-bold text-[rgb(15,23,42)] mb-4">Prerequisites</h3>
              <div className="space-y-2">
                {project.prerequisites?.map((prereq, index) => (
                  <div key={index} className="flex items-center gap-3 text-[rgb(71,85,105)]">
                    <div className="w-2 h-2 bg-[rgb(37,99,235)] rounded-full" />
                    <span>{prereq}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;