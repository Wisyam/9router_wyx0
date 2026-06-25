"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardSkeleton,
  Badge,
  Button,
  Toggle,
  Modal,
  Input,
  ConfirmModal,
  Select,
} from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useNotificationStore } from "@/store/notificationStore";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { getRelativeTime } from "@/shared/utils";

export default function PromptFiltersPage() {
  const [filters, setFilters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingFilter, setEditingFilter] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const notify = useNotificationStore();

  const searchQuery = useHeaderSearchStore((s) => s.query);
  const registerSearch = useHeaderSearchStore((s) => s.register);
  const unregisterSearch = useHeaderSearchStore((s) => s.unregister);

  useEffect(() => {
    registerSearch("Search filters...");
    return () => unregisterSearch();
  }, [registerSearch, unregisterSearch]);

  const matchSearch = (filter) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (filter.name || "").toLowerCase().includes(q) ||
      (filter.pattern || "").toLowerCase().includes(q) ||
      (filter.replacement || "").toLowerCase().includes(q) ||
      (filter.provider || "").toLowerCase().includes(q)
    );
  };

  const fetchData = async () => {
    try {
      const res = await fetch("/api/prompt-filters");
      const data = await res.json();
      if (res.ok) {
        setFilters(data.filters || []);
      }
    } catch (error) {
      console.error("Error fetching filters:", error);
      notify.error("Failed to load prompt filters");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (data) => {
    try {
      const res = await fetch("/api/prompt-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        notify.success("Filter created successfully");
        await fetchData();
        setShowModal(false);
      } else {
        const err = await res.json();
        notify.error(err.error || "Failed to create filter");
      }
    } catch (error) {
      console.error("Error creating filter:", error);
      notify.error("Network error while creating filter");
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      const res = await fetch(`/api/prompt-filters/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        notify.success("Filter updated successfully");
        await fetchData();
        setEditingFilter(null);
        setShowModal(false);
      } else {
        const err = await res.json();
        notify.error(err.error || "Failed to update filter");
      }
    } catch (error) {
      console.error("Error updating filter:", error);
      notify.error("Network error while updating filter");
    }
  };

  const handleDelete = (id) => {
    setConfirmState({
      title: "Delete Prompt Filter",
      message:
        "Are you sure you want to delete this prompt filter? This action cannot be undone.",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/prompt-filters/${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            setFilters(filters.filter((f) => f.id !== id));
            notify.success("Filter deleted successfully");
          } else {
            const err = await res.json();
            notify.error(err.error || "Failed to delete filter");
          }
        } catch (error) {
          console.error("Error deleting filter:", error);
          notify.error("Network error while deleting filter");
        }
      },
    });
  };

  const handleToggle = async (id, isActive) => {
    // Optimistic update
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isActive } : f)),
    );
    try {
      const res = await fetch(`/api/prompt-filters/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        // Revert on error
        setFilters((prev) =>
          prev.map((f) => (f.id === id ? { ...f, isActive: !isActive } : f)),
        );
        notify.error("Failed to toggle filter");
      }
    } catch (error) {
      console.error("Error toggling filter:", error);
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, isActive: !isActive } : f)),
      );
      notify.error("Network error while toggling filter");
    }
  };

  const openEditModal = (filter) => {
    setEditingFilter(filter);
    setShowModal(true);
  };

  const closeEditModal = () => {
    setEditingFilter(null);
    setShowModal(false);
  };

  const visibleFilters = filters.filter(matchSearch).sort((a, b) => {
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">
            Prompt Filters
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Intercept and modify prompts before they reach the provider.
          </p>
        </div>
        <Button
          icon="add"
          onClick={() => {
            setEditingFilter(null);
            setShowModal(true);
          }}
          className="w-full sm:w-auto whitespace-nowrap"
        >
          Add Filter
        </Button>
      </div>

      {/* Empty State */}
      {filters.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">
                filter_alt
              </span>
            </div>
            <p className="text-text-main font-medium mb-1">
              No prompt filters yet
            </p>
            <p className="text-sm text-text-muted mb-4">
              Create filters to modify prompts dynamically
            </p>
            <Button
              icon="add"
              onClick={() => {
                setEditingFilter(null);
                setShowModal(true);
              }}
              className="w-full sm:w-auto mx-auto"
            >
              Add Filter
            </Button>
          </div>
        </Card>
      ) : visibleFilters.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <span className="material-symbols-outlined text-[32px] text-text-muted mb-2">
            search_off
          </span>
          <p className="text-text-muted text-sm">
            No filters match your search
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFilters.map((filter) => (
            <FilterCard
              key={filter.id}
              filter={filter}
              onEdit={() => openEditModal(filter)}
              onDelete={() => handleDelete(filter.id)}
              onToggle={(active) => handleToggle(filter.id, active)}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      <FilterFormModal
        key={showModal ? editingFilter?.id || "new" : "closed"}
        isOpen={showModal}
        filter={editingFilter}
        onClose={closeEditModal}
        onSave={(data) =>
          editingFilter
            ? handleUpdate(editingFilter.id, data)
            : handleCreate(data)
        }
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </div>
  );
}

function FilterCard({ filter, onEdit, onDelete, onToggle }) {
  return (
    <Card
      padding="sm"
      className={`group h-full flex flex-col hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors ${!filter.isActive ? "opacity-60 grayscale-[0.5]" : ""}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3 mb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="truncate font-semibold text-sm">
              {filter.name || "Unnamed Filter"}
            </h3>
            {!filter.isActive && (
              <Badge variant="default" size="sm">
                Disabled
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            {filter.provider === "global" ? (
              <Badge variant="secondary" size="sm">
                Global
              </Badge>
            ) : (
              <div className="flex items-center gap-1 text-text-muted">
                <div className="size-4 rounded flex items-center justify-center bg-black/5 dark:bg-white/5">
                  <ProviderIcon
                    src={`/providers/${filter.provider}.png`}
                    alt={filter.provider}
                    size={12}
                    className="object-contain max-w-[12px] max-h-[12px]"
                    fallbackText={filter.provider.slice(0, 2).toUpperCase()}
                  />
                </div>
                <span className="truncate max-w-[100px]">
                  {filter.provider}
                </span>
              </div>
            )}
            <span className="text-text-muted/50">•</span>
            <span className="text-text-muted">
              Priority {filter.priority || 0}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <Toggle
            size="sm"
            checked={filter.isActive}
            onChange={(e) => onToggle(e.target.checked)}
            title={filter.isActive ? "Disable filter" : "Enable filter"}
          />
        </div>
      </div>

      {/* Pattern & Replacement Visual */}
      <div className="flex-1 flex flex-col gap-2 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-border p-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
            Find
          </span>
          <code className="text-xs font-mono text-red-600 dark:text-red-400 break-all line-clamp-2 bg-red-500/10 px-1.5 py-0.5 rounded">
            {filter.pattern}
          </code>
        </div>
        <div className="flex items-center justify-center -my-1 text-text-muted/40">
          <span className="material-symbols-outlined text-[16px]">
            arrow_downward
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
            Replace
          </span>
          <code className="text-xs font-mono text-green-600 dark:text-green-400 break-all line-clamp-2 bg-green-500/10 px-1.5 py-0.5 rounded">
            {filter.replacement || '"" (Empty)'}
          </code>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <span className="text-xs text-text-muted/60" title={filter.updatedAt}>
          {filter.updatedAt ? getRelativeTime(filter.updatedAt) : "Just now"}
        </span>
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Edit"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <span className="material-symbols-outlined text-[16px]">
              delete
            </span>
          </button>
        </div>
      </div>
    </Card>
  );
}

function FilterFormModal({ isOpen, filter, onClose, onSave }) {
  const isEdit = !!filter;
  const [formData, setFormData] = useState({
    name: filter?.name || "",
    provider: filter?.provider || "codebuddy-cn",
    pattern: filter?.pattern || "",
    replacement: filter?.replacement || "",
    priority: filter?.priority || 0,
    isActive: filter?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const providerOptions = [
    { value: "codebuddy-cn", label: "CodeBuddy CN (codebuddy-cn)" },
  ];

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.pattern) newErrors.pattern = "Pattern is required";
    if (!formData.provider) newErrors.provider = "Provider is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      ...formData,
      priority: parseInt(formData.priority, 10) || 0,
    });
    setSaving(false);
  };

  // Check if provider is a predefined one
  const isCustomProvider = !providerOptions.some(
    (o) => o.value === formData.provider,
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Prompt Filter" : "Add Prompt Filter"}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Status</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">
              {formData.isActive ? "Active" : "Inactive"}
            </span>
            <Toggle
              checked={formData.isActive}
              onChange={(e) => handleChange("isActive", e.target.checked)}
            />
          </div>
        </div>

        <Input
          label="Name (Optional)"
          value={formData.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="e.g. Strip System Prompt"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Provider</label>
          <Select
            value={isCustomProvider ? "custom" : formData.provider}
            onChange={(e) => {
              if (e.target.value !== "custom") {
                handleChange("provider", e.target.value);
              } else {
                handleChange("provider", "");
              }
            }}
            options={[
              ...providerOptions,
              { value: "custom", label: "Custom Provider ID..." },
            ]}
            error={errors.provider}
          />
          {isCustomProvider && (
            <div className="mt-1">
              <Input
                placeholder="Enter provider ID (e.g. vertex)"
                value={formData.provider}
                onChange={(e) => handleChange("provider", e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">
            Pattern (Regex) <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-main placeholder-text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] font-mono resize-y"
            value={formData.pattern}
            onChange={(e) => handleChange("pattern", e.target.value)}
            placeholder="Text to find..."
          />
          {errors.pattern && (
            <span className="text-xs text-red-500">{errors.pattern}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Replacement</label>
          <textarea
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-main placeholder-text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] font-mono resize-y"
            value={formData.replacement}
            onChange={(e) => handleChange("replacement", e.target.value)}
            placeholder="Text to replace with (leave empty to delete pattern)"
          />
        </div>

        <div>
          <Input
            label="Priority"
            type="number"
            value={formData.priority}
            onChange={(e) => handleChange("priority", e.target.value)}
            placeholder="0"
          />
          <p className="text-[10px] text-text-muted mt-0.5">
            Lower numbers run first
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button onClick={onClose} variant="ghost" fullWidth size="sm">
            Cancel
          </Button>
          <Button onClick={handleSave} fullWidth size="sm" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Filter"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
