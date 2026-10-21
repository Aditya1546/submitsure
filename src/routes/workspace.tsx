import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmedFieldsEditor } from "@/components/ConfirmedFieldsEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/NotConnected";
import { VERIFICATION_STATES } from "@/lib/verification/contract";
import { useVerification } from "@/lib/verification/VerificationProvider";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Verification workspace — SubmitSure" },
      {
        name: "description",
        content:
          "Upload documents, review manually entered fields, and track verification progress.",
      },
      { property: "og:title", content: "Verification workspace — SubmitSure" },
      { property: "og:description", content: "Document upload, field confirmation and progress." },
    ],
  }),
  component: Workspace,
});

function Workspace() {
  const {
    session,
    report,
    streamStatus,
    manualFields,
    setManualFields,
    uploadDocument,
    submitManualFields,
    confirmFields,
    editConfirmedFields,
    isMutating,
    errorMessage,
    notice,
    clearMessages,
    sessionExpired,
  } = useVerification();
  const [requirementId, setRequirementId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    if (!session || Object.keys(manualFields).length > 0) return;
    if (session.field_names.length > 0) {
      setManualFields(Object.fromEntries(session.field_names.map((name) => [name, ""])));
    } else if (session.state === "UPLOADED") {
      setManualFields({ name: "" });
    }
  }, [manualFields, session, setManualFields]);

  const fieldEntries = useMemo(() => Object.entries(manualFields), [manualFields]);
  const validFields =
    fieldEntries.length > 0 && fieldEntries.every(([key, value]) => key.trim() && value.trim());

  const run = async (action: () => Promise<void>) => {
    clearMessages();
    setBusy(true);
    try {
      await action();
    } catch {
      // The shared session panel displays the backend error.
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Verification workspace"
        subtitle="Upload documents, enter the fields manually, and confirm them before generating a report."
      />
      {!session ? (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Create a session to begin the verification workflow.
          </p>
          <Button asChild className="mt-4">
            <Link to="/setup">Create a session</Link>
          </Button>
        </div>
      ) : (
        <>
          {(errorMessage || notice || sessionExpired) && (
            <div className="mb-5 space-y-2">
              {errorMessage && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {errorMessage}
                </p>
              )}
              {notice && (
                <p role="status" className="rounded-md border bg-muted p-3 text-sm">
                  {notice}
                </p>
              )}
              {sessionExpired && (
                <Button asChild variant="outline">
                  <Link to="/setup">Create a new session</Link>
                </Button>
              )}
            </div>
          )}

          <section className="mb-6 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Current application
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold">
                  {session.application_name}
                </h2>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  Session {session.session_id}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 font-mono text-xs">
                <span className="rounded-md border bg-muted px-2.5 py-1">
                  State: {session.state ?? "NOT STARTED"}
                </span>
                <span className="rounded-md border bg-muted px-2.5 py-1">
                  Packet v{session.packet_version}
                </span>
                <span className="rounded-md border bg-muted px-2.5 py-1">
                  Events: {streamStatus}
                </span>
              </div>
            </div>
            <ol className="mt-5 flex flex-wrap gap-2 font-mono text-[11px]">
              {VERIFICATION_STATES.map((state) => (
                <li
                  key={state}
                  className={`rounded-md border px-2 py-1 ${session.state === state ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                >
                  {state}
                </li>
              ))}
            </ol>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-display text-lg font-semibold">Document upload</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The document is sent directly to the server for hashing; the backend does not retain
                its contents.
              </p>
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!file || !requirementId) return;
                  void run(async () => {
                    await uploadDocument(requirementId, file);
                    setFile(null);
                    const input = document.getElementById(
                      "document-file",
                    ) as HTMLInputElement | null;
                    if (input) input.value = "";
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="document-requirement">Document requirement</Label>
                  <select
                    id="document-requirement"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={requirementId}
                    onChange={(event) => setRequirementId(event.target.value)}
                    required
                  >
                    <option value="">Choose a requirement</option>
                    {session.requirement_set.requirements.map((requirement) => (
                      <option key={requirement.id} value={requirement.id}>
                        {requirement.label}
                        {session.documents[requirement.id] ? " · uploaded" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document-file">Select a document</Label>
                  <Input
                    id="document-file"
                    type="file"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!file || !requirementId || busy || isMutating || sessionExpired}
                >
                  <Upload /> {busy ? "Uploading…" : "Upload document"}
                </Button>
              </form>
              <ul className="mt-5 divide-y rounded-lg border">
                {session.requirement_set.requirements.map((requirement) => {
                  const document = session.documents[requirement.id];
                  return (
                    <li
                      key={requirement.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <span>{requirement.label}</span>
                      <span className={document ? "text-success" : "text-muted-foreground"}>
                        {document ? `Uploaded · ${document.size} bytes` : "Not uploaded"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-display text-lg font-semibold">Manual field entry</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the required values yourself. They are sent only to the in-memory verification
                session.
              </p>
              {session.state === "UPLOADED" || session.state === "AWAITING_CONFIRMATION" ? (
                <>
                  <div className="mt-4 space-y-3">
                    {fieldEntries.map(([key, value]) => (
                      <div
                        key={key}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
                      >
                        <div className="space-y-1">
                          <Label htmlFor={`field-${key}`}>{key}</Label>
                          <Input
                            id={`field-${key}`}
                            value={value}
                            onChange={(event) =>
                              setManualFields({ ...manualFields, [key]: event.target.value })
                            }
                            placeholder={`Enter ${key}`}
                            autoComplete="off"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${key}`}
                          onClick={() => {
                            const next = { ...manualFields };
                            delete next[key];
                            setManualFields(next);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = newFieldName.trim();
                      if (!name || name in manualFields) return;
                      setManualFields({ ...manualFields, [name]: "" });
                      setNewFieldName("");
                    }}
                  >
                    <Input
                      aria-label="New field name"
                      value={newFieldName}
                      onChange={(event) => setNewFieldName(event.target.value)}
                      placeholder="Add another field"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={!newFieldName.trim() || newFieldName in manualFields}
                    >
                      <Plus /> Add
                    </Button>
                  </form>
                  {session.state === "UPLOADED" ? (
                    <Button
                      className="mt-4"
                      disabled={!validFields || busy || isMutating || sessionExpired}
                      onClick={() =>
                        void run(() => submitManualFields(Object.fromEntries(fieldEntries)))
                      }
                    >
                      {busy ? "Submitting…" : "Submit fields for confirmation"}
                    </Button>
                  ) : (
                    <>
                      {report && !report.valid && (
                        <p className="mt-4 rounded-md border bg-muted p-3 text-sm">
                          Confirmed fields were edited. The backend invalidated the previous report
                          (packet v{report.packet_version}); confirm the values again to continue.
                        </p>
                      )}
                      <div className="mt-4 flex items-start gap-2">
                        <Checkbox
                          id="confirm-reviewed"
                          checked={reviewed}
                          onCheckedChange={(checked) => setReviewed(checked === true)}
                        />
                        <Label htmlFor="confirm-reviewed" className="text-sm font-normal leading-snug">
                          I have reviewed these field names and values and they are correct.
                        </Label>
                      </div>
                      <Button
                        className="mt-4"
                        disabled={
                          !validFields || !reviewed || busy || isMutating || sessionExpired
                        }
                        onClick={() =>
                          void run(async () => {
                            await confirmFields(Object.fromEntries(fieldEntries));
                            setReviewed(false);
                          })
                        }
                      >
                        {busy ? "Confirming…" : "Confirm these fields"}
                      </Button>
                    </>
                  )}
                </>
              ) : session.state === "VERIFIED" || session.state === "REPORT_READY" ? (
                editing ? (
                  <ConfirmedFieldsEditor
                    fieldNames={session.field_names}
                    disabled={isMutating || sessionExpired}
                    onCancel={() => setEditing(false)}
                    onSubmit={async (fields) => {
                      clearMessages();
                      await editConfirmedFields(fields);
                      setReviewed(false);
                      setEditing(false);
                    }}
                  />
                ) : (
                  <div className="mt-4 rounded-lg border bg-muted/40 p-4 text-sm">
                    <p className="font-medium">Fields confirmed by the backend</p>
                    <p className="mt-1 text-muted-foreground">
                      Field names: {session.field_names.join(", ") || "Not available"}
                    </p>
                    {report && !report.valid && (
                      <p className="mt-2 text-warning-foreground">
                        The backend marks the existing report as invalid.
                      </p>
                    )}
                    <Button
                      className="mt-4"
                      variant="outline"
                      disabled={busy || isMutating || sessionExpired}
                      onClick={() => {
                        clearMessages();
                        setEditing(true);
                      }}
                    >
                      <Pencil /> Edit confirmed fields
                    </Button>
                  </div>
                )
              ) : (
                <p className="mt-4 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Upload at least one required document before entering verification fields.
                </p>
              )}
            </section>

            <section className="rounded-xl border bg-card p-5 md:col-span-2">
              <h2 className="font-display text-lg font-semibold">Verification progress</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Current values are read from the server. Event sequence {session.sequence}; packet
                version {session.packet_version}; requirement-set version{" "}
                {session.requirement_set_version}.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {session.state === "VERIFIED" && (
                  <Button asChild>
                    <Link to="/report">Generate readiness report</Link>
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link to="/events">View event history</Link>
                </Button>
                {report && (
                  <Button asChild variant="outline">
                    <Link to="/report">View report{report.valid ? "" : " (invalidated)"}</Link>
                  </Button>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
