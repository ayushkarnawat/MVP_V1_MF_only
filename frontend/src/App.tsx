import { ImportFlow } from "./features/import/ImportFlow";

function App() {
  return (
    <div>
      <header>
        <h2>Unifolio</h2>
      </header>
      {/* Phase 1b standalone screen — already non-functional without auth (known state).
          Task 11 replaces this file with the AuthProvider composition root. */}
      <ImportFlow householdMemberId="" />
    </div>
  );
}

export default App;
