import { useState } from "react";
import type { FormEvent } from "react";
import styles from "./onboarding.module.css";
import { createHouseholdMember } from "./api";
import type { HouseholdMember, Relationship } from "./types";

interface AddFamilyMembersProps {
  members: HouseholdMember[];
  onMembersChange: (members: HouseholdMember[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

const RELATIONSHIPS: Relationship[] = ["spouse", "parent", "child", "sibling", "other"];

export function AddFamilyMembers({ members, onMembersChange, onBack, onContinue }: AddFamilyMembersProps) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("parent");
  const [otherLabel, setOtherLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const member = await createHouseholdMember(
        name.trim(),
        relationship,
        relationship === "other" ? otherLabel.trim() || undefined : undefined,
      );
      onMembersChange([...members, member]);
      setName("");
      setOtherLabel("");
    } catch {
      setError("Couldn't add that member. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1>Who else are you tracking for?</h1>

      <ul>
        {members.map((member) => (
          <li key={member.id}>{member.name}</li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className={styles.container}>
        <label className={styles.field}>
          Member's name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className={styles.field}>
          Relationship
          <select
            value={relationship}
            onChange={(event) => setRelationship(event.target.value as Relationship)}
          >
            {RELATIONSHIPS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {relationship === "other" && (
          <label className={styles.field}>
            Describe the relationship
            <input value={otherLabel} onChange={(event) => setOtherLabel(event.target.value)} />
          </label>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" disabled={adding}>
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      <div className={styles.actions}>
        <button type="button" onClick={onBack}>
          Back
        </button>
        <button type="button" disabled={members.length === 0} onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
