"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export type ResourceInput = {
  name: string;
  type: ResourceType;
  description: string;
  capacity: number;
  isActive: boolean;
};

export type ResourceType = "room" | "equipment" | "workstation" | "other";

type Props = {
  initialValues?: ResourceInput;
  submitLabel: string;
  onSubmit: (values: ResourceInput) => Promise<void>;
};

export default function ResourceForm({
  initialValues = { name: "", type: "room", description: "", capacity: 1, isActive: true },
  submitLabel,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialValues.name);
  const [type, setType] = useState<ResourceType>(initialValues.type);
  const [description, setDescription] = useState(initialValues.description);
  const [capacity, setCapacity] = useState(String(initialValues.capacity));
  const [isActive, setIsActive] = useState(initialValues.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a resource name.");
      return;
    }

    const parsedCapacity = Number(capacity);
    
    if (
      !Number.isSafeInteger(parsedCapacity) ||
      parsedCapacity < 1 ||
      parsedCapacity > 10000
    ) {
      setError("Capacity must be a whole number between 1 and 10,000.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSubmit({
        name: name.trim(),
        type,
        description: description.trim(),
        capacity: parsedCapacity,
        isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save resource.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">Resource name</span>
        <input
          required
          maxLength={160}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          placeholder="e.g. Conference Room A"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">
          Resource type
        </span>

        <select
          required
          value={type}
          onChange={(event) =>
            setType(event.target.value as ResourceType)
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="room">Room</option>
          <option value="equipment">Equipment</option>
          <option value="workstation">Workstation</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">Description</span>
        <textarea
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={saving}
          placeholder="Describe the resource and its intended use"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">Capacity</span>
        <input
          required
          type="number"
          min={1}
          step={1}
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          disabled={saving}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
      </label>

      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          disabled={saving}
          className="h-4 w-4 accent-blue-600"
        />
        Active — available for new reservations
      </label>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          href="/resources"
          className="inline-flex justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}