// web/src/components/ProfilePage.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Trash2, FileText } from 'lucide-react';
import { fetchProfile, uploadResume, deleteResume } from '../lib/api';

const ACCEPTED = '.pdf,.doc,.docx,.txt';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export default function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [email, setEmail]           = useState('');
  const [resumeName, setResumeName] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [removing, setRemoving]     = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  useEffect(() => {
    fetchProfile()
      .then(data => { setEmail(data.email); setResumeName(data.resumeName ?? null); })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('File exceeds 5 MB limit.'); return; }
    setError(''); setSuccess(''); setUploading(true);
    try {
      const data = await uploadResume(file);
      setResumeName(data.resumeName);
      setSuccess('Resume uploaded successfully.');
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleRemove() {
    setError(''); setSuccess(''); setRemoving(true);
    try {
      await deleteResume();
      setResumeName(null);
      setSuccess('Resume removed.');
    } catch (err) {
      setError(err.message || 'Failed to remove resume.');
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-chrome-muted text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">

      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[13px] text-chrome-muted hover:text-chrome-text transition-colors mb-6"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Back
      </button>

      <h1 className="font-display text-[22px] font-bold text-chrome-text tracking-tight mb-6">
        Profile
      </h1>

      {/* Email (read-only) */}
      <section className="mb-8">
        <h2 className="text-[11px] font-semibold text-chrome-muted uppercase tracking-[0.08em] mb-3">Account</h2>
        <div className="bg-chrome-surface border border-chrome-border rounded-xl px-4 py-3 text-[13px] text-chrome-text">
          {email}
        </div>
      </section>

      {/* Resume */}
      <section>
        <h2 className="text-[11px] font-semibold text-chrome-muted uppercase tracking-[0.08em] mb-3">Resume</h2>
        <p className="text-[12px] text-chrome-muted mb-4 leading-relaxed">
          Your resume is used by Draft AI to personalize outreach emails. Accepts PDF, DOCX, or TXT up to 5 MB.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-600">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-[12px] text-green-700">
            {success}
          </div>
        )}

        {resumeName ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl">
            <FileText size={16} strokeWidth={1.75} className="text-accent flex-shrink-0" />
            <span className="flex-1 text-[13px] font-medium text-chrome-text truncate">{resumeName}</span>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center gap-1.5 text-[12px] text-red-500 hover:text-red-600 transition-colors disabled:opacity-50 flex-shrink-0 font-medium"
            >
              <Trash2 size={13} strokeWidth={2} />
              {removing ? 'Removing…' : 'Remove'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-[12px] text-accent hover:text-accent-hover transition-colors disabled:opacity-50 flex-shrink-0 font-medium"
            >
              <Upload size={13} strokeWidth={2} />
              {uploading ? 'Uploading…' : 'Replace'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed border-chrome-border rounded-xl text-chrome-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            <Upload size={20} strokeWidth={1.75} />
            <span className="text-[13px] font-medium">
              {uploading ? 'Uploading…' : 'Click to upload resume'}
            </span>
            <span className="text-[11px]">PDF, DOCX, or TXT · max 5 MB</span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={handleFileChange}
        />
      </section>
    </div>
  );
}
