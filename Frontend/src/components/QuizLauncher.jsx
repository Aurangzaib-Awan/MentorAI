import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Quiz from "../pages/courses/Quiz";
import { projectAPI } from "../services/api";
import { Brain } from "lucide-react";

export default function QuizLauncher({ userId }) {
  const { projectId } = useParams();
  const [questions, setQuestions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quizId, setQuizId] = useState(null);
  const [resolvedProjectId, setResolvedProjectId] = useState(null);

  useEffect(() => {
    async function loadQuiz() {
      try {
        // ✅ First resolve the correct user_project id
        // The URL might have the curated project id — we need the user_project id
        let userProjectId = projectId;

        try {
          // Try fetching as a user project directly
          const userProj = await projectAPI.getUserProject(projectId);
          if (userProj && userProj._id) {
            userProjectId = userProj._id;
            console.log("✅ Resolved user project id:", userProjectId);
          }
        } catch (e) {
          // If that fails, search user's projects to find matching one
          console.warn("Direct lookup failed, searching user projects...");
          try {
            const allProjects = await projectAPI.getUserProjects(userId);
            const projects = allProjects.projects || [];
            // Find by matching either _id or a linked curated project id
            const match = projects.find(
              p => p._id === projectId || 
                   p.project_id === projectId ||
                   p.user_project_id === projectId
            );
            if (match) {
              userProjectId = match._id || match.project_id;
              console.log("✅ Found user project via search:", userProjectId);
            }
          } catch (e2) {
            console.warn("User project search also failed:", e2);
          }
        }

        setResolvedProjectId(userProjectId);

        // ✅ Now generate quiz with the correct user project id
        const data = await projectAPI.generateQuiz(userProjectId, userId);
        setQuizId(data.quiz_id);
        setQuestions(data.questions);
        console.log("✅ Quiz generated for project:", userProjectId);
      } catch (err) {
        console.error(err);
        alert("Failed to generate quiz");
      } finally {
        setLoading(false);
      }
    }

    loadQuiz();
  }, [projectId, userId]);

  if (loading) return (
    <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-white/90 backdrop-blur-md animate-fade-in">
      {/* Spinner Container */}
      <div className="relative mb-8 text-center">
        {/* Rotating Border Circle (Spinner) */}
        <div className="w-24 h-24 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin mx-auto shadow-xl" />
        
        {/* Pulsing Brain Icon - Centered Absolutely */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Brain className="w-8 h-8 text-blue-600 animate-pulse" />
        </div>
      </div>

      {/* Heading */}
      <h2 className="text-3xl font-black text-slate-900 tracking-tight">
        Generating Your Quiz
      </h2>

      {/* Subtitle with Pulse Animation */}
      <p className="text-slate-500 mt-4 font-medium italic animate-pulse">
        AI is preparing custom questions...
      </p>
    </div>
  );
  if (!questions) return <div className="p-4 text-red-600">Unable to load quiz.</div>;

  return (
    <Quiz
      questions={questions}
      quizId={quizId}
      userId={userId}
      projectId={resolvedProjectId}
    />
  );
}