import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
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

export function AddFamilyMembers({
  members,
  onMembersChange,
  onBack,
  onContinue,
}: AddFamilyMembersProps) {
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
        relationship === "other" ? otherLabel.trim() || undefined : undefined
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
      <h1 className={styles.title}>Who else are you tracking for?</h1>
      <p className={styles.subtitle}>
        Add family members to enable family aggregate views and independent per-member statements.
      </p>

      {/* Added Members Roster */}
      {members.length > 0 && (
        <div className={styles.trustCardGroup}>
          <span className="type-caption">Added Family Members ({members.length})</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {members.map((member) => (
              <div
                key={member.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  background: "var(--color-surface)",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <span className="type-body-medium">{member.name}</span>
                <Badge variant="neutral">{member.relationship}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member Form */}
      <form onSubmit={handleAdd} className={styles.field} style={{ gap: "var(--space-4)" }}>
        <div className={styles.field}>
          <label htmlFor="member-name">Member's Full Name</label>
          <input
            id="member-name"
            value={name}
            placeholder="e.g. Sunita Karnawat"
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="member-rel">Relationship</label>
          <select
            id="member-rel"
            value={relationship}
            onChange={(event) => setRelationship(event.target.value as Relationship)}
          >
            {RELATIONSHIPS.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {relationship === "other" && (
          <div className={styles.field}>
            <label htmlFor="other-label">Describe Relationship</label>
            <input
              id="other-label"
              value={otherLabel}
              placeholder="e.g. Uncle, In-law"
              onChange={(event) => setOtherLabel(event.target.value)}
            />
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <Button variant="secondary" size="md" type="submit" disabled={adding || !name.trim()}>
          {adding ? "Adding..." : "+ Add Member"}
        </Button>
      </form>

      <div className={styles.actionsBetween}>
        <Button variant="ghost" size="sm" type="button" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          size="md"
          type="button"
          disabled={members.length === 0}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
