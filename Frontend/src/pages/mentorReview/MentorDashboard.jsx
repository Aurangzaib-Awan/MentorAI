// pages/mentorReview/MentorDashboard.jsx
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input.jsx";
import { Button } from "@/components/ui/button.jsx";
import {
  Search, Filter, Clock, CheckCircle, XCircle, Eye, ExternalLink, Award
} from "lucide-react";

const API_BASE = "http://localhost:8000";

const MentorDashboard = ({ user }) => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState(null);

  // ── FIX 2: Separate loading states for each button ────────────────────────
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);

  const [certToast, setCertToast] = useState(null);

  // ── FIX 3: Error state so user sees failures on screen ────────────────────
  const [error, setError] = useState(null);

  // ── Fetch all submissions on mount ───────────────────────────────────────
  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/submissions`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSubmissions(data.submissions || []);
      } catch (err) {
        console.error("Failed to fetch submissions:", err);
        setError("Failed to load submissions. Make sure the backend is running.");
      } finally {
        setLoading(false);
      }
    };
    fetchSubmissions();
  }, []);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filteredSubmissions = useMemo(() => {
    let result = submissions;
    if (searchTerm) {
      result = result.filter(s =>
        s.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.user_id?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (statusFilter !== "all") {
      result = result.filter(s =>
        statusFilter === "reviewed"
          ? s.status !== "pending"
          : s.status === statusFilter
      );
    }
    return result;
  }, [submissions, searchTerm, statusFilter]);

  // ── FIX 1: Always read ID directly from selectedProject inside handler ────
  // Never use a variable computed outside — it can be stale
  const getSubmissionId = (sub) => sub?.submission_id || sub?._id;

  // ── Approve ───────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!selectedProject) return;
    const submissionId = getSubmissionId(selectedProject); // read fresh here
    if (!submissionId) {
      setError("Cannot approve: submission ID is missing.");
      return;
    }

    setApproveLoading(true);
    setError(null);
    try {
      const mentorId = user?.id || user?._id || "";
      const res = await fetch(`${API_BASE}/api/submissions/${submissionId}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentor_id: mentorId }),
      });

      // FIX 3: Actually check if request succeeded
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Server error ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      console.log("Approve response:", data);

      // Update submissions list
      setSubmissions(prev => prev.map(s =>
        getSubmissionId(s) === submissionId ? { ...s, status: "approved" } : s
      ));
      // Update detail panel
      setSelectedProject(prev =>
        prev && getSubmissionId(prev) === submissionId
          ? { ...prev, status: "approved" }
          : prev
      );

      // Show certificate toast if issued
      if (data.certificate) {
        setCertToast(data.certificate);
        setTimeout(() => setCertToast(null), 6000);
      }
    } catch (err) {
      console.error("Approve failed:", err);
      setError(`Approve failed: ${err.message}`);
    } finally {
      setApproveLoading(false);
    }
  };

  // ── Reject ────────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!selectedProject) return;
    const submissionId = getSubmissionId(selectedProject); // read fresh here
    if (!submissionId) {
      setError("Cannot reject: submission ID is missing.");
      return;
    }

    setRejectLoading(true);
    setError(null);
    try {
      const mentorId = user?.id || user?._id || "";
      const res = await fetch(`${API_BASE}/api/submissions/${submissionId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentor_id: mentorId }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Server error ${res.status}: ${errBody}`);
      }

      setSubmissions(prev => prev.map(s =>
        getSubmissionId(s) === submissionId ? { ...s, status: "rejected" } : s
      ));
      setSelectedProject(prev =>
        prev && getSubmissionId(prev) === submissionId
          ? { ...prev, status: "rejected" }
          : prev
      );
    } catch (err) {
      console.error("Reject failed:", err);
      setError(`Reject failed: ${err.message}`);
    } finally {
      setRejectLoading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getStatusBadge = (status) => {
    const base = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border";
    switch (status) {
      case "pending":
        return <span className={`${base} bg-yellow-500/10 text-yellow-500 border-yellow-500/20`}><Clock className="w-3 h-3 mr-1" />Pending</span>;
      case "approved":
        return <span className={`${base} bg-green-500/10 text-green-500 border-green-500/20`}><CheckCircle className="w-3 h-3 mr-1" />Approved</span>;
      case "rejected":
        return <span className={`${base} bg-red-500/10 text-red-500 border-red-500/20`}><XCircle className="w-3 h-3 mr-1" />Rejected</span>;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(248,250,252)]">

      {/* Certificate issued toast */}
      {certToast && (
        <div className="fixed top-6 right-6 z-50 bg-white border border-green-200 rounded-2xl p-4 shadow-xl flex items-center gap-4 max-w-sm animate-in slide-in-from-top-4 duration-300">
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
            <Award className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="font-bold text-[rgb(15,23,42)] text-sm">Certificate Issued! 🎉</p>
            <p className="text-[rgb(71,85,105)] text-xs mt-0.5">
              {certToast.certificate_id} — {certToast.project_title}
            </p>
          </div>
        </div>
      )}

      {/* FIX 3: Error banner visible to user */}
      {error && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 max-w-lg w-full mx-4">
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 shrink-0">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[rgb(248,250,252)]/90 backdrop-blur-sm border-b border-[rgb(226,232,240)]">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[rgb(37,99,235)] mb-1">Mentor Dashboard</h1>
              <p className="text-[rgb(148,163,184)] text-sm">Review and evaluate student projects</p>
            </div>
            <div className="relative w-full sm:w-72 border border-[rgb(226,232,240)] rounded-full">
              <div className="relative bg-[rgb(241,245,249)] rounded-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(148,163,184)] w-4 h-4" />
                <Input
                  type="search"
                  placeholder="Search submissions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-transparent border-0 text-[rgb(15,23,42)] w-full rounded-full focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">

          {/* Left: Submission List */}
          <div className="lg:w-1/3 flex flex-col h-full">
            {/* Filter tabs */}
            <div className="mb-4">
              <div className="inline-flex rounded-lg bg-[rgb(241,245,249)] p-1">
                {["all", "pending", "reviewed"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-1 ${statusFilter === f
                      ? "bg-white text-[rgb(15,23,42)] shadow-sm"
                      : "text-[rgb(148,163,184)] hover:text-[rgb(15,23,42)]"
                      }`}
                  >
                    {f === "pending" && <Clock className="w-3 h-3" />}
                    {f === "reviewed" && <CheckCircle className="w-3 h-3" />}
                    {f.charAt(0).toUpperCase() + f.slice(1)} (
                    {f === "all"
                      ? submissions.length
                      : f === "reviewed"
                        ? submissions.filter(s => s.status !== "pending").length
                        : submissions.filter(s => s.status === f).length}
                    )
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pr-2">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-4 border-[rgb(37,99,235)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSubmissions.map((sub) => {
                    const subId = getSubmissionId(sub);
                    const isSelected = selectedProject && getSubmissionId(selectedProject) === subId;
                    return (
                      <div
                        key={subId}
                        onClick={() => setSelectedProject(sub)}
                        className={`cursor-pointer rounded-lg border transition-all duration-200 hover:scale-[1.01] ${isSelected
                          ? "ring-2 ring-[rgb(37,99,235)] bg-white border-[rgb(226,232,240)]"
                          : "bg-[rgb(241,245,249)]/30 border-[rgb(226,232,240)] hover:bg-white"
                          }`}
                      >
                        <div className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-[rgb(15,23,42)] text-sm line-clamp-1">
                              Project ID: {sub.project_id?.slice(-8)}
                            </h3>
                            {getStatusBadge(sub.status)}
                          </div>
                          <p className="text-xs text-[rgb(148,163,184)] mb-3 line-clamp-2">
                            {sub.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[rgb(71,85,105)]">User: {sub.user_id?.slice(-8)}</span>
                            <span className="text-xs text-[rgb(148,163,184)]">
                              {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filteredSubmissions.length === 0 && !loading && (
                    <div className="text-center py-12">
                      <Filter className="w-12 h-12 text-[rgb(148,163,184)] mx-auto mb-4" />
                      <p className="text-[rgb(148,163,184)]">No submissions found</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Detail Panel */}
          <div className="lg:w-2/3 h-full">
            <div className="bg-white/50 rounded-xl border border-[rgb(226,232,240)] h-full overflow-hidden flex flex-col">
              {selectedProject ? (
                <>
                  {/* Panel header */}
                  <div className="p-6 border-b border-[rgb(226,232,240)] flex-shrink-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-xl font-bold text-[rgb(15,23,42)]">
                            Submission Review
                          </h2>
                          {getStatusBadge(selectedProject.status)}
                        </div>
                        <p className="text-[rgb(148,163,184)] text-sm">
                          Submitted {selectedProject.submitted_at
                            ? new Date(selectedProject.submitted_at).toLocaleDateString()
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Scrollable content */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Description */}
                    <div>
                      <h3 className="text-sm font-bold text-[rgb(148,163,184)] uppercase mb-2">Description</h3>
                      <p className="text-[rgb(71,85,105)] bg-[rgb(241,245,249)]/30 rounded-lg p-4 text-sm leading-relaxed">
                        {selectedProject.description}
                      </p>
                    </div>

                    {/* Challenges */}
                    <div>
                      <h3 className="text-sm font-bold text-[rgb(148,163,184)] uppercase mb-2">Challenges Faced</h3>
                      <p className="text-[rgb(71,85,105)] bg-[rgb(241,245,249)]/30 rounded-lg p-4 text-sm leading-relaxed">
                        {selectedProject.challenges}
                      </p>
                    </div>

                    {/* Learnings */}
                    <div>
                      <h3 className="text-sm font-bold text-[rgb(148,163,184)] uppercase mb-2">Key Learnings</h3>
                      <p className="text-[rgb(71,85,105)] bg-[rgb(241,245,249)]/30 rounded-lg p-4 text-sm leading-relaxed">
                        {selectedProject.learnings}
                      </p>
                    </div>

                    {/* Links */}
                    <div>
                      <h3 className="text-sm font-bold text-[rgb(148,163,184)] uppercase mb-2">Project Links</h3>
                      <div className="space-y-3">
                        {selectedProject.github_url && (
                          <a
                            href={selectedProject.github_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 bg-[rgb(248,250,252)] rounded-lg hover:bg-[rgb(241,245,249)] transition-colors"
                          >
                            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center border border-[rgb(226,232,240)]">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[rgb(15,23,42)] font-medium text-sm">GitHub Repository</p>
                              <p className="text-[rgb(148,163,184)] text-xs truncate">{selectedProject.github_url}</p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-[rgb(148,163,184)] shrink-0" />
                          </a>
                        )}
                        {selectedProject.live_demo_url && (
                          <a
                            href={selectedProject.live_demo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 bg-[rgb(248,250,252)] rounded-lg hover:bg-[rgb(241,245,249)] transition-colors"
                          >
                            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center border border-[rgb(226,232,240)]">
                              <ExternalLink className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[rgb(15,23,42)] font-medium text-sm">Live Demo</p>
                              <p className="text-[rgb(148,163,184)] text-xs truncate">{selectedProject.live_demo_url}</p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-[rgb(148,163,184)] shrink-0" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Review Actions — only shown when pending */}
                    {selectedProject.status === "pending" && (
                      <div className="p-4 bg-[rgb(241,245,249)]/30 rounded-xl border border-[rgb(226,232,240)]">
                        <h3 className="text-sm font-bold text-[rgb(148,163,184)] uppercase mb-4">Review Actions</h3>
                        <div className="flex flex-col sm:flex-row gap-3">

                          {/* FIX 2: Reject has its own loading state, doesn't block Approve */}
                          <Button
                            variant="destructive"
                            disabled={rejectLoading || approveLoading}
                            onClick={handleReject}
                            className="flex-1 py-6 bg-red-500 hover:bg-red-600 text-white"
                          >
                            {rejectLoading
                              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                              : <XCircle className="w-5 h-5 mr-2" />
                            }
                            Request Changes
                          </Button>

                          {/* FIX 2: Approve has its own loading state, doesn't block Reject */}
                          <Button
                            disabled={approveLoading || rejectLoading}
                            onClick={handleApprove}
                            className="flex-1 py-6 bg-green-600 hover:bg-green-700 text-white"
                          >
                            {approveLoading
                              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                              : <CheckCircle className="w-5 h-5 mr-2" />
                            }
                            Approve Project
                          </Button>
                        </div>
                        <p className="text-xs text-[rgb(148,163,184)] mt-3 text-center">
                          Approving will automatically issue a certificate if the student has also passed the quiz.
                        </p>
                      </div>
                    )}

                    {/* Already approved */}
                    {selectedProject.status === "approved" && (
                      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                        <Award className="w-5 h-5 text-green-600 shrink-0" />
                        <p className="text-green-700 text-sm font-medium">
                          This project has been approved. A certificate is issued if the student also passed the quiz.
                        </p>
                      </div>
                    )}

                    {/* Already rejected */}
                    {selectedProject.status === "rejected" && (
                      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                        <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                        <p className="text-red-600 text-sm font-medium">
                          Changes have been requested for this submission.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <Eye className="w-16 h-16 text-[rgb(148,163,184)] mb-4" />
                  <h3 className="text-xl font-semibold text-[rgb(71,85,105)] mb-2">Select a Submission</h3>
                  <p className="text-[rgb(148,163,184)] max-w-md">
                    Choose a submission from the list to view details and perform reviews
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MentorDashboard;
