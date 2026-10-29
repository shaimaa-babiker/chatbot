"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatbotTag, ChatbotTagCategory } from "@/types/types";
import { toast } from "sonner";
import { useState, type FormEvent } from "react";

type TagDraft = Omit<ChatbotTag, "id">;

const categoryLabels: Record<ChatbotTagCategory, string> = {
  product: "Product",
  service: "Service",
  opportunity: "Opportunity",
};

const emptyDraft: TagDraft = {
  name: "",
  purpose: "",
  category: "product",
};

export default function ChatbotTags({
  chatbotId,
  initialTags,
}: {
  chatbotId: number;
  initialTags: ChatbotTag[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [newTag, setNewTag] = useState<TagDraft>(emptyDraft);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TagDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  async function saveTag(
    event: FormEvent<HTMLFormElement>,
    tagId?: number,
  ) {
    event.preventDefault();
    const draft = tagId ? editDraft : newTag;
    setSaving(true);
    try {
      const response = await fetch(
        tagId
          ? `/api/chatbots/${chatbotId}/tags/${tagId}`
          : `/api/chatbots/${chatbotId}/tags`,
        {
          method: tagId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to save tag");
      if (tagId) {
        setTags((current) =>
          current.map((tag) => (tag.id === tagId ? result : tag)),
        );
        setEditingTagId(null);
        toast.success("Tag updated");
      } else {
        setTags((current) => [...current, result]);
        setNewTag(emptyDraft);
        toast.success("Tag added");
      }
    } catch (error) {
      console.error("Error saving chatbot tag:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save tag");
    } finally {
      setSaving(false);
    }
  }

  async function removeTag(tagId: number) {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/chatbots/${chatbotId}/tags/${tagId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Failed to remove tag");
      }
      setTags((current) => current.filter((tag) => tag.id !== tagId));
      toast.success("Tag removed");
    } catch (error) {
      console.error("Error removing chatbot tag:", error);
      toast.error(error instanceof Error ? error.message : "Failed to remove tag");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(tag: ChatbotTag) {
    setEditingTagId(tag.id);
    setEditDraft({
      name: tag.name,
      purpose: tag.purpose,
      category: tag.category,
    });
  }

  function renderDraftFields(
    draft: TagDraft,
    setDraft: (value: TagDraft) => void,
  ) {
    return (
      <>
        <label className="grid gap-1 text-sm font-medium">
          Tag name
          <Input
            required
            maxLength={50}
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
            placeholder="For example: Premium plan"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          What should this tag identify?
          <textarea
            required
            maxLength={300}
            value={draft.purpose}
            onChange={(event) =>
              setDraft({ ...draft, purpose: event.target.value })
            }
            placeholder="Apply when a customer asks about the Premium plan, its features, or its price."
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Category
          <select
            value={draft.category}
            onChange={(event) =>
              setDraft({
                ...draft,
                category: event.target.value as ChatbotTagCategory,
              })
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal"
          >
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4 md:p-6">
      <h2 className="text-lg font-bold">Message tags</h2>
      <p className="mt-1 text-sm text-gray-600">
        Add labels the AI can recognize in customer messages. Give each tag a
        clear purpose so the AI knows when to use it; the selected category is
        then applied automatically. For example, add “Premium plan,” explain
        that it matches questions about Premium features or pricing, and set
        its category to Product.
      </p>
      <form
        onSubmit={(event) => saveTag(event)}
        className="mt-4 grid gap-3 rounded-lg bg-gray-50 p-4 md:grid-cols-2"
      >
        {renderDraftFields(newTag, setNewTag)}
        <div className="md:col-span-2">
          <Button type="submit" disabled={saving}>
            Add tag
          </Button>
        </div>
      </form>

      {tags.length ? (
        <ul className="mt-4 divide-y rounded-lg border">
          {tags.map((tag) => (
            <li key={tag.id} className="p-4">
              {editingTagId === tag.id ? (
                <form
                  onSubmit={(event) => saveTag(event, tag.id)}
                  className="grid gap-3 md:grid-cols-2"
                >
                  {renderDraftFields(editDraft, setEditDraft)}
                  <div className="flex gap-2 md:col-span-2">
                    <Button type="submit" disabled={saving}>
                      Save tag
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingTagId(null)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{tag.name}</h3>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                        {categoryLabels[tag.category]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{tag.purpose}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => beginEdit(tag)}
                      disabled={saving}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void removeTag(tag.id)}
                      disabled={saving}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-gray-500">
          No tags yet. Add tags that describe the products, services, or
          opportunities customers ask about.
        </p>
      )}
    </section>
  );
}
