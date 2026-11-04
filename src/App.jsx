import { AuthProvider } from "./AuthContext";
import StudyTracker from "./StudyTracker";

export default function App() {
  return (
    <AuthProvider>
      <StudyTracker />
    </AuthProvider>
  );
}
