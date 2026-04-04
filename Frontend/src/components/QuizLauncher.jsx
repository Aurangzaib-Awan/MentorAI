import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Quiz from "../pages/courses/Quiz";
import { projectAPI } from "../services/api";

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

  if (loading) return <div className="p-4">Generating your quiz...</div>;
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