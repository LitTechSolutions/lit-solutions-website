import { useCallback, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { api } from "../api/client";
import type { CustomerDocument, CustomerMessage, DocumentStatus, DocumentType, MessageInboxRow } from "../api/types";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../auth/AuthContext";
import { isPlatformAdminRole } from "../auth/roles";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { StateScreen } from "../components/states/StateScreen";
import { strings } from "../strings/en";

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

const DOCUMENT_TYPES: DocumentType[] = ["invoice", "receipt", "paperwork", "other"];
const DOCUMENT_STATUSES: DocumentStatus[] = ["n/a", "unpaid", "paid"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Migrated from admin.html's "Customers" mega-screen -- deliberately kept
 * as one combined screen rather than split into separate Documents/
 * Messages/Notifications capabilities, since all three need the same
 * looked-up-customer context (admin.html already proved this is the
 * right shape: look up a customer once, then see/manage everything about
 * them in one place).
 */
export function CustomerSupport() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);

  if (!isPlatformAdmin) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.customerSupport.notPlatformAdminTitle}
        body={strings.customerSupport.notPlatformAdminBody}
      />
    );
  }

  return <StaffCustomerSupport />;
}

function StaffCustomerSupport() {
  const [current, setCurrent] = useState<{ email: string; name: string } | null>(null);
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupStatus, setLookupStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  async function lookupCustomer(email: string) {
    setLookingUp(true);
    setLookupStatus(null);
    try {
      const { customer } = await api.customerDocuments.listForCustomer(email);
      setCurrent({ email: customer.email, name: customer.name });
      setLookupStatus({ ok: true, text: strings.customerSupport.lookupFound(customer.name, customer.email) });
    } catch (err) {
      setCurrent(null);
      setLookupStatus({ ok: false, text: err instanceof Error ? err.message : strings.customerSupport.lookupNotFound });
    } finally {
      setLookingUp(false);
    }
  }

  function handleLookupSubmit(e: FormEvent) {
    e.preventDefault();
    const email = lookupEmail.trim();
    if (!email) return;
    lookupCustomer(email);
  }

  function handleOpenFromInbox(email: string) {
    setLookupEmail(email);
    lookupCustomer(email);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      <h1>{strings.customerSupport.title}</h1>

      <InboxCard onOpen={handleOpenFromInbox} />

      <div className="card" style={{ marginTop: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.05rem" }}>{strings.customerSupport.lookupHeading}</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem", marginTop: "var(--space-2)" }}>{strings.customerSupport.lookupIntro}</p>
        <form onSubmit={handleLookupSubmit} style={{ marginTop: "var(--space-3)" }}>
          <div className="field">
            <label htmlFor="support-lookup-email">{strings.customerSupport.lookupEmailLabel}</label>
            <input id="support-lookup-email" type="email" placeholder="customer@example.com" value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-small" disabled={lookingUp} style={{ marginTop: "var(--space-2)" }}>
            {strings.customerSupport.lookupButton}
          </button>
        </form>
        {lookupStatus ? (
          <p role={lookupStatus.ok ? "status" : "alert"} style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: lookupStatus.ok ? "var(--ink-soft)" : "var(--error-text)" }}>
            {lookupStatus.text}
          </p>
        ) : null}
      </div>

      {current ? (
        <>
          <MessagesCard key={`msg-${current.email}`} customerEmail={current.email} customerName={current.name} />
          <NotificationCard key={`notif-${current.email}`} customerEmail={current.email} />
          <DocumentsCard key={`docs-${current.email}`} customerEmail={current.email} customerName={current.name} />
        </>
      ) : null}
    </div>
  );
}

function InboxCard({ onOpen }: { onOpen: (email: string) => void }) {
  const fetchInbox = useCallback(() => api.staffMessages.inbox(), []);
  const state = useApi(fetchInbox, [], (data) => data.customers.length === 0);

  return (
    <div className="card" style={{ marginTop: "var(--space-4)" }}>
      <h2 style={{ fontSize: "1.05rem" }}>{strings.customerSupport.inboxHeading}</h2>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem", marginTop: "var(--space-2)" }}>{strings.customerSupport.inboxIntro}</p>
      {state.status === "loading" ? <Loading /> : null}
      {state.status === "expired" ? <SignInAgain /> : null}
      {state.status === "unauthorized" ? <UnauthorizedState /> : null}
      {state.status === "error" ? <ErrorState body={state.message} onRetry={state.retry} /> : null}
      {state.status === "empty" ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: "var(--space-3)" }}>{strings.customerSupport.inboxEmptyBody}</p>
      ) : null}
      {state.status === "success" ? (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          {state.data.customers.map((row: MessageInboxRow) => (
            <li key={row.customerId} className="card" style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>
                  {row.customerEmail}
                  {row.unreadCount ? (
                    <span style={{ color: "var(--accent-orange-text)", marginLeft: "var(--space-2)" }}>{strings.customerSupport.unreadSuffix(row.unreadCount)}</span>
                  ) : null}
                </strong>
                <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{row.lastMessageSnippet}</p>
              </div>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => onOpen(row.customerEmail)}>
                {strings.customerSupport.openButton}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MessagesCard({ customerEmail, customerName }: { customerEmail: string; customerName: string }) {
  const fetchThread = useCallback(() => api.staffMessages.threadFor(customerEmail), [customerEmail]);
  const state = useApi(fetchThread, [customerEmail]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSend() {
    const text = reply.trim();
    if (!text) {
      setSendError(strings.customerSupport.typeMessageFirst);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await api.staffMessages.sendTo(customerEmail, text);
      setReply("");
      state.retry();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : strings.customerSupport.messageErrorFallback);
    } finally {
      setSending(false);
    }
  }

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const messages: CustomerMessage[] = state.status === "success" ? state.data.messages : [];

  return (
    <div className="card" style={{ marginTop: "var(--space-4)" }}>
      <h2 style={{ fontSize: "1.05rem" }}>{strings.customerSupport.messagesHeadingFor(customerName)}</h2>
      {messages.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.85rem", marginTop: "var(--space-3)" }}>{strings.customerSupport.noMessagesYet}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-3)", maxHeight: 320, overflowY: "auto" }}>
          {messages.map((m) => (
            <li
              key={m.id}
              style={{
                alignSelf: m.from === "staff" ? "flex-end" : "flex-start",
                background: m.from === "staff" ? "var(--select-bg)" : "var(--paper-alt)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                padding: "var(--space-3)",
                maxWidth: "80%",
              }}
            >
              <p style={{ fontSize: "0.75rem", color: "var(--ink-faint)" }}>
                {m.from === "staff" ? strings.customerSupport.messageThreadYou : customerName} &middot; {new Date(m.createdAt).toLocaleString()}
              </p>
              <p style={{ marginTop: "var(--space-1)" }}>{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="support-reply-body">{strings.customerSupport.replyLabel}</label>
        <textarea id="support-reply-body" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary btn-small" disabled={sending} style={{ marginTop: "var(--space-2)" }} onClick={handleSend}>
        {sending ? strings.customerSupport.sending : strings.customerSupport.sendReplyButton}
      </button>
      {sendError ? (
        <p className="field-error" role="alert">
          {sendError}
        </p>
      ) : null}
    </div>
  );
}

function NotificationCard({ customerEmail }: { customerEmail: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSend() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setStatus({ ok: false, text: strings.customerSupport.notificationTitleRequired });
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      await api.staffNotifications.send(customerEmail, trimmedTitle, body.trim());
      setStatus({ ok: true, text: strings.customerSupport.notificationSent });
      setTitle("");
      setBody("");
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : strings.customerSupport.notificationErrorFallback });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: "var(--space-4)" }}>
      <h2 style={{ fontSize: "1.05rem" }}>{strings.customerSupport.notificationHeading}</h2>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem", marginTop: "var(--space-2)" }}>{strings.customerSupport.notificationIntro}</p>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="support-notif-title">{strings.customerSupport.notificationTitleLabel}</label>
        <input id="support-notif-title" type="text" placeholder={strings.customerSupport.notificationTitlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="support-notif-body">{strings.customerSupport.notificationDetailsLabel}</label>
        <textarea id="support-notif-body" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary btn-small" disabled={sending} style={{ marginTop: "var(--space-3)" }} onClick={handleSend}>
        {sending ? strings.customerSupport.sending : strings.customerSupport.notificationSendButton}
      </button>
      {status ? (
        <p role={status.ok ? "status" : "alert"} style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: status.ok ? "var(--ink-soft)" : "var(--error-text)" }}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}

function DocumentsCard({ customerEmail, customerName }: { customerEmail: string; customerName: string }) {
  const fetchDocs = useCallback(() => api.customerDocuments.listForCustomer(customerEmail), [customerEmail]);
  const state = useApi(fetchDocs, [customerEmail], (data) => data.documents.length === 0);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("invoice");
  const [amount, setAmount] = useState("");
  const [status, setStatusField] = useState<DocumentStatus>("n/a");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ ok: boolean; text: string } | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (f && f.size > 3.5 * 1024 * 1024) {
      setUploadStatus({ ok: false, text: strings.customerSupport.fileTooLarge });
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setUploadStatus({ ok: false, text: strings.customerSupport.documentTitleRequired });
      return;
    }
    setUploading(true);
    setUploadStatus(null);
    try {
      let fileDataUri: string | undefined;
      let fileName: string | undefined;
      if (file) {
        fileDataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        fileName = file.name;
      }
      await api.customerDocuments.upload({
        customerEmail,
        title: trimmedTitle,
        type,
        amount: amount.trim(),
        status,
        date,
        notes: notes.trim(),
        fileDataUri,
        fileName,
      });
      setUploadStatus({ ok: true, text: strings.customerSupport.documentUploaded });
      setTitle("");
      setAmount("");
      setNotes("");
      setFile(null);
      state.retry();
    } catch (err) {
      setUploadStatus({ ok: false, text: err instanceof Error ? err.message : strings.customerSupport.documentUploadErrorFallback });
    } finally {
      setUploading(false);
    }
  }

  const documents: CustomerDocument[] = state.status === "success" ? state.data.documents : [];

  return (
    <>
      <div className="card" style={{ marginTop: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.05rem" }}>{strings.customerSupport.documentUploadHeadingFor(customerName)}</h2>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="support-doc-title">{strings.customerSupport.documentTitleLabel}</label>
          <input id="support-doc-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="support-doc-type">{strings.customerSupport.documentTypeLabel}</label>
          <select id="support-doc-type" value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {strings.customerSupport.documentTypeLabels[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="support-doc-amount">{strings.customerSupport.documentAmountLabel}</label>
          <input id="support-doc-amount" type="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="support-doc-status">{strings.customerSupport.documentStatusLabel}</label>
          <select id="support-doc-status" value={status} onChange={(e) => setStatusField(e.target.value as DocumentStatus)}>
            {DOCUMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {strings.customerSupport.documentStatusLabels[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="support-doc-date">{strings.customerSupport.documentDateLabel}</label>
          <input id="support-doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="support-doc-notes">{strings.customerSupport.documentNotesLabel}</label>
          <textarea id="support-doc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="support-doc-file">{strings.customerSupport.documentFileLabel}</label>
          <input id="support-doc-file" type="file" accept="application/pdf,image/*" onChange={handleFileChange} />
        </div>
        <button type="button" className="btn btn-primary btn-small" disabled={uploading} style={{ marginTop: "var(--space-3)" }} onClick={handleUpload}>
          {uploading ? strings.customerSupport.documentUploading : strings.customerSupport.documentUploadButton}
        </button>
        {uploadStatus ? (
          <p role={uploadStatus.ok ? "status" : "alert"} style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: uploadStatus.ok ? "var(--ink-soft)" : "var(--error-text)" }}>
            {uploadStatus.text}
          </p>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.05rem" }}>{strings.customerSupport.documentListHeadingFor(customerName)}</h2>
        {state.status === "loading" ? <Loading /> : null}
        {state.status === "error" ? <ErrorState body={state.message} onRetry={state.retry} /> : null}
        {state.status === "empty" ? (
          <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: "var(--space-3)" }}>{strings.customerSupport.documentEmptyBody}</p>
        ) : null}
        {documents.length > 0 ? (
          <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            {documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onDeleted={state.retry} />
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}

function DocumentRow({ doc, onDeleted }: { doc: CustomerDocument; onDeleted: () => void }) {
  const [working, setWorking] = useState(false);
  const sub = [doc.date, doc.amount, doc.status !== "n/a" ? strings.customerSupport.documentStatusLabels[doc.status] : null].filter(Boolean).join(" · ");

  async function handleDelete() {
    if (!window.confirm(strings.customerSupport.documentDeleteConfirm(doc.title))) return;
    setWorking(true);
    try {
      await api.customerDocuments.remove(doc.id);
      onDeleted();
    } finally {
      setWorking(false);
    }
  }

  return (
    <li className="card" style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>
          {doc.title} <span style={{ color: "var(--ink-faint)", fontWeight: 400, fontSize: "0.85rem" }}>({strings.customerSupport.documentTypeLabels[doc.type]})</span>
        </strong>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{sub}</p>
      </div>
      <button type="button" className="btn btn-ghost btn-small" disabled={working} onClick={handleDelete}>
        {strings.customerSupport.documentDeleteButton}
      </button>
    </li>
  );
}
