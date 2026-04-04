// pages/projects/ProjectWorkspace.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Award, ExternalLink, CheckCircle, Clock, X, ArrowLeft } from 'lucide-react';
import KanbanBoard from '../../components/KanbanBoard.jsx';
import { projectAPI } from '../../services/api.js';

const ProjectWorkspace = ({ user }) => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const nextTaskId = useRef(1);

  // ── Kanban state ──────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState({
    backlog: [], inProgress: [], review: [], done: []
  });
  const [newTasks, setNewTasks] = useState({
    backlog: { title: '', description: '' },
    inProgress: { title: '', description: '' },
    review: { title: '', description: '' },
    done: { title: '', description: '' }
  });

  // ── Certificate state ─────────────────────────────────────────────────────
  const [certificate, setCertificate] = useState(null);
  const [certLoading, setCertLoading] = useState(true);
  const [submissionStatus, setSubmissionStatus] = useState(null); // 'pending'|'approved'|'rejected'|null
  const [projectData, setProjectData] = useState(null); // Track project data including quiz status
  const [showProgressModal, setShowProgressModal] = useState(false);

  const columns = [
    { id: 'backlog', title: 'Backlog', color: 'bg-gray-500' },
    { id: 'inProgress', title: 'In Progress', color: 'bg-blue-500' },
    { id: 'review', title: 'Review', color: 'bg-yellow-500' },
    { id: 'done', title: 'Done', color: 'bg-green-500' }
  ];

  // ── Resolve user_id ───────────────────────────────────────────────────────
  const userId = user?.id || user?._id || (() => {
    try { return JSON.parse(sessionStorage.getItem('user') || '{}')?.id; } catch { return null; }
  })();

  // ── Fetch certificate + submission status on mount ────────────────────────
useEffect(() => {
  if (!userId) { setCertLoading(false); return; }

  const startProject = async () => {
    try {
      await projectAPI.startUserProject(projectId);
      console.log('Project marked as started');
    } catch (err) {
      console.error('Failed to mark project as started:', err);
    }
  };

  const fetchStatus = async () => {
    try {
      await startProject();

      // Check for existing certificate
      const certData = await projectAPI.getCertificates(userId);
      const certs = certData.certificates || [];
      const match = certs.find(c => c.project_id === projectId);
      if (match) { setCertificate(match); setCertLoading(false); return; }

      // Fetch project details using api service (no raw fetch)
      try {
        const projData = await projectAPI.getUserProject(projectId);
        setProjectData(projData);
        console.log('Project data fetched:', projData);
      } catch (err) {
        console.error('Failed to fetch project data:', err);
      }

      // Check submission status
      const subRes = await fetch(`http://localhost:8000/api/submissions`, { credentials: 'include' });
      const subData = await subRes.json();
      const subs = subData.submissions || [];
      const mySub = subs.find(s => s.user_id === userId && s.project_id === projectId);
      if (mySub) setSubmissionStatus(mySub.status);

    } catch (err) {
      console.error('Workspace status fetch failed:', err);
    } finally {
      setCertLoading(false);
    }
  };

  fetchStatus();
}, [userId, projectId]);

  useEffect(() => {
  if (!showProgressModal || !projectId || !userId) return;

  let active = true; // flag to stop retrying on persistent errors

  const refreshAll = async () => {
    if (!active) return;
    
    try {
      // Refresh project status using api service (handles credentials)
      const projData = await projectAPI.getUserProject(projectId);
      if (active) setProjectData(projData);

      // Re-check for newly issued certificate
      const certData = await projectAPI.getCertificates(userId);
      const certs = certData.certificates || [];
      const match = certs.find(c => c.project_id === projectId);
      if (match && active) {
        setCertificate(match);
        console.log('🎉 Certificate found!', match.certificate_id);
        active = false; // ✅ stop polling once cert is found
        clearInterval(interval);
      }
    } catch (err) {
      console.error('Auto-refresh failed:', err);
      // ✅ Stop spamming if it's an auth error — no point retrying
      if (err.message?.includes('Not authenticated') || err.message?.includes('401')) {
        console.warn('Auth error in refresh — stopping interval');
        active = false;
        clearInterval(interval);
      }
    }
  };

  refreshAll();
  const interval = setInterval(refreshAll, 3000);
  return () => {
    active = false;
    clearInterval(interval);
  };
}, [showProgressModal, projectId, userId]);

  // ── Kanban helpers ────────────────────────────────────────────────────────
  const addTask = (columnId) => {
    const currentTask = newTasks[columnId];
    if (!currentTask.title.trim()) return;
    const task = { id: nextTaskId.current++, title: currentTask.title, description: currentTask.description };
    setTasks(prev => ({ ...prev, [columnId]: [...prev[columnId], task] }));
    setNewTasks(prev => ({ ...prev, [columnId]: { title: '', description: '' } }));
  };

  const handleInputChange = (columnId, field, value) => {
    setNewTasks(prev => ({ ...prev, [columnId]: { ...prev[columnId], [field]: value } }));
  };

  const moveTask = (taskId, fromColumn, toColumn) => {
    const task = tasks[fromColumn].find(t => t.id === taskId);
    if (!task) return;
    setTasks(prev => ({
      ...prev,
      [fromColumn]: prev[fromColumn].filter(t => t.id !== taskId),
      [toColumn]: [...prev[toColumn], task]
    }));
  };

  const handleSubmitProject = () => navigate(`/projects/${projectId}/submit`);

  // ── Certificate card ──────────────────────────────────────────────────────
  const renderCertificateSection = () => {
    if (certLoading) return null;

    // ── Certificate earned ────────────────────────────────────────────────
    if (certificate) {
      return (
        <div className="mt-8">
          <div
            style={{ background: 'linear-gradient(135deg, rgb(37,99,235) 0%, rgb(79,70,229) 100%)' }}
            className="rounded-2xl p-px"
          >
            <div
              style={{ background: 'linear-gradient(135deg, rgb(37,99,235) 0%, rgb(79,70,229) 100%)' }}
              className="rounded-2xl p-6"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
                    <Award className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-bold text-lg">Certificate of Completion</h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">Earned</span>
                    </div>
                    <p className="text-blue-100 text-sm">{certificate.project_title}</p>
                    <p className="text-blue-200 text-xs mt-1">
                      ID: {certificate.certificate_id} &nbsp;·&nbsp;
                      Quiz Score: {certificate.quiz_score}% &nbsp;·&nbsp;
                      Issued: {new Date(certificate.issued_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {certificate.technologies?.slice(0, 4).map((t, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/15 text-white border border-white/20">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── In-progress states ────────────────────────────────────────────────
    const steps = [
      {
        label: "Project Submitted",
        done: !!submissionStatus,
        active: !submissionStatus,
        desc: submissionStatus ? `Status: ${submissionStatus}` : "Submit your project for mentor review"
      },
      {
        label: "Mentor Approved",
        done: submissionStatus === "approved",
        active: submissionStatus === "pending",
        desc: submissionStatus === "approved"
          ? "Project approved ✓"
          : submissionStatus === "rejected"
            ? "Changes requested — resubmit"
            : "Waiting for mentor review"
      },
      {
        label: "Quiz Passed",
        done: projectData?.status === "completed" || projectData?.quiz_passed === true,
        active: submissionStatus === "approved" && !(projectData?.status === "completed" || projectData?.quiz_passed === true),
        desc: projectData?.status === "completed" || projectData?.quiz_passed === true
          ? `Quiz passed with ${projectData?.quiz_score ? Math.round((projectData.quiz_score / 7) * 100) : 0}% ✓`
          : submissionStatus !== "approved"
            ? "Complete submission and mentor approval first"
            : "Pass the project quiz with ≥ 70%"
      },
    ];

    return (
      <div className="mt-8 bg-white border border-[rgb(226,232,240)] rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Award className="w-5 h-5 text-[rgb(37,99,235)]" />
            </div>
            <div>
              <h3 className="font-bold text-[rgb(15,23,42)]">Certificate Progress</h3>
              <p className="text-xs text-[rgb(148,163,184)]">Complete all steps to earn your certificate</p>
            </div>
          </div>
          <button 
            onClick={async () => {
  setCertLoading(true);
  try {
    const projData = await projectAPI.getUserProject(projectId);
    setProjectData(projData);
    // Also re-check certificate
    const certData = await projectAPI.getCertificates(userId);
    const certs = certData.certificates || [];
    const match = certs.find(c => c.project_id === projectId);
    if (match) setCertificate(match);
  } catch (err) {
    console.error('Failed to refresh project data:', err);
  } finally {
    setCertLoading(false);
  
              };
            }}
            className="text-xs px-3 py-1.5 bg-blue-50 text-[rgb(37,99,235)] rounded-lg hover:bg-blue-100 transition font-semibold"
          >
            Refresh
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-xl border ${step.done
                  ? 'bg-green-50 border-green-200'
                  : step.active
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-[rgb(248,250,252)] border-[rgb(226,232,240)]'
                }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${step.done ? 'bg-green-500' :
                  step.active ? 'bg-[rgb(37,99,235)]' :
                    'bg-[rgb(226,232,240)]'
                }`}>
                {step.done
                  ? <CheckCircle className="w-4 h-4 text-white" />
                  : <Clock className="w-4 h-4 text-white" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${step.done ? 'text-green-700' : step.active ? 'text-[rgb(37,99,235)]' : 'text-[rgb(148,163,184)]'
                  }`}>{step.label}</p>
                <p className="text-xs text-[rgb(148,163,184)] truncate">{step.desc}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${step.done ? 'bg-green-100 text-green-700' :
                  step.active ? 'bg-blue-100 text-[rgb(37,99,235)]' :
                    'bg-[rgb(241,245,249)] text-[rgb(148,163,184)]'
                }`}>
                {step.done ? 'Done' : step.active ? 'Active' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[rgb(248,250,252)] text-[rgb(15,23,42)] p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-2 text-[rgb(37,99,235)] hover:text-[rgb(29,78,216)] font-semibold mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Projects
        </button>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[rgb(37,99,235)] mb-2">Project Workspace</h1>
            <p className="text-[rgb(71,85,105)]">Plan and track your project progress</p>
          </div>
          <div className="flex items-center gap-4 mt-4 lg:mt-0">
            <div className="flex items-center gap-2 text-[rgb(71,85,105)]">
              <Users className="w-5 h-5" />
              <span>Individual Project</span>
            </div>
            <button
              onClick={() => setShowProgressModal(true)}
              className="flex items-center gap-2 bg-[rgb(37,99,235)] hover:bg-[rgb(29,78,216)] text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300"
            >
              <Award className="w-4 h-4" />
              <span>Progress</span>
            </button>
            <button
              onClick={handleSubmitProject}
              className="bg-[rgb(37,99,235)] hover:bg-[rgb(29,78,216)] text-white font-semibold py-2 px-6 rounded-lg transition-all duration-300"
            >
              Submit Project
            </button>
          </div>
        </div>

        {/* Kanban Board */}
        <KanbanBoard
          tasks={tasks}
          newTasks={newTasks}
          columns={columns}
          onAddTask={addTask}
          onInputChange={handleInputChange}
          onMoveTask={moveTask}
        />
      </div>

      {/* Progress Modal */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-[rgb(226,232,240)] p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-[rgb(37,99,235)]">Completion Progress</h2>
                <p className="text-sm text-[rgb(148,163,184)] mt-1">Track your path to certification</p>
              </div>
              <button
                onClick={() => setShowProgressModal(false)}
                className="text-[rgb(148,163,184)] hover:text-[rgb(15,23,42)] transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {renderCertificateSection()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectWorkspace;