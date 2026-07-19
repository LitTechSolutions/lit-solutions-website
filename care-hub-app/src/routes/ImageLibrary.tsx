import { useCallback, useState } from "react";
import type { ChangeEvent } from "react";
import { api } from "../api/client";
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

/**
 * Migrated from admin.html's "Image Library" tab -- a personal reference
 * library so a photo can be uploaded once and reused across posts/
 * portfolio items without re-uploading each time (see admin-images.js).
 */
export function ImageLibrary() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);

  if (!isPlatformAdmin) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.imageLibrary.notPlatformAdminTitle}
        body={strings.imageLibrary.notPlatformAdminBody}
      />
    );
  }

  return <StaffImageLibrary />;
}

function StaffImageLibrary() {
  const fetchImages = useCallback(() => api.imageLibrary.list(), []);
  const state = useApi(fetchImages, [], (data) => data.images.length === 0);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const images = state.status === "success" ? state.data.images : [];

  return (
    <div>
      <h1>{strings.imageLibrary.title}</h1>
      <p style={{ color: "var(--ink-soft)", marginTop: "var(--space-2)", maxWidth: "60ch" }}>{strings.imageLibrary.intro}</p>
      <UploadForm onUploaded={state.retry} />
      {images.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: "var(--space-4)" }}>{strings.imageLibrary.emptyBody}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          {images.map((img) => (
            <ImageRow key={img.id} image={img} onDeleted={state.retry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
    setStatus(null);
  }

  async function handleUpload() {
    if (!file) {
      setStatus({ ok: false, text: strings.imageLibrary.chooseFileFirst });
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      setStatus({ ok: false, text: strings.imageLibrary.imageTooLarge });
      return;
    }
    setUploading(true);
    setStatus({ ok: true, text: strings.imageLibrary.uploading });
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      await api.imageLibrary.upload(dataUri, alt);
      setStatus({ ok: true, text: strings.imageLibrary.uploadedStatus });
      setFile(null);
      setAlt("");
      onUploaded();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : strings.imageLibrary.uploadErrorFallback });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: "var(--space-4)" }}>
      <h2 style={{ fontSize: "1.05rem" }}>{strings.imageLibrary.uploadHeading}</h2>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="image-upload-file">{strings.imageLibrary.uploadHeading}</label>
        <input id="image-upload-file" type="file" accept="image/*" onChange={handleFileChange} />
      </div>
      <div className="field" style={{ marginTop: "var(--space-3)" }}>
        <label htmlFor="image-upload-alt">{strings.imageLibrary.altLabel}</label>
        <input id="image-upload-alt" type="text" value={alt} onChange={(e) => setAlt(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary btn-small" style={{ marginTop: "var(--space-3)" }} disabled={uploading} onClick={handleUpload}>
        {uploading ? strings.imageLibrary.uploading : strings.imageLibrary.uploadButton}
      </button>
      {status ? (
        <p role={status.ok ? "status" : "alert"} style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: status.ok ? "var(--ink-soft)" : "var(--error-text)" }}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}

function ImageRow({ image, onDeleted }: { image: { id: string; url: string | null; alt: string; caption: string; uploadedAt: number }; onDeleted: () => void }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(strings.imageLibrary.deleteConfirm)) return;
    setWorking(true);
    setError(null);
    try {
      await api.imageLibrary.remove(image.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.imageLibrary.deleteErrorFallback);
      setWorking(false);
    }
  }

  return (
    <li className="card" style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
      {image.url ? (
        <img src={image.url} alt="" loading="lazy" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius)", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 56, height: 56, borderRadius: "var(--radius)", background: "var(--line)", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{image.alt || strings.imageLibrary.noAltText}</strong>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
          {strings.imageLibrary.uploadedLabel} {new Date(image.uploadedAt).toLocaleDateString()}
        </p>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <button type="button" className="btn btn-ghost btn-small" disabled={working} onClick={handleDelete}>
        {working ? strings.imageLibrary.deletingStatus : strings.siteContent.deleteButton}
      </button>
    </li>
  );
}
