// pages/Talent.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Users, Award, Loader2 } from 'lucide-react';

const API_BASE = "http://localhost:8000";

const Talent = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [talents, setTalents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTalent, setSelectedTalent] = useState(null);

  // ── Fetch certified talent on mount ────────────────────────────────────
  useEffect(() => {
    const fetchTalent = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/talent`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTalents(data.talent || []);
      } catch (err) {
        console.error("Failed to fetch talent:", err);
        setError("Failed to load talent pool. Make sure the backend is running.");
      } finally {
        setLoading(false);
      }
    };
    fetchTalent();
  }, []);

  // ── Filter ──────────────────────────────────────────────────────────────
  const filteredTalents = talents.filter(t =>
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.bio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.skills?.some(s => s.toLowerCase().includes(searchTerm.toLowerCase())) ||
    t.certifications?.some(c =>
      c.project_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.category?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleLogin = () => navigate('/login', { state: { from: location } });

  const handleRecruit = () => {
    if (!selectedTalent) {
      alert('Please select a talent first by clicking on their profile');
      return;
    }
    if (!user) {
      navigate('/login', { state: { from: location } });
      return;
    }
    if (!user.is_hr) {
      alert('Only verified HR professionals can access recruitment features.');
      return;
    }
    navigate(`/talent/${selectedTalent.user_id}`);
  };

  return (
    <div className="min-h-screen bg-[rgb(248,250,252)] text-[rgb(15,23,42)]">

      {/* Header */}
      <div className="bg-white border-b border-[rgb(226,232,240)]">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6 mb-8">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl font-bold text-[rgb(37,99,235)] mb-2">Talent Pool</h1>
              <p className="text-xl text-[rgb(71,85,105)]">
                Discover verified professionals with certified skills and real-world project experience
              </p>
            </div>

            <div className="border border-[rgb(226,232,240)] rounded-3xl">
              <div className="w-fit p-4 rounded-3xl bg-[rgb(241,245,249)] flex flex-col space-y-4 items-center">
                <div className="relative border border-[rgb(226,232,240)] rounded-full">
                  <button
                    onClick={handleLogin}
                    className="w-full min-w-[160px] rounded-full py-2 px-6 text-[rgb(15,23,42)] text-base font-semibold bg-white hover:bg-[rgb(241,245,249)] transition-colors"
                  >
                    Login
                  </button>
                </div>
                <div className="relative border border-[rgb(226,232,240)] rounded-full">
                  <button
                    onClick={handleRecruit}
                    className="w-full min-w-[160px] rounded-full py-2 px-6 text-[rgb(15,23,42)] text-base font-semibold bg-white hover:bg-[rgb(241,245,249)] transition-colors"
                  >
                    Recruit
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="w-full px-6">
            <div className="relative border border-[rgb(226,232,240)] rounded-xl w-full">
              <div className="bg-white rounded-xl p-2">
                <div className="flex items-center">
                  <Search className="w-5 h-5 text-[rgb(148,163,184)] ml-3 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search by name, skills, role, certifications..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-transparent border-0 text-[rgb(15,23,42)] placeholder-[rgb(148,163,184)] focus:outline-none focus:ring-0 px-4 py-2 text-base"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="p-1 text-[rgb(148,163,184)] hover:text-[rgb(15,23,42)] transition-colors mr-2"
                    >✕</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-10 h-10 text-[rgb(37,99,235)] animate-spin mb-4" />
            <p className="text-[rgb(148,163,184)]">Loading certified talent...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-16">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md mx-auto">
              <p className="text-red-600 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Talent cards */}
        {!loading && !error && (
          <div className="space-y-6">
            {filteredTalents.map((talent) => (
              <div
                key={talent.user_id}
                onClick={() => setSelectedTalent(talent)}
                className={`cursor-pointer rounded-xl border transition-all duration-300 ${selectedTalent?.user_id === talent.user_id
                    ? 'ring-2 ring-[rgb(37,99,235)] scale-[1.01] border-[rgb(37,99,235)]/30'
                    : 'border-[rgb(226,232,240)] hover:shadow-md'
                  }`}
              >
                <div className="bg-white rounded-xl p-6">
                  <div className="flex flex-col lg:flex-row gap-6 items-start">

                    {/* Left — info & skills */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-xl font-bold text-[rgb(15,23,42)]">{talent.name}</h3>
                            <div className="flex items-center gap-1 text-green-600 text-xs bg-green-500/10 px-2 py-1 rounded-full border border-green-400/20">
                              <Award className="w-3 h-3" />
                              <span>Verified</span>
                            </div>
                          </div>
                          {talent.title && (
                            <p className="text-[rgb(37,99,235)] font-medium text-sm">{talent.title}</p>
                          )}
                        </div>
                        <div className="text-xs text-[rgb(148,163,184)] shrink-0">
                          {talent.cert_count} certificate{talent.cert_count !== 1 ? 's' : ''}
                        </div>
                      </div>

                      <p className="text-[rgb(71,85,105)] text-sm mb-4 leading-relaxed">{talent.bio}</p>

                      {/* Skills from actual certified projects */}
                      {talent.skills?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-[rgb(148,163,184)] uppercase mb-2">Skills</h4>
                          <div className="flex flex-wrap gap-2">
                            {talent.skills.map((skill, i) => (
                              <span key={i} className="text-xs text-[rgb(37,99,235)] bg-[rgb(37,99,235)]/10 px-3 py-1 rounded-full border border-[rgb(37,99,235)]/20">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right — earned certificates */}
                    <div className="lg:w-80 xl:w-96 shrink-0">
                      <div className="bg-[rgb(248,250,252)] rounded-lg p-4 border border-[rgb(226,232,240)]">
                        <h4 className="text-sm font-semibold text-[rgb(71,85,105)] mb-3 flex items-center gap-2">
                          <Award className="w-4 h-4 text-[rgb(37,99,235)]" />
                          Earned Certificates ({talent.cert_count})
                        </h4>
                        <div className="space-y-3">
                          {talent.certifications.map((cert, i) => (
                            <div key={i} className="flex items-start gap-3 text-sm">
                              <Award className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[rgb(15,23,42)] font-medium truncate">{cert.project_title}</p>
                                <p className="text-[rgb(148,163,184)] text-xs">{cert.category} · Score: {cert.quiz_score}%</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {selectedTalent?.user_id === talent.user_id && (
                        <div className="mt-3 text-[rgb(37,99,235)] text-sm font-medium flex items-center gap-2 justify-end">
                          <div className="w-2 h-2 bg-[rgb(37,99,235)] rounded-full animate-pulse" />
                          Selected for recruitment
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Empty */}
            {filteredTalents.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-[rgb(148,163,184)] mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-[rgb(71,85,105)] mb-2">
                  {searchTerm ? "No matching talent found" : "No certified talent yet"}
                </h3>
                <p className="text-[rgb(148,163,184)]">
                  {searchTerm
                    ? "Try adjusting your search"
                    : "Talent will appear here once students earn certificates"}
                </p>
              </div>
            )}
          </div>
        )}

        {filteredTalents.length > 0 && !loading && (
          <div className="mt-8 text-center text-[rgb(148,163,184)] text-sm">
            <p>Click a profile to select, then click "Recruit" to view full details</p>
            <p className="mt-1">Full profiles are only accessible to verified HR professionals</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Talent;