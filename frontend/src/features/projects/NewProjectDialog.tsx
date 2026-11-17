import { type FormEvent, useState } from "react";
import type { ExampleInfo, Profile } from "../../lib/types";

interface Props {
  examples: ExampleInfo[];
  onCreate: (name: string, profile: Profile, example?: string) => Promise<void>;
  onClose: () => void;
}

const PROFILES: { value: Profile; label: string; hint: string }[] = [
  { value: "legacy", label: "Legacy (FreeGLUT + GLU)", hint: "glBegin/glEnd, matris yığını, glutTimerFunc" },
  { value: "modern", label: "Modern (GLFW + GLAD, 3.3 core)", hint: "Shader, VAO/VBO/EBO" },
];

export function NewProjectDialog({ examples, onCreate, onClose }: Props) {
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<Profile>("legacy");
  const forProfile = examples.filter((e) => e.profile === profile);
  const [exampleId, setExampleId] = useState<string | undefined>(undefined);
  const selected = forProfile.find((e) => e.id === exampleId) ?? forProfile[0];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), profile, selected?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="np-title"
        onSubmit={submit}
        className="w-[28rem] rounded border border-border bg-surface p-4 shadow-lg"
      >
        <h2 id="np-title" className="mb-3 text-[15px] font-semibold">
          Yeni proje
        </h2>
        <label htmlFor="np-name" className="mb-1 block text-fg-muted">
          Proje adı
        </label>
        <input
          id="np-name"
          autoFocus
          required
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-describedby="np-help"
          className="h-8 w-full rounded border border-border bg-bg px-2 font-mono"
        />
        <p id="np-help" className="mt-1 text-[12px] text-fg-muted">
          Harf, rakam, - ve _ (en fazla 64 karakter)
        </p>
        <fieldset className="mt-3">
          <legend className="mb-1 text-fg-muted">Profil</legend>
          {PROFILES.map((p) => (
            <label key={p.value} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-surface-2">
              <input
                type="radio"
                name="profile"
                value={p.value}
                checked={profile === p.value}
                onChange={() => {
                  setProfile(p.value);
                  setExampleId(undefined); // yeni profilin varsayılan örneği
                }}
                className="mt-1"
              />
              <span>
                {p.label}
                <span className="block text-[12px] text-fg-muted">{p.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {forProfile.length > 0 && (
          <div className="mt-3">
            <label htmlFor="np-example" className="mb-1 block text-fg-muted">
              Örnek
            </label>
            <select
              id="np-example"
              value={selected?.id}
              onChange={(e) => setExampleId(e.target.value)}
              aria-describedby="np-example-desc"
              className="h-8 w-full rounded border border-border bg-bg px-2"
            >
              {forProfile.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} ({e.kind})
                </option>
              ))}
            </select>
            <p id="np-example-desc" className="mt-1 text-[12px] text-fg-muted">
              {selected?.description}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 cursor-pointer rounded px-3 hover:bg-surface-2">
            İptal
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-8 cursor-pointer rounded bg-accent px-3 font-medium text-on-accent disabled:opacity-40"
          >
            Oluştur
          </button>
        </div>
      </form>
    </div>
  );
}
