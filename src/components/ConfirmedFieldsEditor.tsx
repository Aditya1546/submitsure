import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface FieldDraftRow {
  id: number;
  name: string;
  value: string;
}

export function validateFieldDraft(
  rows: FieldDraftRow[],
): { fields: Record<string, string> } | { error: string } {
  if (rows.length === 0) return { error: "Keep at least one field." };
  const fields: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name) return { error: "Every field needs a name." };
    if (!value) return { error: `Enter a value for "${name}".` };
    if (name in fields) return { error: `The field name "${name}" is used more than once.` };
    fields[name] = value;
  }
  return { fields };
}

interface ConfirmedFieldsEditorProps {
  fieldNames: string[];
  disabled: boolean;
  onSubmit: (fields: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}

export function ConfirmedFieldsEditor({
  fieldNames,
  disabled,
  onSubmit,
  onCancel,
}: ConfirmedFieldsEditorProps) {
  const [rows, setRows] = useState<FieldDraftRow[]>(() =>
    (fieldNames.length > 0 ? fieldNames : [""]).map((name, id) => ({ id, name, value: "" })),
  );
  const [nextId, setNextId] = useState(rows.length);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateRow = (id: number, patch: Partial<FieldDraftRow>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <form
      className="mt-4 space-y-3"
      aria-label="Edit confirmed fields"
      onSubmit={(event) => {
        event.preventDefault();
        const result = validateFieldDraft(rows);
        if ("error" in result) {
          setValidationError(result.error);
          return;
        }
        setValidationError(null);
        setSubmitting(true);
        void onSubmit(result.fields)
          .catch(() => undefined)
          .finally(() => setSubmitting(false));
      }}
    >
      <p className="text-sm text-muted-foreground">
        The backend does not return stored values, so re-enter each value. Saving sends the edit to
        the server, invalidates any existing report, and returns the session to confirmation.
      </p>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
        >
          <div className="space-y-1">
            <Label htmlFor={`edit-name-${row.id}`}>Field name</Label>
            <Input
              id={`edit-name-${row.id}`}
              value={row.name}
              onChange={(event) => updateRow(row.id, { name: event.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`edit-value-${row.id}`}>Value</Label>
            <Input
              id={`edit-value-${row.id}`}
              value={row.value}
              onChange={(event) => updateRow(row.id, { value: event.target.value })}
              placeholder={row.name ? `Enter ${row.name}` : "Enter value"}
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${row.name || "field"}`}
            onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setRows((current) => [...current, { id: nextId, name: "", value: "" }]);
          setNextId((id) => id + 1);
        }}
      >
        <Plus /> Add field
      </Button>
      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={disabled || submitting}>
          {submitting ? "Saving…" : "Save edits"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
