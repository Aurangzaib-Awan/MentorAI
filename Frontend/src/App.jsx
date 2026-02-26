import React from 'react';
import { useEffect, useState } from 'react';
import AppRoutes from './routes';


// Protected Route Components (defined outside App component)
const AdminRoute = ({ user, children }) => {
  if (!user) {
    return <div>Redirecting to login...</div>;
  }

  if (!user.is_admin) {
    return <div>Access denied. Redirecting...</div>;
  }

  return children;
};

const UserRoute = ({ user, children }) => {
  if (!user) {
    return <div>Redirecting to login...</div>;
  }

  if (user.is_admin) {
    return <div>Admins cannot access user pages. Redirecting...</div>;
  }

  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const { authAPI } = await import('./services/api');
        const data = await authAPI.getCurrentUser();
        if (data && (data.email || data.user)) {
          const u = data.user || { email: data.email, role: data.role };
          setUser(u);
        } else {
          setUser(null);
        }
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(248,250,252)] flex items-center justify-center">
        <div className="text-[rgb(15,23,42)]">Loading...</div>
      </div>
    );
  }

  // Wrap AppRoutes with user context and protection logic
  return <AppRoutes user={user} setUser={setUser} />;
}
export default App;